const GENERATED_PLACEHOLDERS = [
  /^instagram\s+(?:post|story)$/i,
  /^facebook\s+post$/i,
  /^media\s+count:\s*\d+$/i,
  /^story\s+expires:\s*\S+$/i
];

const normalizeFragment = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\u2060\uFE0F]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const stripNoise = (value) => normalizeFragment(value)
  // Bare media/link posts often only carry a URL with no caption.
  .replace(/https?:\/\/\S+/gi, ' ')
  .replace(/\bwww\.\S+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isGeneratedPlaceholder = (value) =>
  GENERATED_PLACEHOLDERS.some((pattern) => pattern.test(value));

const isMeaningfulFragment = (value) => {
  if (!value || isGeneratedPlaceholder(value)) return false;
  const withoutNoise = stripNoise(value);
  if (!withoutNoise || isGeneratedPlaceholder(withoutNoise)) return false;
  return /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(withoutNoise);
};

const getAnalyzableContentText = (content = {}) => {
  const fragments = [
    content.text,
    content.scraped_content,
    content.quoted_content?.text,
    ...(Array.isArray(content.url_cards)
      ? content.url_cards.flatMap((card) => [card?.title, card?.description])
      : [])
  ];

  const seen = new Set();
  const meaningful = [];
  for (const fragment of fragments) {
    const normalized = normalizeFragment(fragment);
    if (!isMeaningfulFragment(normalized)) continue;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    meaningful.push(normalized);
  }
  return meaningful.join(' ');
};

const hasAnalyzableContent = (content) =>
  Boolean(getAnalyzableContentText(content));

module.exports = {
  getAnalyzableContentText,
  hasAnalyzableContent,
  __private: {
    normalizeFragment,
    stripNoise,
    isGeneratedPlaceholder,
    isMeaningfulFragment
  }
};
