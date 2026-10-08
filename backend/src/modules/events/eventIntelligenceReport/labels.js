/**
 * Fixed words of the PDF (section headings, table headings, metric labels) in the tenant's report language.
 * The English list lives in i18n/en.json. A language is translated ONCE by the model and saved in config/i18n/<language>.json,
 * so every later report for that language costs nothing. Text that is not in the list (post text, names) is never touched.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const EN = require('./i18n/en.json');
const DIR = path.join(__dirname, '../../../../config/i18n');
const slug = (l) => String(l || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const translateWithModel = async (language, getLLMConfig) => {
  const { baseUrl, apiKey, model, timeoutMs } = getLLMConfig();
  const payload = {};
  EN.forEach((t, i) => { payload[i] = t; });
  const res = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    temperature: 0.1,
    max_tokens: 6000,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: 'system', content: `Translate each value into ${language}, as short report headings and labels. Keep numbers, symbols, "&", "/" and abbreviations such as "PIN" or "DGP" unchanged. Return ONLY a JSON object with the same keys.` },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: timeoutMs });
  const raw = res.data?.choices?.[0]?.message?.content || '';
  const out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const map = {};
  EN.forEach((t, i) => { if (typeof out[i] === 'string' && out[i].trim()) map[t] = out[i].trim(); });
  return map;
};

/** Returns { English text: translated text } for the language, or null for English / on any failure (the report stays English). */
const getLabels = async (language, getLLMConfig) => {
  if (!language || /^english$/i.test(language)) return null;
  const file = path.join(DIR, `${slug(language)}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const map = await translateWithModel(language, getLLMConfig);
    if (Object.keys(map).length < EN.length / 2) return null;
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map, null, 1));
    return map;
  } catch (e) {
    return null;
  }
};

/** Replaces text that is exactly one of the fixed labels (between tags), longest labels first. */
const localizeHtml = (html, labels) => {
  if (!labels) return html;
  let out = html;
  Object.keys(labels).sort((a, b) => b.length - a.length).forEach((en) => {
    const from = esc(en).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(>\\s*)${from}(\\s*<)`, 'g'), (m, a, b) => `${a}${esc(labels[en])}${b}`);
  });
  return out;
};

module.exports = { getLabels, localizeHtml, EN_LABELS: EN };
