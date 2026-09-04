const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { authorize } = require('../middleware/auth.middleware');

// Export routes
router.get('/pdf', authorize(), exportController.generatePDF);
router.get('/word', authorize(), exportController.generateWord);

module.exports = router;
