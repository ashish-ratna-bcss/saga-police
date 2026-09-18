/**
 * Generate G/S/C/Q report PDFs (Puppeteer) and store under /files/...
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const { asJson } = require('./grievance.utils');
const { findReport } = require('./grievance.report.service');
const {
  buildReportHtml,
  generateQrDataUrl,
} = require('./grievance.report.pdf.html');

const STORAGE_DIR =
  process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', '..', 'storage');

const asObject = (value, fallback = {}) => {
  const parsed = asJson(value, fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
};

const publicBaseFromReq = (req) => {
  const envBase = (process.env.PUBLIC_BACKEND_URL || '').replace(/\/+$/, '');
  if (envBase) return envBase;
  if (req) {
    return `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
  }
  return '';
};

const buildPublicFileUrl = (key, req) => {
  const base = publicBaseFromReq(req);
  const pathPart = `/files/${String(key)
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  return base ? `${base}${pathPart}` : pathPart;
};

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildSimpleReportHtml = (r, title, pdfUrl, qrs = {}) => {
  const esc = escapeHtml;
  const media = Array.isArray(r.media_s3_urls) && r.media_s3_urls.length
    ? r.media_s3_urls
    : r.media_urls || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:24px;font-size:12px}
h1{font-size:18px;margin:0 0 8px}
.meta{color:#64748b;font-size:11px;margin-bottom:16px}
.box{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0;white-space:pre-wrap}
.qr{display:flex;gap:12px;margin-top:16px}
.qr img{width:90px;height:90px}
label{display:block;font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:700}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">Code: <strong>${esc(r.unique_code || r.id)}</strong> · Status: ${esc(r.status || '—')} · Platform: ${esc((r.platform || '').toUpperCase() || '—')}</div>
<div class="box"><label>Post</label>${esc(r.post_description || r.description || '—')}</div>
<div class="box"><label>Post link</label>${esc(r.post_link || '—')}</div>
${r.remarks ? `<div class="box"><label>Remarks</label>${esc(r.remarks)}</div>` : ''}
${media.length ? `<div class="box"><label>Media</label>${media.map((u) => esc(u)).join('<br/>')}</div>` : ''}
<div class="qr">
  ${qrs.postQr ? `<div><img src="${qrs.postQr}"/><label>Post QR</label></div>` : ''}
  ${qrs.pdfQr ? `<div><img src="${qrs.pdfQr}"/><label>PDF QR</label></div>` : ''}
</div>
</body></html>`;
};

const attachGrievanceContext = async (report, { db } = {}) => {
  const prisma = dbOf(db);
  const gid = report.grievance_id;
  if (!gid || !/^\d+$/.test(String(gid))) return report;
  try {
    const row = await prisma.social_media_grievances.findUnique({
      where: { id: BigInt(String(gid)) },
    });
    if (!row) return report;
    return {
      ...report,
      grievance_context: asObject(row.context),
      grievance_content: asObject(row.content),
      grievance_posted_by: asObject(row.posted_by),
      grievance_post_date: row.posted_at,
      closing_details: asObject(report.meta?.closing_details || report.closing_details),
    };
  } catch (err) {
    logger.warn(`[report-pdf] context load failed: ${err.message}`);
    return report;
  }
};

const resolveChromeExecutable = () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return candidates.find((p) => fs.existsSync(p)) || undefined;
};

let browserPromise = null;
const getBrowser = async () => {
  if (!browserPromise) {
    const executablePath = resolveChromeExecutable();
    browserPromise = puppeteer.launch({
      headless: 'new',
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
};

const renderHtmlToPdf = async (html) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await page.close().catch(() => {});
  }
};

const FOLDER_BY_TYPE = {
  grievance: 'grievance-reports',
  suggestion: 'suggestion-reports',
  criticism: 'criticism-reports',
  query: 'query-reports',
};

const TITLE_BY_TYPE = {
  grievance: 'Grievance Report',
  suggestion: 'Suggestion Report',
  criticism: 'Criticism Report',
  query: 'Query Report',
};

/**
 * @returns {{ pdf_url: string }}
 */
const generateReportPdf = async (reportType, idOrCode, { db, req } = {}) => {
  const prisma = dbOf(db);
  let report = await findReport(idOrCode, reportType, { db: prisma });
  if (!report) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  report = await attachGrievanceContext(report, { db: prisma });

  // Stream directly from DB table — no local disk storage required
  const base = publicBaseFromReq(req);
  const pdfPath = `/api/reports/${encodeURIComponent(report.id)}/pdf`;
  const pdfUrl = base ? `${base}${pdfPath}` : pdfPath;

  const [postQrImage, pdfQrImage] = await Promise.all([
    generateQrDataUrl(report.post_link, 120),
    generateQrDataUrl(pdfUrl, 120),
  ]);

  let html;
  if (reportType === 'grievance') {
    html = buildReportHtml(
      { ...report, report_pdf_url: report.report_pdf_url || pdfUrl },
      { pdfUrl, postQrImage, pdfQrImage }
    );
  } else {
    html = buildSimpleReportHtml(report, TITLE_BY_TYPE[reportType] || 'Report', pdfUrl, {
      postQr: postQrImage,
      pdfQr: pdfQrImage,
    });
  }

  const pdfBuffer = await renderHtmlToPdf(html);
  const pdfBase64 = pdfBuffer.toString('base64');

  await prisma.social_media_grievance_reports.update({
    where: { id: report.id },
    data: {
      report_pdf_url: pdfUrl,
      pdf_base64: pdfBase64,
      meta: {
        ...asObject(report.meta),
        pdf_base64: pdfBase64,
        pdf_size_bytes: pdfBuffer.length,
        report_pdf_generated_at: new Date().toISOString(),
      },
    },
  });

  return { pdf_url: pdfUrl };
};

module.exports = {
  generateReportPdf,
};
