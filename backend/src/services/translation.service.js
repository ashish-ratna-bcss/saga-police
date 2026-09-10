const translate = require('google-translate-api-x');
const logger = require('../lib/logger');

/**
 * Translate text via google-translate-api-x (no API key).
 * @param {string} text
 * @param {string} [target='en']
 * @param {string} [source='auto']
 * @returns {Promise<string>}
 */
const translateText = async (text, target = 'en', source = 'auto') => {
  const input = String(text || '').trim();
  if (!input) return '';

  const translatePromise = translate(input, { to: target, from: source });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Translation timed out after 10 seconds')), 10000);
  });

  const res = await Promise.race([translatePromise, timeoutPromise]);
  if (res && res.text) return res.text;

  logger.error('[TranslationService] Empty response from Google Translate');
  throw new Error('Empty response from Google Translate');
};

module.exports = { translateText };
