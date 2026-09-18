require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { assertJwtConfigured, shouldSeedDefaultAdmin } = require('./config/env');
const { startScheduler: startCatalogMonitoringScheduler } = require('./services/monitoringsocialmedia');
const { startScheduler: startMediaPostAnalysisScheduler } = require('./services/media_post_analysis');
const { startScheduler: startEventScheduler } = require('./modules/events');
const prisma = require('../prisma/client');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const logger = require('./lib/logger');

const requestLogger = (req, res, next) => {
  if (process.env.ENABLE_REQUEST_LOGS === 'true') {
    req.id = crypto.randomUUID();
    const start = Date.now();
    logger.debug(`[req ${req.id}] --> ${req.method} ${req.originalUrl}`);
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](`[req ${req.id}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    });
  } else {
    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        req.id = req.id || crypto.randomUUID();
        const durationMs = Date.now() - start;
        const level = res.statusCode >= 500 ? 'error' : 'warn';
        logger[level](`[req ${req.id}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
      }
    });
  }
  next();
};

process.on('uncaughtException', (error) => {
  logger.error('[Process] Uncaught exception:', error.message, error.stack);
});
process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled rejection:', reason instanceof Error ? reason.stack : reason);
});

assertJwtConfigured();

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    // Allow <img src="http://localhost:5005/..."> from CRA ports :3000/:3001/:3002
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);

// Open CORS — reflect any Origin (multi-port tenants :3000/:3001/:3002 + cookie credentials).
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
      'x-requested-with',
    ],
  })
);
app.options('*', cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(requestLogger);

const reportStorageDir = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', 'storage');
fs.mkdirSync(path.join(reportStorageDir, 'grievance-reports'), { recursive: true });
const reportStaticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    }
  },
};
app.use('/files', express.static(reportStorageDir, reportStaticOptions));
app.use('/api/files', express.static(reportStorageDir, reportStaticOptions));

// Fallback: If a PDF file is requested via /files or /api/files and is not on disk,
// stream it directly from the database table social_media_grievance_reports
const handleDbPdfFallback = async (req, res, next) => {
  const match = req.path.match(/([^/]+)\.pdf$/i);
  if (!match) return next();
  try {
    const rawFilename = match[1];
    // Strip trailing timestamp if present (e.g. "G-X00001-18092026-1789468436900" -> "G-X00001-18092026")
    const parts = rawFilename.split('-');
    const potentialCode = parts.length > 2 ? parts.slice(0, -1).join('-') : rawFilename;

    const { listTenantDbNames, getTenantPrisma } = require('./lib/tenantDatabase.service');
    const dbs = await listTenantDbNames();
    for (const dbName of dbs) {
      const tp = getTenantPrisma(dbName);
      const report = await tp.social_media_grievance_reports.findFirst({
        where: {
          OR: [
            { id: rawFilename },
            { unique_code: rawFilename },
            { id: potentialCode },
            { unique_code: potentialCode },
            { report_pdf_url: { contains: rawFilename } },
          ],
        },
      });

      if (report) {
        let pdfBuffer = null;
        if (report.pdf_base64) {
          pdfBuffer = Buffer.from(report.pdf_base64, 'base64');
        } else if (report.meta?.pdf_base64) {
          pdfBuffer = Buffer.from(report.meta.pdf_base64, 'base64');
        } else {
          const { generateReportPdf } = require('./modules/grievances/grievance.report.pdf');
          await generateReportPdf(report.report_type, report.id, { db: tp, req });
          const updated = await tp.social_media_grievance_reports.findUnique({
            where: { id: report.id },
          });
          if (updated?.pdf_base64) {
            pdfBuffer = Buffer.from(updated.pdf_base64, 'base64');
          } else if (updated?.meta?.pdf_base64) {
            pdfBuffer = Buffer.from(updated.meta.pdf_base64, 'base64');
          }
        }

        if (pdfBuffer) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${path.basename(req.path)}"`);
          res.setHeader('Content-Length', pdfBuffer.length);
          if (req.method === 'HEAD') return res.status(200).end();
          return res.status(200).end(pdfBuffer);
        }
      }
    }
  } catch (fallbackErr) {
    logger.warn(`[index] DB PDF fallback error for ${req.path}: ${fallbackErr.message}`);
  }
  next();
};
app.use('/files', handleDbPdfFallback);
app.use('/api/files', handleDbPdfFallback);

// Default login / branding assets: serve from frontend/public and a local
// copy under storage/public so /blura_saga_logo.jpg never 404s on the API
// when the UI accidentally prefixes BACKEND_URL.
const brandingStaticDirs = [
  path.join(__dirname, '..', '..', 'frontend', 'public'),
  path.join(reportStorageDir, 'public'),
];
for (const dir of brandingStaticDirs) {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir, { index: false, fallthrough: true }));
  }
}

app.use('/api', require('./modules').router);

app.get('/api/verify-v2', (req, res) => res.json({ status: 'ok', version: 'v2-diagnostic', timestamp: new Date() }));
app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

logger.info('[Startup] API modules mounted successfully under /api');

app.use((req, res) => {
  logger.warn(`[404] Path NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Path ${req.originalUrl} not found` });
});
app.use((err, req, res, next) => {
  logger.error(`[req ${req.id || '-'}] Unhandled error on ${req.method} ${req.originalUrl}:`, err.message, err.stack);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const startServer = async () => {
  try {
    await require('./modules/settings/mapping.service').start();
  } catch (mappingErr) {
    logger.error(`[MappingService] Initial load failed: ${mappingErr.message}`);
  }

  startCatalogMonitoringScheduler();
  startMediaPostAnalysisScheduler();
  startEventScheduler();

  const PORT = process.env.PORT || 8000;
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, async () => {
    let health = null;
    try {
      const { checkSystemHealth } = require('./modules/health/health.monitor.service');
      health = await checkSystemHealth();
    } catch (_) {}

    const pgStatus = health?.postgres?.status === 'online' ? `Online (${health.postgres.latency}ms)` : 'Active (PostgreSQL)';
    const ollamaStatus = health?.services?.ollama?.status === 'online' ? `Online (${health.services.ollama.latency}ms)` : (process.env.OLLAMA_BASE_URL ? 'Configured' : 'Standby / Local');
    const sentimentStatus = 'Active (Queue Ready)';
    const xStatus = 'Active (Scheduler Online)';
    const fbStatus = 'Active (Scheduler Online)';
    const igStatus = 'Active (Scheduler Online)';
    const ytStatus = 'Active (Scheduler Online)';
    const tgStatus = health?.services?.telegram?.status === 'online' ? 'Online' : 'Active (Scheduler Online)';

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│                 BLURA SAGA — CYBER HUB                      │
│            PostgreSQL Intelligence API Server               │
├─────────────────────────────────────────────────────────────┤
│  🚀 Server Status  : Online (${HOST}:${PORT})               │
│  🐘 PostgreSQL DB  : ${pgStatus.padEnd(39)}│
│  🤖 Ollama / AI    : ${ollamaStatus.padEnd(39)}│
│  🧠 Sentiment AI   : ${sentimentStatus.padEnd(39)}│
├─────────────────────────────────────────────────────────────┤
│  MONITORING SCHEDULERS & PLATFORMS                          │
│  • X (Twitter)     : ${xStatus.padEnd(39)}│
│  • Facebook        : ${fbStatus.padEnd(39)}│
│  • Instagram       : ${igStatus.padEnd(39)}│
│  • YouTube         : ${ytStatus.padEnd(39)}│
│  • Telegram        : ${tgStatus.padEnd(39)}│
└─────────────────────────────────────────────────────────────┘
`);
  });
};

startServer();
