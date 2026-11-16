const express = require('express');
const router = express.Router();
const { authorize } = require('../../middleware/auth.middleware');
const {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  listMessages,
  sendMessage,
  regenerateMessage,
} = require('./chatbot.controller');

router.use(authorize({ pages: ['/ai-assistant'] }));

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.patch('/conversations/:id', renameConversation);
router.delete('/conversations/:id', deleteConversation);
router.get('/conversations/:id/messages', listMessages);
router.post('/conversations/:id/messages', sendMessage);
router.post('/conversations/:id/messages/:messageId/regenerate', regenerateMessage);

module.exports = router;
