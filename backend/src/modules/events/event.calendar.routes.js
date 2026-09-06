const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const {
  listOccasions,
  createOccasion,
  updateOccasion,
  deleteOccasion,
} = require('./event.calendar.controller');

const router = express.Router();

router.use(authorize({ pages: ['/events', '/master-calendar'] }));

router.get('/', listOccasions);
router.post('/', createOccasion);
router.put('/:id', updateOccasion);
router.delete('/:id', deleteOccasion);

module.exports = router;
