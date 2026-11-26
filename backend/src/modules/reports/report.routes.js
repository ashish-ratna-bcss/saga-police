const express = require('express');
const logger = require('../../lib/logger');
const router = express.Router();
const reportService = require('./report.service');
const { renderReportPdf } = require('./report.pdf.service');
const { authorize } = require('../../middleware/auth.middleware');

const ctrl = require('../grievances/grievance.report.controller');

/**
 * Stream PDF: try formal_reports (alert notices) first, then grievance reports.
 */
const streamReportPdf = async (req, res) => {
  try {
    const key = String(req.params.id);
    if (req.tenantPrisma) {
      const formal = await reportService.findFormalReport(key, { db: req.tenantPrisma });
      if (formal?.pdf_base64) {
        const buf = Buffer.from(formal.pdf_base64, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="Official_Notice_${String(formal.serial_number || key).replace(/[^A-Za-z0-9_\-]/g, '_')}.pdf"`
        );
        res.setHeader('Content-Length', buf.length);
        if (req.method === 'HEAD') return res.end();
        return res.end(buf);
      }
    }
  } catch (e) {
    logger.warn('[reports] formal pdf lookup failed:', e.message);
  }
  return ctrl.getReportPdf(req, res);
};

router.get('/:id/pdf', streamReportPdf);
router.head('/:id/pdf', streamReportPdf);

router.use(authorize({ pages: ['/reports', '/unified-reports', '/alerts', '/grievances'] }));

/**
 * List alert-generated formal reports only (not G/S/C/Q grievance reports).
 */
router.get('/', async (req, res) => {
  try {
    const result = await reportService.getAllReports(req.query, { db: req.tenantPrisma });
    res.json(result.items);
  } catch (error) {
    logger.error('[reports] list failed:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await reportService.getReportStats({ db: req.tenantPrisma });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create formal report from alert (Generate Report page auto-calls this).
 */
router.post('/escalate/:id', async (req, res) => {
  try {
    const report = await reportService.createReportFromAlert(req.params.id, {
      db: req.tenantPrisma,
    });
    res.status(201).json(report);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Update a formal report by id, alert_id, or serial_number.
 */
router.put('/:id', async (req, res) => {
  try {
    const report = await reportService.updateReport(req.params.id, req.body, {
      db: req.tenantPrisma,
    });
    res.json(report);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/reports/:id/pdf — Render notice HTML to PDF and cache on formal_reports.
 * `:id` is typically the alert id (Generate Report URL).
 */
router.post('/:id/pdf', async (req, res) => {
  try {
    const { headHtml = '', bodyHtml = '', templateHtml = '', serialNumber = '' } = req.body || {};
    if (!templateHtml && !bodyHtml) {
      return res.status(400).json({ error: 'templateHtml or bodyHtml is required' });
    }

    const serial = serialNumber || `report-${req.params.id}`;
    const pdf = await renderReportPdf({ headHtml, bodyHtml, templateHtml, serialNumber: serial });

    const base64 = pdf.toString('base64');
    if (req.tenantPrisma) {
      try {
        const existing = await reportService.findFormalReport(req.params.id, {
          db: req.tenantPrisma,
        });
        if (existing) {
          await req.tenantPrisma.formal_reports.update({
            where: { id: existing.id },
            data: {
              pdf_base64: base64,
              report_pdf_url: `/api/reports/${existing.alert_id}/pdf`,
            },
          });
        }
      } catch (saveErr) {
        logger.warn('[reports] Failed to cache notice PDF in formal_reports:', saveErr.message);
      }
    }

    const safeName = String(serial).replace(/[^A-Za-z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Official_Notice_${safeName}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.end(pdf);
  } catch (error) {
    logger.error('PDF generation failed:', error);
    return res.status(500).json({ error: error.message || 'PDF generation failed' });
  }
});

router.post('/:id/finalize', async (req, res) => {
  try {
    await reportService.finalizeReport(req.params.id, req.body);
    return res.status(400).json({ error: 'Use Save + Download PDF on the notice generator.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
