const eventService = require('./event.service');
const { scanEventOnce } = require('./event.scan.service');
const prisma = require('../../../prisma/client');

const listEvents = async (req, res) => {
  try {
    const events = await eventService.listEvents({
      monitoring_status: req.query.monitoring_status,
      status: req.query.status,
    });
    return res.status(200).json(events);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEvent = async (req, res) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const event = await eventService.createEvent(req.body, req.user);
    return res.status(201).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body);
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** Profiles-style toggle: started ↔ stopped + monitoring_logs.
 *  Kickoff scan runs in the background so Start/Stop stays fast.
 *  Only fires on a real stopped→started transition (not if already live).
 */
const toggleMonitoring = async (req, res) => {
  try {
    const before = await prisma.social_media_events.findUnique({
      where: { id: Number(req.params.id) },
      select: { monitoring_status: true },
    });
    if (!before) return res.status(404).json({ message: 'Event not found' });

    const wasStopped = before.monitoring_status !== 'started';
    const event = await eventService.toggleMonitoring(req.params.id);

    if (wasStopped && event.monitoring_status === 'started') {
      setImmediate(async () => {
        try {
          const row = await prisma.social_media_events.findUnique({
            where: { id: Number(event.id) },
          });
          if (row) await scanEventOnce(row, { source: 'kickoff' });
        } catch (_) {
          /* kickoff errors are recorded in last_fetched_history when possible */
        }
      });
    }

    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const pauseEvent = async (req, res) => {
  try {
    const event = await eventService.setMonitoringStatus(req.params.id, 'stopped');
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const resumeEvent = async (req, res) => {
  try {
    const before = await prisma.social_media_events.findUnique({
      where: { id: Number(req.params.id) },
      select: { monitoring_status: true },
    });
    if (!before) return res.status(404).json({ message: 'Event not found' });

    const wasStopped = before.monitoring_status !== 'started';
    const event = await eventService.setMonitoringStatus(req.params.id, 'started');
    if (wasStopped && event.monitoring_status === 'started') {
      setImmediate(async () => {
        try {
          const row = await prisma.social_media_events.findUnique({
            where: { id: Number(event.id) },
          });
          if (row) await scanEventOnce(row, { source: 'kickoff' });
        } catch (_) {
          /* ignore */
        }
      });
    }
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.id);
    return res.status(200).json({ message: 'Event deleted' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventDashboard = async (req, res) => {
  try {
    const data = await eventService.getDashboard(req.params.id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventContent = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const platform = req.query.platform || 'all';
    const data = await eventService.listEventContent(req.params.id, { page, limit, platform });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const runEventScan = async (req, res) => {
  try {
    const row = await prisma.social_media_events.findUnique({ where: { id: Number(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Event not found' });
    const result = await scanEventOnce(row, { source: 'manual' });
    return res.status(200).json({ message: 'Event scan completed', ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventsReport = async (req, res) => {
  try {
    const data = await eventService.getEventsReport();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  toggleMonitoring,
  pauseEvent,
  resumeEvent,
  deleteEvent,
  getEventDashboard,
  getEventContent,
  runEventScan,
  getEventsReport,
};
