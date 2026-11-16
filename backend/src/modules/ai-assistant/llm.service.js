/**
 * OpenAI-compatible chat completions provider (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL).
 * Abstraction so retrieval/RAG stay provider-agnostic.
 */

const axios = require('axios');

const getLLMConfig = () => {
  let baseUrl = (process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl && process.env.OLLAMA_BASE_URL) {
    baseUrl = `${process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, '')}/v1`;
  }
  const apiKey = (process.env.LLM_API_KEY || 'ollama').trim();
  const model = (process.env.LLM_MODEL || 'qwen3-14b').trim();
  const timeoutMs = Math.max(
    15000,
    Number(process.env.LLM_CHAT_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 120000)
  );
  const maxTokens = Math.min(
    8000,
    Math.max(256, Number(process.env.LLM_CHAT_MAX_TOKENS || 3500))
  );
  if (!baseUrl) {
    const err = new Error('LLM_BASE_URL is not configured');
    err.status = 503;
    throw err;
  }
  return { baseUrl, apiKey, model, timeoutMs, maxTokens };
};

/**
 * Non-streaming completion.
 * @param {{ role: string, content: string }[]} messages
 * @returns {Promise<{ content: string, model: string, usage: object }>}
 */
async function complete(messages, opts = {}) {
  const { baseUrl, apiKey, model, timeoutMs, maxTokens } = getLLMConfig();
  const res = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model: opts.model || model,
      messages,
      max_tokens: opts.maxTokens || maxTokens,
      temperature: opts.temperature ?? 0.2,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    }
  );
  const choice = res.data?.choices?.[0]?.message?.content || '';
  return {
    content: String(choice).trim(),
    model: res.data?.model || model,
    usage: res.data?.usage || {},
  };
}

/**
 * Streaming completion — yields text deltas. Falls back to complete() if stream fails.
 * @param {{ role: string, content: string }[]} messages
 * @param {(delta: string) => void} onDelta
 */
async function completeStream(messages, onDelta, opts = {}) {
  const { baseUrl, apiKey, model, timeoutMs, maxTokens } = getLLMConfig();
  try {
    const res = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: opts.model || model,
        messages,
        max_tokens: opts.maxTokens || maxTokens,
        temperature: opts.temperature ?? 0.2,
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        timeout: timeoutMs,
        responseType: 'stream',
      }
    );

    let full = '';
    let buffer = '';
    await new Promise((resolve, reject) => {
      res.data.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              full += delta;
              onDelta(delta);
            }
          } catch {
            /* ignore partial JSON */
          }
        }
      });
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });

    if (!full) {
      const fallback = await complete(messages, opts);
      if (fallback.content) onDelta(fallback.content);
      return fallback;
    }
    return { content: full.trim(), model, usage: {} };
  } catch (err) {
    // Many local gateways reject stream — fall back.
    const fallback = await complete(messages, opts);
    if (fallback.content) onDelta(fallback.content);
    return fallback;
  }
}

module.exports = {
  getLLMConfig,
  complete,
  completeStream,
};
