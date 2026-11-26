/**
 * Tools → Profile Report: what is IN a video, looked at frame by frame the way a picture is.
 *
 * The video reader (OCR_SERVICE_URL /extract with a video_url) gives one free-form summary of a clip from about ten small frames,
 * and it misses things that matter: on a real post it described an AK-pattern rifle lying on a pile of leaves as "a knife or cutting
 * tool", so the post was rated Risk Low with no weapon flag. Sending the whole video to the vision model with our picture questions was
 * no better (it answered "none" to a direct question about weapons on the same video, and called a knife in a fantasy film a weapon).
 * What does work is what pictures already get: single frames shown to the vision model with the tuned picture questions.
 * Measured on that video: with 16 evenly spaced frames the rifle was flagged `weapon` on the 2 frames it was clearly in, with 24 on 4,
 * with 12 on none (it is blurred or half covered in most frames), and never on footage without one; a stray alert (a pile of leaves
 * called "a person trapped") appeared on single frames only. A neutral yes/no question on each frame found the same two frames; a
 * leading one ("is a firearm visible, even partly covered?") said yes to every frame of leaves, so it is not used.
 *
 * So: download the clip, cut frames about 2.5 seconds apart with ffmpeg, describe each frame in turn (one at a time, as pictures
 * are), then combine. An alert is kept when two or more frames raise it, or when one frame raises it AND that frame's own description or
 * objects name the thing (a rifle frame says "rifle"; the leaves frame does not say "trapped"). The result has the same shape as a
 * picture record (description, objects, flags, alerts), so flags, risk, evidence selection and the report treat a video like a picture.
 *
 * ffmpeg is looked for in FFMPEG_PATH, then the optional `ffmpeg-static` package, then the PATH. Without it nothing here runs and
 * videos keep the reader's reading alone. Settings (all optional): PROFILE_REPORT_VIDEO_FRAMES (most frames per video, default 32),
 * PROFILE_REPORT_VIDEO_MAX_MB (largest video downloaded, default 80), PROFILE_REPORT_VIDEO_FRAME_ANALYSIS=0 (off).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const axios = require('axios');
const logger = require('../../lib/logger');
const vision = require('./profileReport.vision');
const { refererFor } = require('../../services/media_post_analysis/extractOcr');
const { flatten, cut } = require('../../services/media_post_analysis/imageText');
const { extractJson } = require('../../services/SummaryLLM/eventSummary.prompt');

/**
 * How many frames to look at: about one every 2.5 seconds, between 12 and PROFILE_REPORT_VIDEO_FRAMES (default 32). How many
 * matters: on the real test video the rifle is clear in only a few frames, and 12 evenly spaced frames missed it where 24 found it
 * in 4. A short clip gets 12; a minute gets 24; anything past 80 seconds gets the most.
 */
const maxFrames = () => Math.max(6, Math.min(48, Number(process.env.PROFILE_REPORT_VIDEO_FRAMES) || 32));
const frameCount = (duration = null) => {
  const d = Number(duration);
  const want = Number.isFinite(d) && d > 0 ? Math.ceil(d / 2.5) : 12;
  return Math.max(Math.min(12, maxFrames()), Math.min(maxFrames(), want));
};
const maxBytes = () => Math.max(5, Number(process.env.PROFILE_REPORT_VIDEO_MAX_MB) || 80) * 1024 * 1024;
const DOWNLOAD_MS = 120000;
const GRAB_MS = 20000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ----------------------------------------------------------------------------------------------- ffmpeg ------ */

let found;   // { bin, at }: where ffmpeg is, looked up again every 10 minutes so installing it needs no restart
const optionalStatic = () => { try { return require('ffmpeg-static'); } catch (e) { return null; } };   // eslint-disable-line global-require
const runs = (bin) => { try { return spawnSync(bin, ['-version'], { timeout: 5000 }).status === 0; } catch (e) { return false; } };
const ffmpegPath = () => {
  if (found && Date.now() - found.at < 10 * 60 * 1000) return found.bin;
  const bin = [process.env.FFMPEG_PATH, optionalStatic(), 'ffmpeg'].filter(Boolean).find(runs) || null;
  found = { bin, at: Date.now() };
  return bin;
};

/** Run ffmpeg and collect what it prints (it prints a video's length on stderr). */
const run = (bin, args, timeoutMs) => new Promise((resolve) => {
  let err = '';
  let proc;
  try { proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { resolve({ ok: false, err: e.message }); return; }
  const timer = setTimeout(() => { proc.kill('SIGKILL'); }, timeoutMs);
  proc.stderr.on('data', (d) => { if (err.length < 20000) err += d.toString(); });
  proc.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, err: e.message }); });
  proc.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, err }); });
});

/** A video's length in seconds, or null. */
const probeDuration = async (bin, file) => {
  const { err } = await run(bin, ['-hide_banner', '-i', file], GRAB_MS);   // exits non-zero without an output file; the length is still printed
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return m ? (Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3]) : null;
};

/** n moments spread evenly over the video, each in the middle of its share, so the first and last frames are not black fade-ins. */
const sampleTimes = (duration, n) => {
  const d = Number(duration);
  if (!Number.isFinite(d) || d < 1) return [0.1];
  const k = Math.max(3, Math.min(n, Math.floor(d * 2)));   // a very short clip gets fewer frames
  return Array.from({ length: k }, (_, i) => Math.round(((i + 0.5) * d / k) * 1000) / 1000);
};

const grabFrame = async (bin, file, seconds, out) => {
  await run(bin, ['-v', 'error', '-y', '-ss', String(seconds), '-i', file, '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-q:v', '4', out], GRAB_MS);
  try { return fs.statSync(out).size > 0; } catch (e) { return false; }
};

/* --------------------------------------------------------------------------------------------- download ------ */

const tooLarge = () => Object.assign(new Error(`The video is larger than ${Math.round(maxBytes() / 1048576)} MB`), { nonRetryable: true });

/** The video to a file, never more than the size limit. Errors carry `nonRetryable` for a link that will not get better. */
const downloadVideo = async (url, file) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), DOWNLOAD_MS);
  try {
    const referer = refererFor(url);
    const res = await axios.get(url, {
      responseType: 'stream', timeout: 30000, maxRedirects: 3, signal: abort.signal, validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BluraSaga/1.0; +https://blurasaga.com)', ...(referer ? { Referer: referer } : {}) },
    });
    if (res.status >= 400) {
      res.data.destroy();
      throw Object.assign(new Error(`Download failed: HTTP ${res.status}`), { status: res.status, nonRetryable: [400, 401, 403, 404, 410].includes(res.status) });
    }
    if (Number(res.headers['content-length']) > maxBytes()) { res.data.destroy(); throw tooLarge(); }
    await new Promise((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(file);
      res.data.on('data', (chunk) => { size += chunk.length; if (size > maxBytes()) res.data.destroy(tooLarge()); });
      res.data.on('error', (e) => { out.destroy(); reject(e); });
      out.on('error', reject);
      out.on('finish', resolve);
      res.data.pipe(out);
    });
  } finally {
    clearTimeout(timer);
  }
};

/* ------------------------------------------------------------------------------- how frames are cut ------- */

/**
 * Two ways to cut frames out of a downloaded video, behind one interface: a session { duration, grab(seconds) -> base64 JPEG | null, close() }.
 *   ffmpeg  the ffmpeg program, when it is installed (FFMPEG_PATH, the optional ffmpeg-static package, or the PATH);
 *   chrome  the headless Chrome that Puppeteer already provides for the PDF reports. It decodes H.264, so a server with no ffmpeg can still
 *           cut frames: checked on the live server, Chrome 143 turned the real video into six sharp frames in under three seconds,
 *           the rifle plainly visible in the three from its second half. Nothing has to be installed.
 * PROFILE_REPORT_VIDEO_FRAME_ENGINE = ffmpeg | chrome | auto (default: ffmpeg when there is one, else chrome).
 */
const ffmpegEngine = {
  name: 'ffmpeg',
  available: () => Boolean(ffmpegPath()),
  open: async (file, { dir, durationHint }) => {
    const bin = ffmpegPath();
    const duration = Number(durationHint) > 0 ? Number(durationHint) : await probeDuration(bin, file);
    let n = 0;
    return {
      duration,
      grab: async (seconds) => {
        const jpg = path.join(dir, `g${n++}.jpg`);
        if (!(await grabFrame(bin, file, seconds, jpg))) return null;
        const b64 = (await fs.promises.readFile(jpg)).toString('base64');
        await fs.promises.unlink(jpg).catch(() => {});
        return b64;
      },
      close: async () => {},
    };
  },
};

let chromeFound;   // { ok, at }, looked up again every 10 minutes
const chromeAvailable = () => {
  if (chromeFound && Date.now() - chromeFound.at < 10 * 60 * 1000) return chromeFound.ok;
  let ok = false;
  try {
    const exe = require('puppeteer').executablePath();   // eslint-disable-line global-require
    ok = Boolean(exe) && fs.existsSync(exe);
  } catch (e) { ok = false; }
  chromeFound = { ok, at: Date.now() };
  return ok;
};

/** A frame under this many bytes is blank (a black frame): not worth describing. */
const BLANK_BYTES = 2500;
const chromeEngine = {
  name: 'chrome',
  available: chromeAvailable,
  open: async (file) => {
    const puppeteer = require('puppeteer');   // eslint-disable-line global-require
    const size = fs.statSync(file).size;
    // a page and the file on a tiny local server (same origin, so the picture can be read back; with Range, as a browser asks for video)
    const server = http.createServer((req, res) => {
      if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><video id="v" muted playsinline preload="auto" src="/v.mp4"></video>'); return; }
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(file).pipe(res);
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    let browser = null;
    const close = async () => {
      try { if (browser) await Promise.race([browser.close(), sleep(5000)]); } catch (e) { /* closing anyway */ }
      try { if (browser && browser.process()) browser.process().kill('SIGKILL'); } catch (e) { /* already gone */ }
      server.close();
    };
    try {
      browser = await puppeteer.launch({ headless: true, timeout: 30000, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { timeout: 20000 });
      const meta = await page.evaluate(() => new Promise((resolve) => {
        const v = document.getElementById('v');
        const done = () => resolve({ ok: v.videoWidth > 0 && Number.isFinite(v.duration), duration: v.duration });
        if (v.readyState >= 1) done(); else { v.addEventListener('loadedmetadata', done); v.addEventListener('error', done); setTimeout(done, 15000); }
      }));
      if (!meta.ok) throw Object.assign(new Error('This video cannot be decoded here'), { undecodable: true });
      return {
        duration: meta.duration,
        grab: async (seconds) => {
          const url = await page.evaluate(async (t, maxWidth) => {
            const v = document.getElementById('v');
            const at = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
            if (Math.abs(v.currentTime - at) > 0.01) {
              await new Promise((resolve) => { const h = () => { v.removeEventListener('seeked', h); resolve(); }; v.addEventListener('seeked', h); v.currentTime = at; setTimeout(resolve, 8000); });
            }
            await new Promise((resolve) => setTimeout(resolve, 40));   // let the frame be painted
            const scale = Math.min(1, maxWidth / v.videoWidth);
            const c = document.createElement('canvas');
            c.width = Math.round(v.videoWidth * scale);
            c.height = Math.round(v.videoHeight * scale);
            c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.85);
          }, seconds, 640);
          const b64 = String(url || '').split(',')[1] || '';
          return Buffer.from(b64, 'base64').length >= BLANK_BYTES ? b64 : null;
        },
        close,
      };
    } catch (err) {
      await close();
      throw err;
    }
  },
};

const pickEngine = () => {
  const want = String(process.env.PROFILE_REPORT_VIDEO_FRAME_ENGINE || 'auto').toLowerCase();
  const order = want === 'ffmpeg' ? [ffmpegEngine] : want === 'chrome' ? [chromeEngine] : [ffmpegEngine, chromeEngine];
  return order.find((e) => e.available()) || null;
};
const available = () => Boolean(pickEngine());
/** Frame analysis is on when it is not switched off, the vision model is, and there is a way to cut frames (ffmpeg or the headless Chrome). */
const enabled = () => process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS !== '0' && vision.enabled() && available();

/* ------------------------------------------------------------------------- real footage, or animation? ------- */

/**
 * An animated film, a cartoon or a game is not a recording of real events, but its frames get the same alerts: a fantasy film's cloaked
 * character was described as "holding a rifle" and flagged `weapon` in 2 of 21 frames. The picture's `kind` cannot tell (the frames of that
 * film were mostly called "photo"); asking the vision model about the whole video can: on a real video and its two halves it answered
 * "real", on a CGI film and a cartoon "animated". Asked only when an alert is about to be kept, so most videos never pay for it.
 *
 * The vision server is given the video's link to fetch itself. If it cannot (a link only this server can reach, or one the platform will
 * not hand to it), the file already downloaded is sent instead, when it is small enough to send in a request (25 MB).
 * @returns {Promise<boolean|null>} true: animated; false: real footage; null: no clear answer (treated as real)
 */
const ASK_FILE_MAX_BYTES = 25 * 1024 * 1024;
const askOnce = async (source, timeoutMs) => {
  try {
    const res = await axios.post(
      `${vision.baseUrl()}/v1/chat/completions`,
      {
        model: vision.modelName(),
        messages: [
          { role: 'system', content: 'You answer questions about videos for a police intelligence analyst, only from what you can see.' },
          { role: 'user', content: [{ type: 'video_url', video_url: { url: source } }, { type: 'text', text: 'Is this video real-life footage recorded by a camera, or is it an animation, cartoon, video game or computer-generated film? Reply with ONLY a JSON object: {"footage": "real" or "animated"}.' }] },
        ],
        max_tokens: 30,
        temperature: 0,
      },
      { timeout: timeoutMs, maxBodyLength: 60 * 1024 * 1024, headers: { 'Content-Type': 'application/json', ...(process.env.PROFILE_REPORT_VISION_API_KEY ? { Authorization: `Bearer ${process.env.PROFILE_REPORT_VISION_API_KEY}` } : {}) } }
    );
    const answer = String((extractJson(res.data?.choices?.[0]?.message?.content) || {}).footage || '').toLowerCase();
    return { answered: true, value: answer.startsWith('anim') ? true : answer.startsWith('real') ? false : null };
  } catch (err) {
    return { answered: false, value: null };
  }
};
const askAnimated = async (videoUrl, { file = null, timeoutMs = 60000 } = {}) => {
  let r = await askOnce(videoUrl, timeoutMs);
  if (!r.answered && file) {
    try {
      if (fs.statSync(file).size <= ASK_FILE_MAX_BYTES) r = await askOnce(`data:video/mp4;base64,${(await fs.promises.readFile(file)).toString('base64')}`, timeoutMs);
    } catch (e) { /* no file to send */ }
  }
  return r.value;
};
const deps = { animated: askAnimated };

/* ------------------------------------------------------------------------------------------ combining ------- */

const alertPattern = (name) => (vision.ALERTS.find(([n]) => n === name) || [])[1];
const frameText = (f) => `${f.description || ''} ${(f.objects || []).join(' ')}`;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 48);
const sentences = (text, n) => (String(text || '').match(/[^.!?]+[.!?]+(\s|$)/g) || [String(text || '')]).slice(0, n).join(' ').replace(/\s+/g, ' ').trim();
const sentence = (s) => (s ? `${String(s).replace(/[.\s]+$/, '')}.` : '');
/** Frames closer together than this are the same moment. */
const MOMENT_GAP = 2.0;
const SINGLE_MOMENT_OK = new Set(['weapon']);
/** How many separate moments the frames are. Frames with no time count one each. */
const momentsOf = (hit) => {
  const ts = hit.map((f) => f.t).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (ts.length < hit.length) return hit.length;
  let moments = ts.length ? 1 : 0;
  for (let i = 1; i < ts.length; i += 1) if (ts[i] - ts[i - 1] > MOMENT_GAP) moments += 1;
  return moments;
};
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
/** When the frames that raised something were: "at 0:41" or "from 0:41 to 0:50"; '' when the frames carry no time. */
const whenOf = (hit) => {
  const ts = hit.map((f) => f.t).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (!ts.length) return '';
  return clock(ts[0]) === clock(ts[ts.length - 1]) ? `at ${clock(ts[0])}` : `from ${clock(ts[0])} to ${clock(ts[ts.length - 1])}`;
};

/**
 * Many frame descriptions as one picture-shaped record.
 * @param {object[]} frames described frames (each as vision.describeBase64 returns its `data`)
 * @param {{ total?: number, lead?: string, animated?: boolean }} opts `total` frames were cut; `lead` is what the video reader said about the whole
 *   clip; `animated`: the video is an animation or a game, so what its frames show is not counted as an alert
 */
const summarise = (frames, { total = null, lead = '', animated = false } = {}) => {
  const n = frames.length;
  const raised = new Map();   // alert -> frames that raised it
  for (const f of frames) for (const a of f.alerts || []) { if (!raised.has(a)) raised.set(a, []); raised.get(a).push(f); }

  // An alert needs two separate MOMENTS (frames more than 2 seconds apart; neighbouring frames see the same thing, so they are one
  // sighting, not two). Only a weapon may stand on a single moment, and only when that frame itself names it: a rifle frame says "rifle".
  // Anything about a person ("trapped", "hurt", blood, a child in danger) needs two moments, because that is what the model invents from a
  // texture: a cream sack covering the frame was called "a person trapped under a white sheet" in every frame it was in view.
  const alerts = [];
  const support = new Map();
  for (const [name] of vision.ALERTS) {
    const hit = raised.get(name);
    if (!hit) continue;
    const re = alertPattern(name);
    const naming = hit.filter((f) => re && re.test(frameText(f)));
    if (momentsOf(hit) >= 2 || (SINGLE_MOMENT_OK.has(name) && naming.length >= 1)) {
      alerts.push(name);
      // the frame that describes it best: one that names it, the longest of those
      support.set(name, { frame: (naming.length ? naming : hit).slice().sort((a, b) => String(b.description || '').length - String(a.description || '').length)[0], count: hit.length, hit });
    }
  }

  // objects seen in two frames or more, and those of the frames that support an alert
  const objectCount = new Map();
  const shown = new Map();
  for (const f of frames) {
    for (const o of new Set((f.objects || []).map(norm).filter(Boolean))) objectCount.set(o, (objectCount.get(o) || 0) + 1);
    for (const o of f.objects || []) if (!shown.has(norm(o))) shown.set(norm(o), o);
  }
  const fromAlerts = new Set([...support.values()].flatMap((s) => (s.frame.objects || []).map(norm)));
  const objects = [...objectCount.entries()]
    .filter(([o, c]) => c >= 2 || fromAlerts.has(o))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([o]) => shown.get(o));

  // flags: a phrase two frames agree on (a single frame is where invented flags come from)
  const flagCount = new Map();
  const flagShown = new Map();
  for (const f of frames) for (const x of new Set((f.flags || []).map(norm).filter(Boolean))) { flagCount.set(x, (flagCount.get(x) || 0) + 1); }
  for (const f of frames) for (const x of f.flags || []) if (!flagShown.has(norm(x))) flagShown.set(norm(x), x);
  const flags = [...flagCount.entries()].filter(([, c]) => c >= 2).slice(0, 6).map(([x]) => flagShown.get(x));

  // What was found comes first, with when it was seen, so the analyst reads it before the reader's general summary (which, on the real
  // video, said "a person handling green leafy vegetables" and nothing about the rifle).
  const parts = [];
  const flaggedAnimation = animated && alerts.length > 0;
  if (flaggedAnimation) {
    parts.push(`Animated or computer-generated footage, not a recording of real events (${alerts.join(', ')} seen in its frames is not counted).`);
  } else {
    for (const name of alerts.slice(0, 3)) {
      const s = support.get(name);
      const when = whenOf(s.hit);
      parts.push(`${name.charAt(0).toUpperCase()}${name.slice(1)} (seen ${when ? `${when}, ` : ''}in ${s.count} of ${n} frames): ${sentence(sentences(s.frame.description, 2))}`);
    }
  }
  if (lead) parts.push(sentence(cut(flatten(lead).replace(/\s+/g, ' ').trim(), 480)));
  if (!parts.length && objects.length) parts.push(sentence(`Frames of the video show ${objects.slice(0, 5).join(', ')}`));
  const description = Array.from(parts.join(' ').replace(/\s+/g, ' ').trim()).slice(0, 900).join('');

  return {
    v: vision.PICTURE_VERSION,
    source: 'video',
    kind: 'video',
    description,
    people: null,
    setting: '',
    objects,
    flags,
    symbols: [],
    text_visible: '',
    alerts: flaggedAnimation ? [] : alerts,
    ...(animated ? { animated: true } : {}),
    frames: { used: n, total: total == null ? n : total },
    not_identified: frames.some((f) => f.not_identified) || undefined,
    model: vision.modelName(),
    at: new Date().toISOString(),
  };
};

/* -------------------------------------------------------------------------------------------- the pass ------- */

/**
 * Look at a video frame by frame.
 * @param {string} videoUrl a video file link (not a stream)
 * @param {{ postId?: string, durationHint?: number|null, lead?: string }} opts
 * @returns {Promise<{ success: boolean, data?: object, described?: object[], total?: number, error?: string, nonRetryable?: boolean, unavailable?: boolean }>} same shape as the image reader's
 */
const analyse = async (videoUrl, { postId = 'unknown', durationHint = null, lead = '', deadline = null } = {}) => {
  const engine = pickEngine();
  if (!engine) return { success: false, error: 'No way to cut frames from a video is available here', nonRetryable: true, unavailable: true };
  if (!vision.enabled()) return { success: false, error: 'Picture descriptions are switched off', nonRetryable: true, unavailable: true };
  if (/\.m3u8/i.test(videoUrl)) return { success: false, error: 'A video stream is not read frame by frame', nonRetryable: true };

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prv-'));
  let session = null;
  try {
    const file = path.join(dir, 'video.mp4');
    try {
      await downloadVideo(videoUrl, file);
    } catch (err) {
      return { success: false, error: String(err.message || 'Download failed').replace(/https?:\/\/\S+/g, '<link>').slice(0, 160), nonRetryable: Boolean(err.nonRetryable) };
    }
    try {
      session = await engine.open(file, { dir, durationHint });
    } catch (err) {
      // a file the engine cannot decode is a fact about this video; an engine that would not start (no browser, no memory) is not
      if (err.undecodable) return { success: false, error: err.message, nonRetryable: true };
      logger.warn(`[ProfileReport] video frames post=${postId}: the ${engine.name} engine could not open the video: ${String(err.message).slice(0, 120)}`);
      return { success: false, error: `Frames could not be cut (${engine.name}): ${String(err.message).slice(0, 100)}`, nonRetryable: false };
    }
    const duration = Number(durationHint) > 0 ? Number(durationHint) : session.duration;
    const times = sampleTimes(duration, frameCount(duration));
    const described = [];
    let lastError = null;
    let transient = false;
    /** One frame: cut and described, with its time. Null when it could not be. */
    const look = async (t) => {
      const b64 = await session.grab(t);
      if (!b64) { lastError = 'A frame could not be cut from the video'; return null; }
      let r = await vision.describeBase64(b64);
      if (!r.success && !r.nonRetryable) { await sleep(1500); r = await vision.describeBase64(b64); }   // the vision model is sometimes busy for a moment
      if (r.success) return { ...r.data, t };
      lastError = r.error;
      transient = !r.nonRetryable;
      return null;
    };
    for (const t of times) {
      if (deadline && Date.now() > deadline) break;   // out of time: go on with the frames already described
      const f = await look(t);
      if (f) described.push(f);
    }
    const need = Math.max(3, Math.ceil(times.length / 2));
    if (described.length < need) {
      logger.warn(`[ProfileReport] video frames post=${postId}: ${described.length} of ${times.length} frames described (${String(lastError || '').slice(0, 100)})`);
      return { success: false, error: `Only ${described.length} of ${times.length} frames could be described${lastError ? `: ${String(lastError).slice(0, 100)}` : ''}`, nonRetryable: !transient };
    }
    described.sort((a, b) => a.t - b.t);
    // Only when an alert is about to be kept: is this real footage, or an animation? (see askAnimated)
    let data = summarise(described, { total: times.length, lead });
    let animated = null;
    if (data.alerts.length) {
      animated = await deps.animated(videoUrl, { file });
      if (animated === true) data = summarise(described, { total: times.length, lead, animated: true });
    }
    // `described`, `total` and `animated` are returned too, so the caller can combine the frames again once it has the reader's description to lead with
    return { success: true, data, described, total: times.length, animated };
  } catch (err) {
    return { success: false, error: String(err.message || 'The video could not be read frame by frame').slice(0, 160), nonRetryable: false };
  } finally {
    if (session) await session.close().catch(() => {});
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});   // gone before the caller continues
  }
};

module.exports = {
  available, enabled, pickEngine, ffmpegPath, analyse, summarise, sampleTimes, momentsOf, downloadVideo, probeDuration, grabFrame, frameCount, askAnimated,
  engines: { ffmpeg: ffmpegEngine, chrome: chromeEngine },
  __test: { deps, reset: () => { found = undefined; chromeFound = undefined; } },
};
