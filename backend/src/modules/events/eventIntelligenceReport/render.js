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

/** Render a full HTML document to an A4 PDF buffer with a running footer. */
const renderHtmlToPdf = async (html, { footerLabel = '' } = {}) => {
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
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
};

module.exports = { renderHtmlToPdf, esc };
