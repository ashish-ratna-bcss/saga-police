const logger = require('../../lib/logger');
const reportService = require('./grievance.report.service');

const getUser = (req) => ({
  user_id: req.user?.id,
  email: req.user?.email,
  name: req.user?.full_name || req.user?.name || req.user?.email,
});

const dbOpt = (req) => ({ db: req.tenantPrisma });

const createReport =
  (reportType) =>
  async (req, res) => {
    try {
      const { report, created } = await reportService.createOrUpdateReport(
        reportType,
        req.body || {},
        getUser(req),
        dbOpt(req)
      );
      return res.status(created ? 201 : 200).json(report);
    } catch (error) {
      const status = error.status || 500;
      logger.error(`[Grievances] create ${reportType} report failed:`, error.message);
      return res.status(status).json({ error: error.message || 'Failed to create report' });
    }
  };

const shareReport =
  (reportType) =>
  async (req, res) => {
    try {
      const report = await reportService.shareReport(
        req.params.id,
        { ...(req.body || {}), changed_by: getUser(req) },
        reportType,
        dbOpt(req)
      );
      return res.status(200).json(report);
    } catch (error) {
      const status = error.status || 500;
      logger.error(`[Grievances] share ${reportType} report failed:`, error.message);
      return res.status(status).json({ error: error.message || 'Failed to share report' });
    }
  };

const closeReport = async (req, res) => {
  try {
    const report = await reportService.closeReport(
      req.params.id,
      { ...(req.body || {}), changed_by: getUser(req) },
      reportService.REPORT_TYPES.grievance,
      dbOpt(req)
    );
    return res.status(200).json(report);
  } catch (error) {
    const status = error.status || 500;
    logger.error('[Grievances] close report failed:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to close report' });
  }
};

const updateGrievanceReport = async (req, res) => {
  try {
    const report = await reportService.updateReportDetails(
      req.params.id,
      req.body || {},
      reportService.REPORT_TYPES.grievance,
      dbOpt(req)
    );
    return res.status(200).json(report);
  } catch (error) {
    const status = error.status || 500;
    logger.error('[Grievances] update report failed:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to update report' });
  }
};

const updateGrievanceReportStatus = async (req, res) => {
  try {
    const report = await reportService.updateReportStatus(
      req.params.id,
      req.body?.status,
      reportService.REPORT_TYPES.grievance,
      getUser(req),
      dbOpt(req)
    );
    return res.status(200).json(report);
  } catch (error) {
    const status = error.status || 500;
    logger.error('[Grievances] update report status failed:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to update status' });
  }
};

const getReport =
  (reportType) =>
  async (req, res) => {
    try {
      const report = await reportService.findReport(
        req.params.id,
        reportType,
        dbOpt(req)
      );
      if (!report) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json(report);
    } catch (error) {
      logger.error(`[Grievances] get ${reportType} report failed:`, error.message);
      return res.status(500).json({ error: 'Failed to get report' });
    }
  };

const listReports =
  (reportType) =>
  async (req, res) => {
    try {
      const payload = await reportService.listReports(
        reportType,
        req.query,
        dbOpt(req)
      );
      return res.status(200).json(payload);
    } catch (error) {
      logger.error(`[Grievances] list ${reportType} reports failed:`, error.message);
      return res.status(500).json({ error: 'Failed to list reports' });
    }
  };

const listContacts = async (req, res) => {
  try {
    const contacts = await reportService.listContacts(dbOpt(req));
    return res.status(200).json(contacts);
  } catch (error) {
    logger.error('[Grievances] list contacts failed:', error.message);
    return res.status(500).json({ error: 'Failed to list contacts' });
  }
};

const addContact = async (req, res) => {
  try {
    const contact = await reportService.addContact(req.body || {}, dbOpt(req));
    return res.status(201).json(contact);
  } catch (error) {
    const status = error.status || 500;
    logger.error('[Grievances] add contact failed:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to add contact' });
  }
};

const updateContact = async (req, res) => {
  try {
    const contact = await reportService.updateContact(
      req.params.id,
      req.body || {},
      dbOpt(req)
    );
    return res.status(200).json(contact);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to update contact' });
  }
};

const deleteContact = async (req, res) => {
  try {
    await reportService.deleteContact(req.params.id, dbOpt(req));
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to delete contact' });
  }
};

module.exports = {
  createGrievanceReport: createReport(reportService.REPORT_TYPES.grievance),
  shareGrievanceReport: shareReport(reportService.REPORT_TYPES.grievance),
  closeGrievanceReport: closeReport,
  updateGrievanceReport,
  updateGrievanceReportStatus,
  getGrievanceReport: getReport(reportService.REPORT_TYPES.grievance),
  listGrievanceReports: listReports(reportService.REPORT_TYPES.grievance),

  createSuggestionReport: createReport(reportService.REPORT_TYPES.suggestion),
  shareSuggestionReport: shareReport(reportService.REPORT_TYPES.suggestion),
  getSuggestionReport: getReport(reportService.REPORT_TYPES.suggestion),
  listSuggestionReports: listReports(reportService.REPORT_TYPES.suggestion),

  createCriticismReport: createReport(reportService.REPORT_TYPES.criticism),
  shareCriticismReport: shareReport(reportService.REPORT_TYPES.criticism),
  getCriticismReport: getReport(reportService.REPORT_TYPES.criticism),
  listCriticismReports: listReports(reportService.REPORT_TYPES.criticism),

  createQueryReport: createReport(reportService.REPORT_TYPES.query),
  shareQueryReport: shareReport(reportService.REPORT_TYPES.query),
  getQueryReport: getReport(reportService.REPORT_TYPES.query),
  listQueryReports: listReports(reportService.REPORT_TYPES.query),

  listContacts,
  addContact,
  updateContact,
  deleteContact,
};
