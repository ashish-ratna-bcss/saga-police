/**
 * Readable text from what the image reader (OCR / vision model) returns.
 *
 * The reader is documented to return plain strings, but for some pictures a field such as `summary` or `description`
 * arrives as structured data (an object or a list). Joining that with `Array.join` or `String()` produces the literal
 * text "[object Object]", which was then analysed as if it were the post and printed in reports. Everything that turns
 * an image reading into text goes through here instead: strings come back unchanged, structures are flattened into a
 * short readable sentence, and the broken placeholder can never get through.
 */

const GARBAGE = /\[object [A-Za-z]+\]/g;
const TEXT_KEYS = new Set(['text', 'content', 'value', 'description', 'summary', 'caption', 'scene', 'label', 'name', 'title']);
const MAX_DEPTH = 3;

/** Any value as readable text. Strings are trimmed; lists and objects are flattened; null and empty give ''. */
const flatten = (value, depth = 0) => {
  if (value == null || depth > MAX_DEPTH) return '';
  if (typeof value === 'string') return value.replace(GARBAGE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((x) => flatten(x, depth + 1)).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    const parts = [];
    for (const [key, inner] of Object.entries(value)) {
      const text = flatten(inner, depth + 1);
      if (!text) continue;
      parts.push(TEXT_KEYS.has(String(key).toLowerCase()) ? text : `${String(key).replace(/[_-]+/g, ' ')}: ${text}`);
    }
    return parts.join('; ');
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
  const parts = [flatten(reading.description), flatten(reading.summary)];
  if (visible && Array.isArray(reading.visible_text)) parts.push(...reading.visible_text.map((x) => flatten(x)));
  return parts.filter(Boolean).join(sep).trim();
};

/** What the picture shows (description, then summary when it says something else), apart from any text printed on it. */
const sceneOf = (reading, max = 400) => {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading) || reading.failed) return '';
  const description = flatten(reading.description);
  const summary = flatten(reading.summary);
  const seen = description.toLowerCase();
  const text = summary && !seen.includes(summary.toLowerCase()) ? [description, summary].filter(Boolean).join(' ') : description || summary;
  return Array.from(text).slice(0, max).join('').trim();
};

/** A translation as the sentiment service returned it: text, or nothing. Never an object, never the broken placeholder. */
const cleanTranslation = (value) => {
  const text = flatten(value);
  return text || null;
};

module.exports = { flatten, mediaTextOf, sceneOf, cleanTranslation };
