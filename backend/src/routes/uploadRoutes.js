const express = require('express');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const { requireAnyPageAccess } = require('../middleware/rbacMiddleware');

console.log('📦 UPLOAD ROUTES LOADED - VERSION: ONPREM-V1');

const router = express.Router();
router.use(protect, requireAnyPageAccess(['/dial-100-incident-reporting', '/grievances', '/person-of-interest']));

const STORAGE_DIR = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage');
const PUBLIC_BASE = (process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, '');
const UPLOAD_FOLDER = process.env.UPLOAD_FOLDER || 'uploads';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const buildPublicUrl = (key) =>
  `${PUBLIC_BASE}/files/${key.split('/').map(encodeURIComponent).join('/')}`;

const writeBufferToDisk = async (file, customKey = null) => {
  const key = customKey || `${UPLOAD_FOLDER}/${crypto.randomUUID()}-${file.originalname.replace(/\s+/g, '-')}`;

  if (!file.buffer || file.size === 0) {
    throw new Error("Cannot write empty file to storage");
  }

  const absPath = path.join(STORAGE_DIR, key);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, file.buffer);

  const url = buildPublicUrl(key);
  const resourceType = file.mimetype?.startsWith('image/') ? 'image' :
    file.mimetype?.startsWith('video/') ? 'video' : 'file';

  return {
    url,
    key,
    resource_type: resourceType,
    original_filename: file.originalname
  };
};

router.post('/s3', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const queryKey = req.query.customKey;
    const headerKey = req.headers['x-s3-key'];
    const bodyKey = req.body.customKey;

    let customKey = queryKey || headerKey || bodyKey;
    if (customKey === 'undefined' || customKey === 'null') customKey = null;

    const uploads = await Promise.all(req.files.map(file => writeBufferToDisk(file, customKey)));
    res.status(200).json({ uploads });
  } catch (error) {
    console.error('[Upload] ❌ FAILURE:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// Pre-calculate a key/URL for a planned upload (kept for client compatibility)
router.get('/predict', (req, res) => {
  try {
    const { filename } = req.query;
    if (!filename) return res.status(400).json({ message: 'Filename is required' });

    const uuid = crypto.randomUUID();
    const cleanFileName = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_.]/g, '');
    const key = `${UPLOAD_FOLDER}/${uuid}-${cleanFileName}`;
    const url = buildPublicUrl(key);

    res.json({ url, key });
  } catch (error) {
    console.error('[Upload Predict] Error:', error);
    res.status(500).json({ message: 'Prediction failed', error: error.message });
  }
});

// Proxy endpoint for downloading files to bypass CORS
router.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('URL is required');
    }

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const contentType = response.headers['content-type'];
    let filename = url.split('/').pop().split('?')[0];
    if (!filename) filename = 'downloaded-file';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    response.data.pipe(res);
  } catch (error) {
    console.error('Proxy download error:', error);
    res.status(500).send('Failed to download file');
  }
});

module.exports = router;
