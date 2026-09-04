const express = require('express');
const router = express.Router();
const {
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent
} = require('../controllers/ongoingEventController');
const { authorize } = require('../middleware/auth.middleware');

router.use(authorize({ pages: ['/events'] }));

router.get('/', getEvents);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
