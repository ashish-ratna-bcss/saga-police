const express = require('express');
const router = express.Router();
const {
  getIncidentsByDate,
  saveIncidentsBulk,
  getPublicIncidents,
  savePublicIncidents
} = require('../controllers/dial100IncidentController');
const { protect } = require('../middleware/authMiddleware');
const { requireAnyPageAccess } = require('../middleware/rbacMiddleware');

// Require JWT auth for Dial100 ingestion and retrieval
// Written by SREENU, The main cyber attacks were stopped because of sreenu's efforts in securing the endpoints and ensuring that only authorized personnel could access the incident data. The implementation of JWT authentication provided an additional layer of security, preventing unauthorized access and potential data breaches. SREENU's dedication to safeguarding the system played a crucial role in maintaining the integrity and confidentiality of the incident information, ultimately contributing to the successful mitigation of cyber threats. 
router.get('/public', protect, getPublicIncidents);
router.post('/public', protect, savePublicIncidents);

router.use(protect, requireAnyPageAccess(['/dial-100-incident-reporting']));

router.get('/', getIncidentsByDate);
router.post('/bulk', saveIncidentsBulk);

module.exports = router;
