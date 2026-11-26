/**
 * Readable text from what the image reader (OCR / vision model) returns.
 *
 * The reader is documented to return plain strings, but in practice `summary` and `description` can arrive as
 * structured data, and for pictures with no text it is often only the reader's own processing statistics
 * ({text_blocks_detected: 0, total_processing_time_sec: 0.399, stage_times_sec: {...}}). Joining that with `Array.join`
 * or `String()` produced the literal text "[object Object]", which was then analysed as if it were the post.
 * Everything that turns an image reading into text goes through here instead: strings come back unchanged, structured
 * descriptions are flattened into a short readable sentence, processing statistics are ignored, and the broken
 * placeholder can never get through.
 */

const GARBAGE = /\[object [A-Za-z]+\]/g;
const TEXT_KEYS = new Set(['text', 'content', 'value', 'description', 'summary', 'caption', 'scene', 'label', 'name', 'title']);
/** Keys of a structured value that mean it describes the picture (anything else is not a description). */
const DESCRIPTIVE_KEY = /^(description|scene|caption|text|content|summary|details|setting|objects|people|symbols|labels?)$/i;
/** Keys that are the reader's own bookkeeping: timings, block counts, thresholds, boxes. */
const DIAGNOSTIC_KEY = /(^|_)(time|times|sec|secs|seconds|ms|latency|duration|elapsed|timing|stage|stages|threshold|blocks?|bbox|boxes|box|bounding|confidence|processing|engine|attempts?|detected)(_|$)/i;
const MAX_DEPTH = 3;

/** Any value as readable text. Strings are trimmed; lists and objects are flattened; null and empty give ''. */
const flatten = (value, depth = 0, skip = null) => {
  if (value == null || depth > MAX_DEPTH) return '';
  if (typeof value === 'string') return value.replace(GARBAGE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((x) => flatten(x, depth + 1, skip)).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    const parts = [];
    for (const [key, inner] of Object.entries(value)) {
      if (skip && skip.test(key)) continue;
      const text = flatten(inner, depth + 1, skip);
      if (!text) continue;
      parts.push(TEXT_KEYS.has(String(key).toLowerCase()) ? text : `${String(key).replace(/[_-]+/g, ' ')}: ${text}`);
    }
    return parts.join('; ');
  }
  return '';
};

/**
 * A description of the picture as text: a string as it is; a structured value only if it really describes something
 * (has a scene, caption, objects ...), with its bookkeeping left out. The reader's timing statistics give ''.
 */
const descriptive = (value, depth = 0) => {
  if (value == null) return '';
  if (typeof value === 'string') return flatten(value);
  if (Array.isArray(value)) return value.map((x) => descriptive(x, depth + 1)).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    if (!Object.keys(value).some((k) => DESCRIPTIVE_KEY.test(k))) return '';
    return flatten(value, depth, DIAGNOSTIC_KEY);
  }
  return '';
};

/**
 * The text of one image reading, the way live monitoring has always built it: the text read from the picture, or, when
 * there is none, its description, summary and visible text. `visible: false` leaves visible_text out.
 * Plain-string readings give exactly what they gave before.
 */
const mediaTextOf = (reading, { sep = '\n', visible = true } = {}) => {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) return '';
  if (reading.full_text) return flatten(reading.full_text);
  const parts = [descriptive(reading.description), descriptive(reading.summary)];
  if (visible && Array.isArray(reading.visible_text)) parts.push(...reading.visible_text.map((x) => flatten(x)));
  return parts.filter(Boolean).join(sep).trim();
};

/** Shorten to `max` characters at the end of a sentence if there is one in the second half, otherwise at a word, with an ellipsis. Never mid-word. */
const cut = (text, max) => {
  const chars = Array.from(String(text));
  if (chars.length <= max) return chars.join('').trim();
  const slice = chars.slice(0, max).join('');
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceEnd > max * 0.5) return slice.slice(0, sentenceEnd + 1).trim();
  const space = slice.lastIndexOf(' ');
  return `${slice.slice(0, space > max * 0.5 ? space : max).trim()}…`;
};

/**
 * What the picture shows, apart from any text printed on it. The description written by the vision model
 * (`reading.picture.description`) comes first; otherwise the reader's description, plus its summary when that says something else.
 */
const sceneOf = (reading, max = 400) => {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading) || reading.failed) return '';
  const own = reading.picture && !reading.picture.failed ? flatten(reading.picture.description) : '';
  if (own) return cut(own, max);
  const description = descriptive(reading.description);
  const summary = descriptive(reading.summary);
  const seen = description.toLowerCase();
  const text = summary && !seen.includes(summary.toLowerCase()) ? [description, summary].filter(Boolean).join(' ') : description || summary;
  return cut(text, max);
};

/** What the vision model says is notable in the picture: anything that bears on risk, flags, and other symbols. Empty when it saw nothing. */
const signalsOf = (reading) => {
  const p = reading && typeof reading === 'object' ? reading.picture : null;
  if (!p || typeof p !== 'object' || p.failed) return [];
  const all = [...(Array.isArray(p.alerts) ? p.alerts : []), ...(Array.isArray(p.flags) ? p.flags : []), ...(Array.isArray(p.symbols) ? p.symbols : [])]
    .map((x) => flatten(x))
    .filter(Boolean);
  return all.filter((x, i) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, 8);
};

/** Spoken transcript from Whisper (`reading.transcript.text`), or ''. */
const transcriptOf = (reading) => {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) return '';
  const t = reading.transcript;
  if (!t || typeof t !== 'object' || t.failed) return '';
  return flatten(t.text);
};

/** A translation as the sentiment service returned it: text, or nothing. Never an object, never the broken placeholder. */
const cleanTranslation = (value) => {
  const text = flatten(value);
  return text || null;
};

module.exports = { flatten, descriptive, mediaTextOf, sceneOf, signalsOf, transcriptOf, cleanTranslation, cut };
