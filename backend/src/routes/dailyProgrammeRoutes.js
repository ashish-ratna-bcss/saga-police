const express = require('express');
const router = express.Router();
const multer = require('multer');

// In-memory storage for .docx uploads (no disk write needed)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.originalname.endsWith('.docx')) {
            cb(null, true);
        } else {
            cb(new Error('Only .docx files are allowed'), false);
        }
    }
});

const {
    getProgrammesByDate,
    saveProgrammesBulk,
    createProgramme,
    updateProgramme,
    deleteProgramme,
    clearProgrammesByDate,
    getAvailableDates,
    uploadPeriscope,
    getPeriscopeUploadInfo,
    downloadPeriscopeDoc
} = require('../controllers/dailyProgrammeController');

const { authorize } = require('../middleware/auth.middleware');

router.use(authorize());

// RBAC:
// - Reading programmes is needed on both Announcements (manage) and Dashboard (view).
// - Writes (upload/save/edit/delete) remain restricted to Announcements.
const READ_PAGES = ['/announcements', '/dashboard'];
const WRITE_PAGES = ['/announcements'];

// Get available dates with programmes
router.get('/dates', authorize({ pages: WRITE_PAGES }), getAvailableDates);

// Get upload info (abstract, S3 availability) for a date
router.get('/upload-info', authorize({ pages: WRITE_PAGES }), getPeriscopeUploadInfo);

// Download original Periscope DOCX from S3
router.get('/download-periscope', authorize({ pages: WRITE_PAGES }), downloadPeriscopeDoc);

// Get programmes by date
router.get('/', authorize({ pages: READ_PAGES }), getProgrammesByDate);

// Upload Periscope .docx and parse into programmes
router.post('/upload-periscope', authorize({ pages: WRITE_PAGES }), upload.single('file'), uploadPeriscope);
router.post('/bulk', authorize({ pages: WRITE_PAGES }), saveProgrammesBulk);
router.post('/', authorize({ pages: WRITE_PAGES }), createProgramme);
router.put('/:id', authorize({ pages: WRITE_PAGES }), updateProgramme);
router.delete('/:id', authorize({ pages: WRITE_PAGES }), deleteProgramme);
router.delete('/date/:date', authorize({ pages: WRITE_PAGES }), clearProgrammesByDate);

module.exports = router;
