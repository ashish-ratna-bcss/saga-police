const express = require('express');
const rateLimit = require('express-rate-limit');
const { authorize } = require('../../middleware/auth.middleware');
const { complete } = require('../ai-assistant/llm.service');

const router = express.Router();

const LANG_NAMES = {
  te: 'Telugu', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati',
  pa: 'Punjabi', or: 'Odia', mr: 'Marathi', ne: 'Nepali', si: 'Sinhala', ur: 'Urdu', ar: 'Arabic', fa: 'Persian',
  he: 'Hebrew', ru: 'Russian', el: 'Greek', th: 'Thai', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', tr: 'Turkish',
  nl: 'Dutch', pl: 'Polish', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', sw: 'Swahili', tl: 'Tagalog',
  sv: 'Swedish', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', fi: 'Finnish', no: 'Norwegian', da: 'Danish',
  ha: 'Hausa', uk: 'Ukrainian', bg: 'Bulgarian', sr: 'Serbian', mn: 'Mongolian', ku: 'Kurdish (Sorani)',
  ps: 'Pashto', sd: 'Sindhi', ks: 'Kashmiri', mai: 'Maithili', kok: 'Konkani', doi: 'Dogri', brx: 'Bodo',
  as: 'Assamese', my: 'Burmese', km: 'Khmer', lo: 'Lao', bo: 'Tibetan', ka: 'Georgian', hy: 'Armenian',
  am: 'Amharic', sat: 'Santali (Ol Chiki)', mni: 'Manipuri (Meitei Mayek)',
};

const MAX_CHARS = 120;
const CACHE_MAX = 2000;
const cache = new Map(); // `${lang}|${text}` -> english (process-wide, LRU-ish)

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many translation requests' },
});

/**
 * GET /api/translate/to-english?text=…&lang=te
 * Short search-bar text → English, via the tenant's configured LLM.
 * (GET so the audit-on-mutation middleware does not log every keystroke.)
 */
router.get('/to-english', authorize(), limiter, async (req, res) => {
  const text = String(req.query.text || '').trim().slice(0, MAX_CHARS);
  const lang = String(req.query.lang || '').trim().toLowerCase();
  if (!text) return res.json({ english: '' });
  if (!/^[a-z]{2,3}$/.test(lang) || lang === 'en') return res.json({ english: '' });

  const key = `n|${lang}|${text}`;
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);
    return res.json({ english: hit, cached: true });
  }

  try {
    const out = await complete(
      [
        {
          role: 'system',
          content:
            'You translate short search-box text into English. Reply with ONLY the English translation (a few words), no quotes, no notes, no explanations. If the text is already English or is meaningless, reply with exactly the input.',
        },
        { role: 'user', content: `Language: ${LANG_NAMES[lang] || lang} (${lang})\nText: ${text}` },
      ],
      { temperature: 0, maxTokens: 60 }
    );
    const english = out.content.replace(/<think>[\s\S]*?<\/think>/g, '').split('\n')[0].trim().slice(0, 200);
    cache.set(key, english);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return res.json({ english });
  } catch (error) {
    // Translation is a nice-to-have; never break the search bar.
    return res.json({ english: '', unavailable: true });
  }
});

const ARTICLE_MAX_CHARS = 6000;
const articleCache = new Map();

/**
 * POST /api/translate/article  { text, lang? }
 * A whole news article → faithful English translation plus a short summary.
 * (POST because articles are long; /api/translate is excluded from audit logging so article text
 * is not copied into audit_logs.)
 */
router.post('/article', authorize(), rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many translation requests' },
}), async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, ARTICLE_MAX_CHARS);
  const lang = String(req.body?.lang || '').trim().toLowerCase();
  if (!text) return res.json({ english: '', summary: '' });

  const key = `a|${lang}|${text.length}|${text.slice(0, 80)}|${text.slice(-80)}`;
  if (articleCache.has(key)) return res.json({ ...articleCache.get(key), cached: true });

  const langName = LANG_NAMES[lang] || (lang ? lang : 'the original language');
  try {
    const out = await complete(
      [
        {
          role: 'system',
          content:
            'You translate newspaper articles into English for police analysts. Translate faithfully: keep names, places, numbers, ranks and quotes exact; do not add or remove facts. '
            + 'Reply in exactly this format and nothing else:\nTRANSLATION:\n<full English translation>\nSUMMARY:\n<two sentences in English>\n'
            + 'If the text is already English, copy it into TRANSLATION unchanged.',
        },
        { role: 'user', content: `Language: ${langName}\n\n${text}` },
      ],
      { temperature: 0, maxTokens: 2200 }
    );
    const raw = out.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const m = raw.match(/TRANSLATION:\s*([\s\S]*?)\s*SUMMARY:\s*([\s\S]*)$/i);
    const result = m
      ? { english: m[1].trim(), summary: m[2].trim() }
      : { english: raw.replace(/^TRANSLATION:\s*/i, '').trim(), summary: '' };
    articleCache.set(key, result);
    if (articleCache.size > 300) articleCache.delete(articleCache.keys().next().value);
    return res.json(result);
  } catch (error) {
    return res.json({ english: '', summary: '', unavailable: true });
  }
});

module.exports = { translateRoutes: router };
