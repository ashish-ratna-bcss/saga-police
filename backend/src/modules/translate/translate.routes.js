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

  const key = `v2|${lang}|${text}`;
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);
    return res.json({ english: hit, cached: true });
  }

  try {
    const langName = LANG_NAMES[lang] || lang;
    const out = await complete(
      [
        {
          role: 'system',
          content:
            `/no_think\nYou are a precise ${langName}-to-English dictionary for a search box. ` +
            'Give the literal, most common dictionary meaning of the text. ' +
            'If a word has two or three clearly different common meanings, list them separated by " / ". ' +
            'Do not paraphrase, do not generalise (e.g. a "hymn" is not a "prayer"), do not add explanations, quotes or notes. ' +
            'If it is a person or place name, give its English spelling. ' +
            'Examples (Telugu): "కీర్తన" -> "hymn / devotional song / praise"; "ప్రభుత్వం" -> "government"; "నిరసన" -> "protest". ' +
            'Reply with ONLY the English text. If the input is already English or meaningless, reply with exactly the input.',
        },
        { role: 'user', content: `${langName}: ${text}` },
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

module.exports = { translateRoutes: router };
