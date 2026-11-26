/**
 * Text normalisation for MATCHING (never for display).
 * - NFC so visually identical Indic/Arabic strings compare equal
 * - folds Brahmic candrabindu → anusvara (राँची ↔ रांची, and same pair in
 *   Bengali / Gujarati / Gurmukhi / Oriya / Telugu / Kannada / Malayalam)
 * - strips zero-width joiners/marks that some sources insert inside words
 *   (they show up as stray spaces in PDFs and break keyword matching)
 * - collapses all whitespace
 */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;

/** Candrabindu → anusvara for Brahmic scripts (lookalike nasal marks). */
const BRAHMIC_CHANDRABINDU_TO_ANUSVARA = [
  ['\u0901', '\u0902'], // Devanagari
  ['\u0981', '\u0982'], // Bengali
  ['\u0A01', '\u0A02'], // Gurmukhi
  ['\u0A81', '\u0A82'], // Gujarati
  ['\u0B01', '\u0B02'], // Oriya
  ['\u0C01', '\u0C02'], // Telugu
  ['\u0C81', '\u0C82'], // Kannada
  ['\u0D01', '\u0D02'], // Malayalam
];

const foldBrahmicNasals = (value) => {
  let out = String(value == null ? '' : value);
  for (const [from, to] of BRAHMIC_CHANDRABINDU_TO_ANUSVARA) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
};

/** Same fold for Postgres `translate()` — from-chars then to-chars. */
const BRAHMIC_NASAL_TRANSLATE_FROM = BRAHMIC_CHANDRABINDU_TO_ANUSVARA.map(([f]) => f).join('');
const BRAHMIC_NASAL_TRANSLATE_TO = BRAHMIC_CHANDRABINDU_TO_ANUSVARA.map(([, t]) => t).join('');

const normalizeText = (value) =>
  foldBrahmicNasals(
    String(value == null ? '' : value)
      .normalize('NFC')
      .replace(ZERO_WIDTH_RE, '')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

/** Key for finding reposts / copy-paste: ignores case, links, @mentions, punctuation. */
const dedupeKey = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|\s)@[\p{L}\p{M}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s#]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

module.exports = {
  normalizeText,
  dedupeKey,
  foldBrahmicNasals,
  BRAHMIC_NASAL_TRANSLATE_FROM,
  BRAHMIC_NASAL_TRANSLATE_TO,
};
