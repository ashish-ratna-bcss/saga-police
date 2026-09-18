const express = require('express');
const logger = require('../../lib/logger');
const router = express.Router();
const reportService = require('./report.service');
const { renderReportPdf } = require('./report.pdf.service');
const { authorize } = require('../../middleware/auth.middleware');

const ctrl = require('../grievances/grievance.report.controller');

// Public endpoints to stream report PDF directly from DB table
router.get('/:id/pdf', ctrl.getReportPdf);
router.head('/:id/pdf', ctrl.getReportPdf);

router.use(authorize({ pages: ['/reports', '/unified-reports', '/alerts', '/grievances'] }));

/**
 * Get all reports from social_media_grievance_reports (Postgres).
 * Returns { items, pagination } and also a top-level array-compatible items list.
 */
router.get('/', async (req, res) => {
  try {
    const result = await reportService.getAllReports(req.query, { db: req.tenantPrisma });
    // Clients that expect a bare array: also accept items
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
 * Escalate from Mongo alerts is disabled — use Grievances to create G/S/C/Q reports.
 */
router.post('/escalate/:id', async (req, res) => {
  try {
    const report = await reportService.createReportFromAlert(req.params.id);
    res.status(201).json(report);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Update a grievance report by id or unique_code.
 */
router.put('/:id', async (req, res) => {
  try {
    const report = await reportService.updateReport(req.params.id, req.body, { db: req.tenantPrisma });
    res.json(report);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/reports/:id/pdf — Render live HTML to PDF (template-driven notices).
 * Stores rendered PDF directly in DB table social_media_grievance_reports.
 */
router.post('/:id/pdf', async (req, res) => {
  try {
    const { headHtml = '', bodyHtml = '', templateHtml = '', serialNumber = '' } = req.body || {};
    if (!templateHtml && !bodyHtml) {
      return res.status(400).json({ error: 'templateHtml or bodyHtml is required' });
    }

    const serial = serialNumber || `report-${req.params.id}`;
    const pdf = await renderReportPdf({ headHtml, bodyHtml, templateHtml, serialNumber: serial });

    // Store in DB table social_media_grievance_reports
    const base64 = pdf.toString('base64');
    if (req.tenantPrisma) {
      try {
        const existing = await req.tenantPrisma.social_media_grievance_reports.findFirst({
          where: { OR: [{ id: String(req.params.id) }, { unique_code: String(req.params.id) }] },
        });
        if (existing) {
          await req.tenantPrisma.social_media_grievance_reports.update({
            where: { id: existing.id },
            data: {
              pdf_base64: base64,
              report_pdf_url: `/api/reports/${existing.id}/pdf`,
              meta: {
                ...(existing.meta && typeof existing.meta === 'object' ? existing.meta : {}),
                pdf_base64: base64,
                pdf_size_bytes: pdf.length,
                report_pdf_generated_at: new Date().toISOString(),
              },
            },
          });
        }
      } catch (saveErr) {
        logger.warn('[reports] Failed to cache notice PDF in DB:', saveErr.message);
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
    return res.status(400).json({ error: 'Use Grievances reports workflow for PDF finalize.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
