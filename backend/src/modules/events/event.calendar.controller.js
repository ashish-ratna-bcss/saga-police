const calendarService = require('./event.calendar.service');

const listOccasions = async (req, res) => {
  try {
    const rows = await calendarService.listOccasions({ recurring: req.query.recurring });
    return res.json(rows);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const createOccasion = async (req, res) => {
  try {
    const row = await calendarService.createOccasion(req.body);
    return res.status(201).json(row);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const updateOccasion = async (req, res) => {
  try {
    const row = await calendarService.updateOccasion(req.params.id, req.body);
    return res.json(row);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteOccasion = async (req, res) => {
  try {
    await calendarService.deleteOccasion(req.params.id);
    return res.json({ message: 'Occasion deleted' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  listOccasions,
  createOccasion,
  updateOccasion,
  deleteOccasion,
};
