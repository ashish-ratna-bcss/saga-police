const conversation = require('./conversation.service');
const chatbot = require('./chatbot.service');

const tenantDb = (req) => req.tenantPrisma;
const userId = (req) => req.user?.id;

const listConversations = async (req, res) => {
  try {
    const rows = await conversation.listConversations(tenantDb(req), userId(req));
    return res.json({ conversations: rows });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list conversations' });
  }
};

const createConversation = async (req, res) => {
  try {
    const row = await conversation.createConversation(
      tenantDb(req),
      userId(req),
      req.body?.title
    );
    return res.status(201).json({ conversation: row });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to create conversation' });
  }
};

const renameConversation = async (req, res) => {
  try {
    const row = await conversation.renameConversation(
      tenantDb(req),
      userId(req),
      req.params.id,
      req.body?.title
    );
    if (!row) return res.status(404).json({ message: 'Conversation not found' });
    return res.json({ conversation: row });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to rename' });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const ok = await conversation.deleteConversation(tenantDb(req), userId(req), req.params.id);
    if (!ok) return res.status(404).json({ message: 'Conversation not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to delete' });
  }
};

const listMessages = async (req, res) => {
  try {
    const data = await conversation.listMessages(tenantDb(req), userId(req), req.params.id);
    if (!data) return res.status(404).json({ message: 'Conversation not found' });
    return res.json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list messages' });
  }
};

const sendMessage = async (req, res) => {
  const wantStream =
    String(req.query.stream || req.headers.accept || '').includes('text/event-stream') ||
    req.body?.stream === true;

  try {
    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const writeEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      writeEvent('status', { phase: 'retrieving' });

      const result = await chatbot.sendMessage(
        tenantDb(req),
        userId(req),
        req.params.id,
        req.body || {},
        {
          onDelta: (delta) => writeEvent('delta', { text: delta }),
        }
      );

      writeEvent('done', {
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        sources: result.sources,
      });
      return res.end();
    }

    const result = await chatbot.sendMessage(
      tenantDb(req),
      userId(req),
      req.params.id,
      req.body || {}
    );
    return res.json(result);
  } catch (err) {
    if (wantStream && !res.headersSent) {
      return res.status(err.status || 500).json({ message: err.message || 'Chat failed' });
    }
    if (wantStream) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message || 'Chat failed' })}\n\n`);
      return res.end();
    }
    return res.status(err.status || 500).json({ message: err.message || 'Chat failed' });
  }
};

const regenerateMessage = async (req, res) => {
  const wantStream =
    String(req.query.stream || req.headers.accept || '').includes('text/event-stream') ||
    req.body?.stream === true;

  try {
    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      const writeEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const result = await chatbot.regenerate(
        tenantDb(req),
        userId(req),
        req.params.id,
        req.params.messageId,
        { onDelta: (delta) => writeEvent('delta', { text: delta }) }
      );
      writeEvent('done', result);
      return res.end();
    }

    const result = await chatbot.regenerate(
      tenantDb(req),
      userId(req),
      req.params.id,
      req.params.messageId
    );
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Regenerate failed' });
  }
};

module.exports = {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  listMessages,
  sendMessage,
  regenerateMessage,
};
