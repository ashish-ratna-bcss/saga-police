const periscopeService = require('./periscope.service');
const { parseDocxBuffer, generateDocx } = require('./periscope.docx.service');
const logger = require('../../lib/logger');

const getReportByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const tenantName =
      req.user?.blurasagatitle ||
      req.user?.application_details?.title ||
      req.tenantDbName?.split('_')?.[1] ||
      '';
    const report = await periscopeService.getReportByDate(date, {
      db: req.tenantPrisma || req.db,
      tenantName,
    });
    return res.json({ ok: true, data: report });
  } catch (err) {
    logger.error('[PeriscopeController] getReportByDate error:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const saveReport = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.report_date) {
      return res.status(400).json({ ok: false, message: 'report_date is required' });
    }
    const saved = await periscopeService.saveReport(payload, {
      db: req.tenantPrisma || req.db,
      user: req.user,
    });
    return res.json({ ok: true, data: saved });
  } catch (err) {
    logger.error('[PeriscopeController] saveReport error:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const listReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const result = await periscopeService.listReports(
      { page, limit, search },
      { db: req.tenantPrisma || req.db }
    );
    return res.json({ ok: true, data: result });
  } catch (err) {
    logger.error('[PeriscopeController] listReports error:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const parseDocxUpload = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, message: 'Please attach a .docx file' });
    }
    const parsed = await parseDocxBuffer(req.file.buffer);
    return res.json({
      ok: true,
      message: `Parsed ${parsed.programmes.length} programmes successfully`,
      data: parsed,
    });
  } catch (err) {
    logger.error('[PeriscopeController] parseDocxUpload error:', err.message);
    return res.status(400).json({ ok: false, message: `Failed to parse DOCX: ${err.message}` });
  }
};

const exportDocx = async (req, res) => {
  try {
    let reportData = req.body;
    if (!reportData || !reportData.programmes) {
      // If called with ?date=
      const { date } = req.query;
      if (date) {
        reportData = await periscopeService.getReportByDate(date, { db: req.tenantPrisma || req.db });
      }
    }

    if (!reportData) {
      return res.status(400).json({ ok: false, message: 'Report data is required' });
    }

    const docBuffer = await generateDocx(reportData);
    const dateStr = (reportData.report_date || 'report').replace(/[^0-9-]/g, '_');
    const filename = `PerISCOPE_DSR_${dateStr}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(docBuffer);
  } catch (err) {
    logger.error('[PeriscopeController] exportDocx error:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const importEvents = async (req, res) => {
  try {
    const { date } = req.query;
    const items = await periscopeService.importEventsForDate(date, { db: req.tenantPrisma || req.db });
    return res.json({ ok: true, count: items.length, data: items });
  } catch (err) {
    logger.error('[PeriscopeController] importEvents error:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    await periscopeService.deleteReport(id, { db: req.tenantPrisma || req.db });
    return res.json({ ok: true, message: 'Report deleted' });
  } catch (err) {
    logger.error('[PeriscopeController] deleteReport error:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = {
  getReportByDate,
  saveReport,
  listReports,
  parseDocxUpload,
  exportDocx,
  importEvents,
  deleteReport,
};
