/**
 * Tools → Profile Report: what is IN a post's picture.
 *
 * The image reader (OCR_SERVICE_URL) is built to read text; for a photo with no text it returns nothing useful (its
 * "summary" is its own timing statistics). So each picture is also shown to the vision model that sits behind it
 * (Qwen2.5-VL, served by vLLM on the same GPU machine, OpenAI-compatible) and asked, in plain facts, what it shows:
 * the people (how many, man / woman / child, clothing), what is happening and in what state (a vehicle upright or
 * fallen, someone lying or trapped), the setting, flags and emblems, readable writing, and anything that bears on risk.
 * That description is analysed together with the caption (tone, risk, stance) and given to the report writer.
 *
 * It describes; it never identifies. People are described as a man, woman, boy, girl, baby or child; nobody is named,
 * not from the face, not from a name printed on a quote card, not even a famous person. A name the model writes anyway
 * is removed in code and the description says "(person not identified)". It never says what a flag stands for.
 *
 * Prompts were tuned on real pictures: a small model answers better to one broad request for the description with closed
 * questions about states, plus a separate narrow request about flags (which never invented one on a picture without
 * a flag, where a single combined request did). Examples inside a prompt are avoided: the model copies them.
 *
 * Settings (all optional):
 *   PROFILE_REPORT_VISION_URL          base URL of the vision model server (default: the OCR host, port 8001)
 *   PROFILE_REPORT_VISION_MODEL        model name (default Qwen/Qwen2.5-VL-7B-Instruct)
 *   PROFILE_REPORT_PICTURE_DESCRIPTION set to 0 to switch picture descriptions off
 *   PROFILE_REPORT_VISION_API_KEY      only if the server asks for one
 */
const axios = require('axios');
const { extractJson } = require('../../services/SummaryLLM/eventSummary.prompt');
const { downloadImageAsBase64 } = require('../../services/media_post_analysis/extractOcr');
const { flatten } = require('../../services/media_post_analysis/imageText');

/** Bumped when the prompts change enough that older descriptions should be made again. */
const PICTURE_VERSION = 2;

const ocrHost = () => {
  try { return new URL(process.env.OCR_SERVICE_URL || '').hostname || ''; } catch (e) { return ''; }
};
const baseUrl = () => String(process.env.PROFILE_REPORT_VISION_URL || (ocrHost() ? `http://${ocrHost()}:8001` : '')).replace(/\/+$/, '').replace(/\/v1$/, '');
const modelName = () => process.env.PROFILE_REPORT_VISION_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct';
const enabled = () => process.env.PROFILE_REPORT_PICTURE_DESCRIPTION !== '0' && Boolean(baseUrl());

/** What the analyst's alert words are. The model chooses from these; anything else it says is dropped. */
const ALERTS = [
  ['weapon', /weapon|gun|firearm|rifle|pistol|knife|sword/i],
  ['blood or injury', /blood|injur|wound/i],
  ['person trapped, hurt or motionless', /trapped|hurt|motionless|unconscious|collapsed/i],
  ['fire or smoke', /fire|smoke|burning/i],
  ['crowd or protest', /crowd|protest|rally|procession|gathering|march/i],
  ['military or police uniform', /uniform|military|police|army|soldier/i],
  ['sexual or explicit nudity', /sexual|explicit/i],   // a bare "nudity" (a baby in a bath) is not enough
  ['drugs or alcohol', /drug|alcohol|liquor|beer|wine/i],
  ['child in danger', /child.*(danger|harm|hurt)|(danger|harm).*child/i],
];
const KINDS = ['photo', 'screenshot', 'meme', 'quote card', 'poster', 'document', 'illustration', 'collage'];

const SYSTEM = 'You describe pictures for a police intelligence analyst. You say only what can be seen, in plain factual language, and you say "cannot tell" instead of guessing. You NEVER name or identify a real person: not from the face, not from a name printed in the picture, not even a famous person. A name printed on a quote card is the author of the words, not a label for the person in the photo. Describe every person only as a man, woman, boy, girl, baby or child, with clothing and what they do. You never say what a flag, emblem or logo stands for: you describe its colours and design and quote any words written on it.';

const USER = `Look carefully at the whole picture, including any caption or writing. Reply with ONE JSON object and nothing else:
{
 "description": "2-4 plain sentences: the main subject and what is happening, the people (man, woman, boy, girl, baby; clothing; expression if clear), the setting. Always give the colours of any flag, banner or uniform and any emblem or design on it.",
 "kind": "photo, screenshot, meme, quote card, poster, document, illustration or collage",
 "people": 0,
 "setting": "indoor or outdoor and what kind of place",
 "vehicle": "none, or one of: upright and parked, upright and moving, lying on its side or crashed, cannot tell",
 "main_person": "none, or one of: standing, sitting, lying down, trapped or buried under objects, cannot tell",
 "load_or_cover": "what is piled on top of or covering a vehicle or person, or none",
 "objects": ["up to 8 notable objects"],
 "symbols": ["each logo, emblem, badge or banner, described by its colours and design and any words written on it; never say which country, group or party it belongs to; empty list if none"],
 "text_visible": "writing you can actually read in the picture, including words on clothes, caps, banners and signs, exactly as written; leave out partly hidden words; empty string if none",
 "alerts": ["choose ONLY from: weapon; blood or injury; person trapped, hurt or motionless; fire or smoke; crowd or protest; military or police uniform; sexual or explicit nudity; drugs or alcohol; child in danger. Include one only when it is CLEARLY visible. A baby being bathed, people swimming, a family photo, a selfie or a quote card are NOT alerts. Empty list when nothing applies."]
}
"people" must be ONE whole number. Rules: never name a person. Do not guess age group beyond baby, child or adult, and do not guess ethnicity, religion, nationality, caste, profession or political affiliation from how someone looks. Do not guess the place unless a sign or landmark names it. Say "side by side", "in front of" and similar only when you can clearly see it.`;

const FLAGS_SYSTEM = 'You list flags, banners and emblems in pictures for a police intelligence analyst. You list only what you can clearly see, each one once. You never say which country, group or party one belongs to. You never read or guess any words.';
const FLAGS_USER = `Look at this picture. Is there a FLAG (a piece of cloth with a coloured design, on a pole, held, worn like a cape, or draped), a BANNER, or a CREST or EMBLEM? Do not count clothes, caps, balloons, tablecloths or anything printed on clothing.
For each one that is clearly there, write ONE short phrase in this form: <kind> with <colours in order> <design>, where <kind> is flag, banner, crest or emblem and <design> is bands, stripes, a sun, a star, animals and so on. Describe each only once. If there is none, reply with an empty list.
Reply with ONLY a JSON array of such phrases.`;

/* ----------------------------------------------------------------------------------- reading the replies ------ */

const text = (v, max) => Array.from(flatten(v).replace(/\s+/g, ' ')).slice(0, max).join('').trim();
const list = (v, max, each) => {
  const out = [];
  for (const x of Array.isArray(v) ? v : v ? [v] : []) {
    const t = text(x, each);
    if (t && !out.some((y) => y.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
};

const NAME = '[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+';
/** "photograph of Sigmund Freud", "portrait of Bob Marley": a picture said to be of a named person. */
const PICTURE_OF = new RegExp(`\\b(photograph|photo|picture|portrait|selfie|painting|drawing|image)\\s+of\\s+(?:the\\s+)?(?:famous\\s+|well-known\\s+|late\\s+)?${NAME}`, 'g');
/** "appears to be Bob Marley", "looks like Sigmund Freud". ("is Master Canteen Square" can be a place, so a bare "is" is not treated as naming a person.) */
const LOOKS_LIKE = new RegExp(`\\b(appears to be|appear to be|looks like|look like|resembles|resemble|seems to be)\\s+(?:the\\s+)?(?:famous\\s+|well-known\\s+|late\\s+)?${NAME}(?=[\\s,.;:]|$)`, 'g');
/** "a famous actor", "celebrity", "public figure": the model saying the person is somebody known. */
const FAMOUS_WITH_ARTICLE = /\b(?:a|an|the)\s+(?:famous|well-known|renowned|iconic|celebrated)\s+(?:person|man|woman|actor|actress|singer|musician|politician|leader|figure|athlete|footballer)\b/gi;
const FAMOUS_PLAIN = /\b(?:famous|well-known|renowned|iconic|celebrated)\s+(?:person|man|woman|actor|actress|singer|musician|politician|leader|figure|athlete|footballer)\b|\bcelebrit(?:y|ies)\b|\bpublic figures?\b/gi;

/**
 * Nobody is identified. If the model named a person in the picture anyway (or said they are famous), the name is replaced
 * by "a person" and the description says so. A name printed on a quote card, quoted as the author of the words
 * ("a quote attributed to ..."), is left alone.
 * @returns {{ text: string, changed: boolean }}
 */
const anonymise = (value) => {
  let changed = false;
  const swap = (re, replacement) => { value = String(value).replace(re, (...m) => { changed = true; return typeof replacement === 'function' ? replacement(...m) : replacement; }); };
  swap(PICTURE_OF, (m, noun) => `${noun} of a person`);
  swap(LOOKS_LIKE, (m, verb) => `${verb} a person`);
  swap(FAMOUS_WITH_ARTICLE, 'a person');
  swap(FAMOUS_PLAIN, 'person');
  // a swap at the start of a sentence must not leave it in lower case
  if (changed) value = value.replace(/(^|[.!?]\s+)([a-z])/g, (m, lead, letter) => lead + letter.toUpperCase());
  return { text: value, changed };
};

const sentence = (s) => (s ? `${s.replace(/[.\s]+$/, '')}.` : '');

/**
 * In an ordinary photo, writing on clothes, caps, boxes and signs is small and often cut off, and the model fills it with
 * invented words ("RIGA", "NIGERIA"). Quoted words are taken out of a photo's description and symbols; a meme, quote card,
 * poster, screenshot or document keeps them, because its writing is large and the image reader reads it as well.
 */
const dropQuotedWords = (value) => String(value)
  // "the text reads 'X'", "with 'X' and 'Y' text", 'the word "X"'  ->  "some writing"
  .replace(/(?:\b(?:the\s+)?(?:words?|text|writing|lettering|letters)\s+(?:reading|reads|saying|says|that says|that reads)\s+|\b(?:the\s+)?(?:words?|text)\s+)?(?:['"“‘][^'"”’]{1,40}['"”’])(?:\s*(?:,|and|or)\s*['"“‘][^'"”’]{1,40}['"”’])*(?:\s+(?:text|writing|lettering|words))?/gi, 'some writing')
  .replace(/some writing(?:\s+(?:and|or|,)\s+some writing)+/gi, 'some writing')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s+([.,;])/g, '$1')
  .trim();

/** The states the model reported, as one plain sentence, only for what is worth saying. */
const stateSentence = (obj, description) => {
  const parts = [];
  const vehicle = text(obj.vehicle, 60).toLowerCase();
  const person = text(obj.main_person, 60).toLowerCase();
  const load = text(obj.load_or_cover, 100);
  if (/side|crash/.test(vehicle) && !/\b(on its side|crashed|fallen|overturned|toppled)\b/i.test(description)) parts.push('the vehicle is lying on its side or has crashed');
  if (/lying|trapped|buried/.test(person) && !new RegExp(`\\b${person.split(' ')[0]}`, 'i').test(description)) parts.push(`the person is ${person}`);
  if (load && !/^(none|n\/a|no)\b/i.test(load) && parts.length) parts.push(load);
  return parts.length ? sentence(parts.join('; ').replace(/^./, (c) => c.toUpperCase())) : '';
};

const peopleCount = (v) => {
  if (Array.isArray(v)) {
    const n = v.reduce((sum, x) => sum + (Number(x && typeof x === 'object' ? x.count : x) || 0), 0);
    return n > 0 ? Math.min(500, Math.round(n)) : null;
  }
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(500, Math.round(n)) : null;
};

/** The model's reply to the main question as the stored record, or null when there is no usable description. */
const parsePicture = (reply, { flags = [] } = {}) => {
  let obj = null;
  try { obj = extractJson(reply); } catch (e) { obj = null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    // not JSON: a plain sentence is still a description
    const plain = text(String(reply || '').replace(/```/g, ''), 500);
    obj = plain.length >= 8 ? { description: plain } : null;
  }
  if (!obj) return null;
  const said = text(obj.description, 500);
  if (!said) return null;

  const kind = text(obj.kind, 40).toLowerCase();
  const kindFound = KINDS.find((k) => kind.includes(k)) || null;
  const ordinaryPhoto = !kindFound || kindFound === 'photo';
  const named = anonymise(ordinaryPhoto ? dropQuotedWords(said) : said);
  const base = named.text;
  const flagList = list(flags, 6, 110).map((f) => anonymise(f).text);
  const seenAlerts = list(obj.alerts, 12, 70);
  const alerts = ALERTS.filter(([, re]) => seenAlerts.some((a) => re.test(a))).map(([name]) => name);
  // writing on clothes and caps is small and often cut off, and the model fills it with invented words: only the large,
  // legible writing of a quote card, meme, poster, screenshot or document is kept
  const legible = ordinaryPhoto ? '' : text(obj.text_visible, 300);

  const state = stateSentence(obj, base);
  const flagSentence = flagList.length ? sentence(`Flags and emblems: ${flagList.join('; ')}`) : '';
  const description = [state, sentence(base), flagSentence, named.changed ? '(Person not identified.)' : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  return {
    v: PICTURE_VERSION,
    description: Array.from(description).slice(0, 700).join(''),
    kind: kindFound,
    people: peopleCount(obj.people),
    setting: text(obj.setting, 120),
    objects: list(obj.objects, 8, 40),
    flags: flagList,
    symbols: list(obj.symbols, 6, 100).map((s) => anonymise(ordinaryPhoto ? dropQuotedWords(s) : s).text),
    text_visible: legible,
    alerts,
    not_identified: named.changed || undefined,
  };
};

/** The model's reply to the flags question as a short list of phrases. Anything that is not a clear flag phrase is dropped. */
const parseFlags = (reply) => {
  let arr = [];
  try { arr = extractJson(reply); } catch (e) { arr = []; }
  return list(Array.isArray(arr) ? arr : [], 6, 110).filter((f) => /^(flag|banner|crest|emblem)\b/i.test(f));
};

/* --------------------------------------------------------------------------------------- the requests -------- */

const mimeOf = (b64) => {
  const head = Buffer.from(String(b64).slice(0, 40), 'base64');
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (head.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return 'image/jpeg';
};

const ask = async (b64, system, user, { maxTokens, timeoutMs }) => {
  const res = await axios.post(
    `${baseUrl()}/v1/chat/completions`,
    {
      model: modelName(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeOf(b64)};base64,${b64}` } }, { type: 'text', text: user }] },
      ],
      max_tokens: maxTokens,
      temperature: 0,
    },
    {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', ...(process.env.PROFILE_REPORT_VISION_API_KEY ? { Authorization: `Bearer ${process.env.PROFILE_REPORT_VISION_API_KEY}` } : {}) },
      maxBodyLength: 40 * 1024 * 1024,
    }
  );
  return res.data?.choices?.[0]?.message?.content;
};

/**
 * Describe one picture.
 * @returns {Promise<{ success: boolean, data?: object, error?: string, nonRetryable?: boolean }>} same shape as the image reader's
 */
const describePicture = async (imageUrl, { postId = 'unknown', timeoutMs = 80000 } = {}) => {
  if (!enabled()) return { success: false, error: 'Picture descriptions are switched off', nonRetryable: true };
  let b64;
  try {
    b64 = await downloadImageAsBase64(imageUrl);
  } catch (err) {
    const status = err.response?.status;
    return { success: false, error: `Download failed: ${err.message}`, nonRetryable: status === 404 || status === 403 };
  }
  return describeBase64(b64, { timeoutMs });
};

/**
 * Describe a picture we already hold (base64), e.g. a frame cut out of a video. Same questions, same record as describePicture.
 * @returns {Promise<{ success: boolean, data?: object, error?: string, nonRetryable?: boolean }>}
 */
const describeBase64 = async (b64, { timeoutMs = 80000 } = {}) => {
  if (!enabled()) return { success: false, error: 'Picture descriptions are switched off', nonRetryable: true };
  try {
    // the description and the flags are asked separately and at the same time: a small model does each better on its own
    const [main, flagReply] = await Promise.all([
      ask(b64, SYSTEM, USER, { maxTokens: 600, timeoutMs }),
      ask(b64, FLAGS_SYSTEM, FLAGS_USER, { maxTokens: 250, timeoutMs }).catch(() => null),
    ]);
    const picture = parsePicture(main, { flags: flagReply ? parseFlags(flagReply) : [] });
    if (!picture) return { success: false, error: 'The vision model gave no description', nonRetryable: true };
    return { success: true, data: { ...picture, model: modelName(), at: new Date().toISOString() } };
  } catch (err) {
    const status = err.response?.status;
    const detail = String(err.response?.data?.error?.message || err.response?.data?.message || err.message || '').slice(0, 160);
    return { success: false, error: `Vision model${status ? ` HTTP ${status}` : ''}: ${detail}`.trim(), nonRetryable: Boolean(status && status < 500 && status !== 429) };
  }
};

module.exports = { describePicture, describeBase64, parsePicture, parseFlags, anonymise, dropQuotedWords, enabled, baseUrl, modelName, ALERTS, KINDS, PICTURE_VERSION };
