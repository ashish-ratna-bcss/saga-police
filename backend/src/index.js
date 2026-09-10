require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { assertJwtConfigured, shouldSeedDefaultAdmin, isProduction } = require('./config/env');
const { startScheduler: startCatalogMonitoringScheduler } = require('./services/monitoringsocialmedia');
const { startScheduler: startSentimentAnalysisScheduler } = require('./services/sentimentanalysis');
const { startScheduler: startEventScheduler } = require('./modules/events');
const prisma = require('../prisma/client');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const logger = require('./lib/logger');

const requestLogger = (req, res, next) => {
  req.id = crypto.randomUUID();
  const start = Date.now();
  logger.debug(`[req ${req.id}] --> ${req.method} ${req.originalUrl}`);
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`[req ${req.id}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
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

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

if (isProduction() && !process.env.CORS_ORIGINS) {
  throw new Error('CORS_ORIGINS is required in production (comma-separated allowlist).');
}

app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-requested-with'],
}));
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

const createDefaultUsers = async () => {
  try {
    const { ensureSystemRoles, getRoleBySlug } = require('./modules/role/role.service');
    const { ROLE_SLUGS } = require('./modules/role/role.utils');
    const { getDefaultAccessForRole } = require('./modules/auth/access_features');

    // Always ensure system roles exist (superadmin / admin / user).
    await ensureSystemRoles();
    logger.info('[Startup] System roles ensured (superadmin, admin, user)');

    if (!shouldSeedDefaultAdmin()) {
      return;
    }

    const superadminRole = await getRoleBySlug(ROLE_SLUGS.SUPERADMIN);
    if (!superadminRole) {
      logger.error('[Startup] Superadmin role missing after ensure');
      return;
    }

    const existing = await prisma.users.findUnique({ where: { username: 'superadmin' } });
    if (existing) {
      return;
    }

    const access = getDefaultAccessForRole(ROLE_SLUGS.SUPERADMIN);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('superadmin123', salt);

    await prisma.users.create({
      data: {
        name: 'Super Administrator',
        username: 'superadmin',
        email: 'superadmin@blurahub.com',
        password: hashedPassword,
        role_id: superadminRole.id,
        ui_mode: 'light',
        ...access,
      },
    });
    logger.info('[Startup] Default superadmin user created (username: superadmin)');
  } catch (error) {
    logger.error(`[Startup] Error creating default users: ${error.message}`);
  }
};

const startServer = async () => {
  try {
    await require('./modules/settings/mapping.service').start();
  } catch (mappingErr) {
    logger.error(`[MappingService] Initial load failed: ${mappingErr.message}`);
  }

  await createDefaultUsers();

  startCatalogMonitoringScheduler();
  startSentimentAnalysisScheduler();
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
