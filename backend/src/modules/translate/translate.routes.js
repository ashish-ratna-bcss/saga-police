const express = require('express');
const rateLimit = require('express-rate-limit');
const { authorize } = require('../../middleware/auth.middleware');
const { complete } = require('../ai-assistant/llm.service');

const router = express.Router();

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

  const key = `${lang}|${text}`;
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
        { role: 'user', content: `Language code: ${lang}\nText: ${text}` },
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
