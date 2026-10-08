const puppeteer = require('puppeteer');

let browserPromise = null;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browserPromise.catch(() => { browserPromise = null; });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
};

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A large event makes a long PDF. Renders share one browser, so only a few run at once; the rest wait their turn,
// and one that takes too long is stopped instead of holding up everyone else.
const MAX_CONCURRENT = Math.max(1, Number(process.env.REPORT_PDF_CONCURRENCY || 2));
const RENDER_TIMEOUT_MS = Math.max(15000, Number(process.env.REPORT_PDF_TIMEOUT_MS || 180000));
let active = 0;
const waiting = [];
const acquire = () => new Promise((resolve) => { if (active < MAX_CONCURRENT) { active += 1; resolve(); } else waiting.push(resolve); });
const release = () => { const next = waiting.shift(); if (next) next(); else active -= 1; };

/** Render a full HTML document to an A4 PDF buffer with a running footer. */
const renderHtmlToPdf = async (html, opts = {}) => {
  await acquire();
  let timer;
  try {
    return await Promise.race([
      renderNow(html, opts),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('The report took too long to render. Try again, or narrow the time window.'), { status: 504 })), RENDER_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
    release();
  }
};

const renderNow = async (html, { footerLabel = '' } = {}) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'], timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    const footer = `<div style="width:100%;font-size:7px;color:#8792A6;font-family:Arial,sans-serif;padding:0 11mm;display:flex;justify-content:space-between;">
      <span>${esc(footerLabel)}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
      margin: { top: '11mm', bottom: '13mm', left: '11mm', right: '11mm' },
      preferCSSPageSize: false,
      timeout: RENDER_TIMEOUT_MS,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
};

module.exports = { renderHtmlToPdf, esc, __test: { MAX_CONCURRENT } };
