/**
 * Keeps provider and system internals out of what people see on screen.
 * Mirrors backend/src/lib/publicError.js: raw text such as gateway URLs, key names, HTTP codes,
 * database errors or file paths is replaced with a plain sentence. Plain messages pass through.
 */
const TECHNICAL = [
  /https?:\/\/\S+/i,
  /\b(api[ _-]?key|bearer|access[ _-]?token|secret|client[ _-]?code|key rotation)\b/i,
  /blu\s?gate/i,
  /\bHTTP\s*\d{3}\b/i,
  /status code \d{3}/i,
  /request failed with status/i,
  /\b(ECONN\w+|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|getaddrinfo|axios|timeout of \d+\s?ms)\b/i,
  /prisma|\bP\d{4}\b|invalid `|relation "[^"]*" does not exist|column "[^"]*" does not exist|syntax error at or near|duplicate key value|violates (foreign|unique|not-null)/i,
  /\n\s+at\s|\b(TypeError|ReferenceError|SyntaxError|RangeError)\b|cannot read propert|is not a function|undefined is not|unexpected token/i,
  /(^|[\s"'(])\/(Users|home|data-migration|var|opt|usr|srv|app)\//,
  /node_modules/,
  /\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/,
  /\b(vllm|qwen|indicocr|ollama|rapidapi|x-rapidapi)\b/i,
];

export const isTechnical = (value) => typeof value === 'string' && value.length > 0 && TECHNICAL.some((re) => re.test(value));

const BY_STATUS = {
  400: 'The request could not be completed. Please check what you entered and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you asked for.',
  409: 'This conflicts with information that already exists.',
  413: 'That is too large to upload.',
  422: 'Some of what you entered is not valid. Please check it and try again.',
  429: 'Too many requests. Please try again in a moment.',
};

export const friendlyMessage = (status) => BY_STATUS[status] || (status >= 500 ? 'Something went wrong on our side. Please try again later.' : 'Not available right now. Please try again later.');

/** A message safe to show: plain text is kept, technical text becomes a plain sentence. */
export const publicText = (text, status = 500) => (isTechnical(text) ? friendlyMessage(status) : text);

/** Clean an axios error in place so every screen that reads it shows plain text. */
export const cleanAxiosError = (error) => {
  const status = error?.response?.status || 0;
  const data = error?.response?.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of ['error', 'message', 'detail', 'details']) {
      if (typeof data[key] === 'string') data[key] = publicText(data[key], status);
      else if (data[key] && typeof data[key] === 'object' && typeof data[key].message === 'string') {
        data[key].message = publicText(data[key].message, status);
      }
    }
  }
  const msg = String(error?.message || '');
  if (/^network error$/i.test(msg)) error.message = 'Could not reach the server. Check your connection and try again.';
  else if (/timeout of/i.test(msg) || error?.code === 'ECONNABORTED') error.message = 'This took too long. Please try again.';
  else if (isTechnical(msg)) error.message = friendlyMessage(status);
  return error;
};
