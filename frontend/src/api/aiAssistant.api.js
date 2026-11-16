import apiHandler, { BACKEND_URL } from './apiHandler';

export const aiAssistantApi = {
  listConversations: async () => {
    const res = await apiHandler.get('/ai-assistant/conversations');
    return res.data;
  },

  createConversation: async (title) => {
    const res = await apiHandler.post('/ai-assistant/conversations', { title });
    return res.data;
  },

  renameConversation: async (id, title) => {
    const res = await apiHandler.patch(`/ai-assistant/conversations/${id}`, { title });
    return res.data;
  },

  deleteConversation: async (id) => {
    const res = await apiHandler.delete(`/ai-assistant/conversations/${id}`);
    return res.data;
  },

  listMessages: async (id) => {
    const res = await apiHandler.get(`/ai-assistant/conversations/${id}/messages`);
    return res.data;
  },

  /** Non-streaming send */
  sendMessage: async (conversationId, body) => {
    const res = await apiHandler.post(
      `/ai-assistant/conversations/${conversationId}/messages`,
      body
    );
    return res.data;
  },

  /**
   * Streaming send via fetch + SSE.
   * @param {(event: string, data: object) => void} onEvent
   */
  sendMessageStream: async (conversationId, body, onEvent) => {
    const res = await fetch(
      `${BACKEND_URL}/api/ai-assistant/conversations/${conversationId}/messages?stream=1`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'ngrok-skip-browser-warning': '69420',
        },
        body: JSON.stringify({ ...body, stream: true }),
      }
    );
    if (!res.ok) {
      let message = `Chat failed (${res.status})`;
      try {
        const j = await res.json();
        if (j?.message) message = j.message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const block of chunks) {
        const lines = block.split('\n');
        let event = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        try {
          onEvent(event, JSON.parse(dataLine));
        } catch {
          /* ignore */
        }
      }
    }
  },

  regenerate: async (conversationId, messageId) => {
    const res = await apiHandler.post(
      `/ai-assistant/conversations/${conversationId}/messages/${messageId}/regenerate`,
      {}
    );
    return res.data;
  },
};

export default aiAssistantApi;
