/**
 * Plain-language check for the English text of a report. Finds stock filler phrases and over-long sentences, removes
 * the filler openers in code, and lists the fields that still read stiffly so the caller can ask the model to rewrite them.
 */
const OPENERS = [
  /\bthe (?:data|analysis|evidence|monitoring|posts?) (?:indicates?|suggests?|shows?|reveals?|demonstrates?) that\s+/gi,
  /\bit (?:is|can be) (?:observed|noted|seen|evident) that\s+/gi,
  /\bit appears that\s+/gi,
  /\bthere appears to be\s+/gi,
  /\bit (?:is|should be) (?:important|worth) (?:to note|noting) that\s+/gi,
  /\bin conclusion,?\s+/gi,
  /\bthe aforementioned\s+/gi,
];
const STIFF = /discourse landscape|digital ecosystem|may potentially|could potentially|in the realm of|a plethora of|myriad|multifaceted|paradigm|leverag(?:e|ing)\b/i;

const capitalise = (t) => t.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
const longSentence = (t) => String(t).split(/(?<=[.!?])\s+/).some((s) => s.split(/\s+/).length > 38);

/** Returns { text, needsRewrite }: openers removed in code; needsRewrite when stiff words or very long sentences remain. */
const cleanText = (raw) => {
  let t = String(raw || '');
  OPENERS.forEach((re) => { t = t.replace(re, ''); });
  t = capitalise(t.trim());
  return { text: t, needsRewrite: STIFF.test(t) || longSentence(t) };
};

module.exports = { cleanText };
