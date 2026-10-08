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

// Stock phrases that make a brief read as machine-written. Used by the quality check, not to rewrite text.
const STOCK_PHRASES = [
  /\bmonitor (?:the )?(?:situation|developments)\b/i,
  /\bmonitor (?:the )?social media\b/i,
  /\bverify (?:the )?claims\b/i,
  /\bcontinue (?:to )?(?:monitor|watch)\b/i,
  /\bremain vigilant\b/i,
  /\bensure (?:that )?law and order\b/i,
  /\bit is important to (?:note|ensure|remember)\b/i,
  /\bplays? a (?:crucial|key|vital) role\b/i,
  /\bposts? (?:mention|discuss) (?:the )?(?:bandh|protest|issue|event)\b/i,
];

/** Returns the stock phrases found in the text (as matched strings). */
const stockPhrases = (text) => STOCK_PHRASES.map((re) => (String(text || '').match(re) || [])[0]).filter(Boolean);

/** An action is generic when it is very short or has no escalation trigger. */
const genericAction = (a = {}) => {
  const action = String(a.action || '').trim();
  const detail = String(a.detail || '').trim();
  const reasons = [];
  if (action.split(/\s+/).filter(Boolean).length < 3) reasons.push('too short to say who does what');
  if (!/escalat/i.test(detail)) reasons.push('no escalation trigger');
  if (detail && detail.split(/\s+/).length < 8) reasons.push('no concrete detail');
  return reasons;
};

module.exports = { cleanText, stockPhrases, genericAction };
