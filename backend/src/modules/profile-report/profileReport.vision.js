/**
 * Tools → Profile Report: what is IN a post's picture.
 *
 * The image reader (OCR_SERVICE_URL) is built to read text; for a photo with no text it returns nothing useful (its
 * "summary" is its own timing statistics). So each picture is also shown to the vision model that sits behind it
 * (Qwen2.5-VL, served by vLLM on the same GPU machine, OpenAI-compatible) and asked, in plain facts, who and what is
 * visible, the setting, any flags, logos or slogans, and anything that bears on risk (a weapon, blood, a crowd...).
 * That description is analysed together with the caption (tone, risk, stance) and given to the report writer.
 *
 * It describes; it never identifies. People are counted, never named, and nothing about a person's age, ethnicity,
 * religion, nationality or politics is guessed from how they look.
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

const ocrHost = () => {
  try { return new URL(process.env.OCR_SERVICE_URL || '').hostname || ''; } catch (e) { return ''; }
};
const baseUrl = () => String(process.env.PROFILE_REPORT_VISION_URL || (ocrHost() ? `http://${ocrHost()}:8001` : '')).replace(/\/+$/, '').replace(/\/v1$/, '');
const modelName = () => process.env.PROFILE_REPORT_VISION_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct';
const enabled = () => process.env.PROFILE_REPORT_PICTURE_DESCRIPTION !== '0' && Boolean(baseUrl());

const SYSTEM = 'You describe social media pictures for a police intelligence analyst. You report only what is visible, in plain factual language, and you never identify anyone.';
const USER = `Describe this picture. Reply with ONE JSON object and nothing else:
{
 "description": "1-3 short factual sentences: how many people are visible and what they are doing, the objects, the setting",
 "people": 0,
 "setting": "indoor or outdoor and what kind of place, e.g. living room, street, stage, market",
 "objects": ["up to 8 notable objects"],
 "symbols": ["flags, logos, emblems, banners or slogans that are visible, with the words on them; empty list if none"],
 "text_visible": "any readable text in the picture, or an empty string",
 "alerts": ["only those of: weapon, blood or injury, fire or smoke, crowd or protest, uniform, child, nudity, drugs or alcohol, that are CLEARLY visible; empty list if none"]
}
Rules: do not name or identify any person. Do not guess age, ethnicity, religion, nationality, caste or political affiliation from how someone looks. Do not guess the place unless a sign or landmark names it. If the picture is unclear, say so in "description".`;

/** The only alerts that are kept, as the analyst's own words. */
const ALERTS = [
  ['weapon', /weapon|gun|firearm|rifle|pistol|knife|sword/i],
  ['blood or injury', /blood|injur|wound/i],
  ['fire or smoke', /fire|smoke|burning/i],
  ['crowd or protest', /crowd|protest|rally|procession|gathering/i],
  ['uniform', /uniform/i],
  ['child', /child|kid|minor/i],
  ['nudity', /nud/i],
  ['drugs or alcohol', /drug|alcohol|liquor|bottle of/i],
];

const text = (v, max) => Array.from(flatten(v).replace(/\s+/g, ' ')).slice(0, max).join('').trim();
const list = (v, max, each) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => text(x, each)).filter(Boolean).slice(0, max);

/** The model's reply as the stored picture record, or null when there is no usable description. */
const parsePicture = (reply) => {
  let obj = null;
  try { obj = extractJson(reply); } catch (e) { obj = null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    // not JSON: a plain sentence is still a description
    const plain = text(String(reply || '').replace(/```/g, ''), 400);
    return plain.length >= 8 ? { description: plain, people: null, setting: '', objects: [], symbols: [], text_visible: '', alerts: [] } : null;
  }
  const description = text(obj.description, 400);
  if (!description) return null;
  const people = Number(obj.people);
  const said = list(obj.alerts, 12, 60);
  const alerts = ALERTS.filter(([, re]) => said.some((a) => re.test(a))).map(([name]) => name);
  return {
    description,
    people: Number.isFinite(people) && people >= 0 ? Math.min(500, Math.round(people)) : null,
    setting: text(obj.setting, 120),
    objects: list(obj.objects, 8, 40),
    symbols: list(obj.symbols, 6, 80),
    text_visible: text(obj.text_visible, 300),
    alerts,
  };
};

const mimeOf = (b64) => {
  const head = Buffer.from(String(b64).slice(0, 40), 'base64');
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (head.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return 'image/jpeg';
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
  try {
    const res = await axios.post(
      `${baseUrl()}/v1/chat/completions`,
      {
        model: modelName(),
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeOf(b64)};base64,${b64}` } }, { type: 'text', text: USER }] },
        ],
        max_tokens: 450,
        temperature: 0.1,
      },
      {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', ...(process.env.PROFILE_REPORT_VISION_API_KEY ? { Authorization: `Bearer ${process.env.PROFILE_REPORT_VISION_API_KEY}` } : {}) },
        maxBodyLength: 40 * 1024 * 1024,
      }
    );
    const picture = parsePicture(res.data?.choices?.[0]?.message?.content);
    if (!picture) return { success: false, error: 'The vision model gave no description', nonRetryable: true };
    return { success: true, data: { ...picture, model: modelName(), at: new Date().toISOString() } };
  } catch (err) {
    const status = err.response?.status;
    const detail = String(err.response?.data?.error?.message || err.response?.data?.message || err.message || '').slice(0, 160);
    return { success: false, error: `Vision model${status ? ` HTTP ${status}` : ''}: ${detail}`.trim(), nonRetryable: Boolean(status && status < 500 && status !== 429) };
  }
};

module.exports = { describePicture, parsePicture, enabled, baseUrl, modelName, ALERTS };
