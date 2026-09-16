const express = require('express');
const multer = require('multer');
const { authorize } = require('../../middleware/auth.middleware');
const {
  getReportByDate,
  saveReport,
  listReports,
  getFeed,
  parseDocxUpload,
  exportDocx,
  importEvents,
  deleteReport,
} = require('./periscope.controller');


const router = express.Router();
router.use(authorize({ pages: ['/periscope', '/reports', '/events', '/dashboard'] }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isDocx =
      file.originalname.toLowerCase().endsWith('.docx') ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/octet-stream';
    if (!isDocx) {
      return cb(new Error('Only .docx files are supported for upload'));
    }
    cb(null, true);
  },
});

router.get('/by-date', getReportByDate);
router.get('/feed', getFeed);
router.post('/save', saveReport);
router.get('/list', listReports);
router.post('/upload-docx', upload.single('file'), parseDocxUpload);
router.post('/export-docx', exportDocx);
router.get('/import-events', importEvents);
router.delete('/:id', deleteReport);

module.exports = router;

