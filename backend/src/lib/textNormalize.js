/**
 * Text normalisation for MATCHING (never for display).
 * - NFC so visually identical Indic/Arabic strings compare equal
 * - strips zero-width joiners/marks that some sources insert inside words
 *   (they show up as stray spaces in PDFs and break keyword matching)
 * - collapses all whitespace
 */
const ZERO_WIDTH_RE = /[​‌‍⁠﻿­]/g;

const normalizeText = (value) =>
  String(value == null ? '' : value)
    .normalize('NFC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[  -   　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Key for finding reposts / copy-paste: ignores case, links, @mentions, punctuation. */
const dedupeKey = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|\s)@[\p{L}\p{M}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s#]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

module.exports = { normalizeText, dedupeKey };
