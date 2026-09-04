const express = require('express');
const router = express.Router();
const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent
} = require('../controllers/masterCalendarController');
const { authorize } = require('../middleware/auth.middleware');

router.use(authorize({ pages: ['/master-calendar', '/events'] }));

router.get('/', listEvents);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
