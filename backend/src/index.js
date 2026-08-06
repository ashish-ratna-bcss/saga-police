require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./config/db');
const { assertJwtConfigured, shouldSeedDefaultAdmin, isProduction } = require('./config/security');
const { startMonitoring } = require('./services/monitorService');
const { startTempContentProcessor } = require('./services/tempContentProcessor');
const { seedDefaultThresholds } = require('./services/velocityAlertService');
const grievanceService = require('./services/grievanceService');
const User = require('./models/User');
const Settings = require('./models/Settings');
const Source = require('./models/Source');
const Content = require('./models/Content');
const Report = require('./models/Report');
const GrievanceSource = require('./models/GrievanceSource');
const SearchHistory = require('./models/SearchHistory');
const { google } = require('googleapis');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { seedRecurringEvents } = require('./controllers/masterCalendarController');
const { syncCalendarToEvents } = require('./services/calendarEventSyncService');
const fs = require('fs');

// Fail closed on secrets before accepting traffic.
assertJwtConfigured();

const app = express();

// Trust proxy for proper protocol detection behind nginx/load balancer
app.set('trust proxy', 1);

// Middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

if (isProduction() && !process.env.CORS_ORIGINS) {
  throw new Error('CORS_ORIGINS is required in production (comma-separated allowlist).');
}

app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : '*',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-requested-with']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(mongoSanitize());

// On-prem static serving for generated report files (replaces S3 hosting)
const path = require('path');
const reportStorageDir = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', 'storage');
fs.mkdirSync(path.join(reportStorageDir, 'grievance-reports'), { recursive: true });
const reportStaticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    }
  }
};
app.use('/files', express.static(reportStorageDir, reportStaticOptions));
// Serve generated files under /api as well so reverse proxies that only forward /api still expose reports.
app.use('/api/files', express.static(reportStorageDir, reportStaticOptions));

// Routes
app.use('/api/deepfake', require('./routes/deepfakeRoutes'));
app.use('/api/health', require('./routes/healthRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/sources', require('./routes/sourceRoutes'));
app.use('/api/content', require('./routes/contentRoutes'));
app.use('/api/alerts', require('./routes/alertRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/intelligence', require('./routes/intelligenceDashboardRoutes'));
app.use('/api/keywords', require('./routes/keywordRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/youtube', require('./routes/youtube.routes'));
app.use('/api/x', require('./routes/x.routes'));
app.use('/api/media', require('./routes/media.routes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/alert-thresholds', require('./routes/alertThresholdRoutes'));
app.use('/api/maigret', require('./routes/maigretRoutes'));
app.use('/api/wmn', require('./routes/wmnRoutes'));
app.use('/api/osint-tools', require('./routes/osintToolsRoutes'));

app.use('/api/grievances', require('./routes/grievanceRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/ongoing-events', require('./routes/ongoingEventRoutes'));
app.use('/api/daily-programmes', require('./routes/dailyProgrammeRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/uploads', require('./routes/uploadRoutes'));
app.use('/api/instagram-stories', require('./routes/instagramStoryRoutes'));
app.use('/api/dial100-incidents', require('./routes/dial100IncidentRoutes'));
app.use('/api/criticism', require('./routes/criticismRoutes'));
app.use('/api/grievance-workflow', require('./routes/grievanceWorkflowRoutes'));
app.use('/api/query-workflow', require('./routes/queryRoutes'));
app.use('/api/suggestion', require('./routes/suggestionRoutes'));
app.use('/api/suggestions', require('./routes/suggestionRoutes'));
app.use('/api/policies', require('./routes/policyRoutes'));
app.use('/api/templates', require('./routes/templatesRoutes'));
app.use('/api/poi', require('./routes/poiRoutes'));
app.use('/api/master-calendar', require('./routes/masterCalendarRoutes'));
app.use('/api/rag', require('./routes/ragRoutes'));
app.use('/api/daily-intelligence-report', require('./routes/dailyIntelligenceReportRoutes'));
app.use('/api/comprehensive-report', require('./routes/comprehensiveReportRoutes'));
app.use('/api/post-location', require('./routes/postLocationRoutes'));


app.get('/api/verify-v2', (req, res) => res.json({ status: 'ok', version: 'v2-diagnostic', timestamp: new Date() }));
app.get('/api/ping', (req, res) => res.json({ status: 'ok', msg: 'Deepfake integration check' }));
app.use('/api/rbac', require('./routes/rbacRoutes'));
//app.get('/api/ping', (req, res) => res.json({ status: 'ok', msg: 'Deepfake integration check' }));

// Catch-all 404 handler for debugging untracked routes
app.use((req, res, next) => {
  console.log(`[404] Path NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Path ${req.originalUrl} not found` });
});

// Default Admin User
const createDefaultAdmin = async () => {
  try {
    if (!shouldSeedDefaultAdmin()) {
      return;
    }

    const adminEmail = 'admin@blurahub.com';
    const adminExists = await User.findOne({ email: adminEmail });

    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);

      await User.create({
        email: adminEmail,
        password: hashedPassword,
        full_name: 'System Administrator',
        role: 'superadmin'
      });
      //console.log('Default admin user created: admin@blurahub.com / admin123');
    }
  } catch (error) {
    //console.error(`Error creating default admin: ${error.message}`);
  }
};

// Default Settings
const createDefaultSettings = async () => {
  try {
    const settings = await Settings.findOne({ id: 'global_settings' });
    if (!settings) {
      await Settings.create({
        id: 'global_settings',
        high_risk_threshold: 70,
        medium_risk_threshold: 40,
        risk_threshold_high: 70,
        risk_threshold_medium: 40,
        monitoring_interval_minutes: 5,
        enable_email_alerts: true
      });
      //console.log('Default settings created');
    }
  } catch (error) {
    //console.error(`Error creating default settings: ${error.message}`);
  }
};

const seedSources = async () => {
  try {
    const sourcesList = require('./data/sources_list.json');
    const apiKey = process.env.YOUTUBE_API_KEY;
    const youtube = apiKey ? google.youtube({ version: 'v3', auth: apiKey }) : null;

    //console.log(`Seeding ${sourcesList.length} sources...`);

    for (const source of sourcesList) {
      // Check if exists by identifier or display name
      const existing = await Source.findOne({
        $or: [
          { identifier: source.identifier },
          { display_name: source.display_name, platform: source.platform }
        ]
      });

      if (existing) continue;

      let identifier = source.identifier;

      // Resolve YouTube handle/name to Channel ID if needed
      if (source.platform === 'youtube' && !identifier.startsWith('UC') && youtube) {
        try {
          const response = await youtube.search.list({
            part: 'snippet',
            q: identifier,
            type: 'channel',
            maxResults: 1
          });

          if (response.data.items && response.data.items.length > 0) {
            identifier = response.data.items[0].id.channelId;
            // Also try to get stats here if possible, to avoid 0s
            // But doing it for all might hit quota.
            // We will rely on user Sync for seeded data to save quota.
            //console.log(`Resolved ${source.identifier} to ${identifier}`);
          } else {
            //console.warn(`Could not resolve YouTube handle: ${source.identifier}`);
          }
        } catch (err) {
          //console.error(`Error resolving ${source.identifier}: ${err.message}`);
        }
      }

      try {
        await Source.create({
          platform: source.platform,
          identifier: identifier,
          display_name: source.display_name,
          category: source.category,
          created_by: 'system_seed',
          is_active: true
        });
        //console.log(`Seeded source: ${source.display_name} (${source.platform})`);
      } catch (err) {
        if (err.code !== 11000) { // Ignore duplicate key errors
          //console.error(`Failed to seed ${source.display_name}: ${err.message}`);
        }
      }
    }
    //console.log('Seeding completed.');
  } catch (error) {
    //console.error('Error seeding sources:', error);
  }
};

const fixIndexes = async () => {
  try {
    const indexes = await Content.collection.indexes();
    const keyIndex = indexes.find(idx => idx.name === 'key_1');
    if (keyIndex) {
      //console.log('Dropping invalid index key_1 from contents collection...');
      await Content.collection.dropIndex('key_1');
      //console.log('Index dropped.');
    }

    const legacyContentIdIndex = indexes.find(idx => idx.name === 'content_id_1');
    if (legacyContentIdIndex) {
      //console.log('Dropping legacy unique index content_id_1 from contents collection...');
      await Content.collection.dropIndex('content_id_1');
      //console.log('Legacy index dropped.');
    }

    const compoundIndexName = 'platform_1_content_id_1';
    const compoundIndex = indexes.find(idx => idx.name === compoundIndexName);
    if (!compoundIndex) {
      //console.log('Creating compound unique index platform_1_content_id_1 on contents collection...');
      await Content.collection.createIndex({ platform: 1, content_id: 1 }, { unique: true, name: compoundIndexName });
      //console.log('Compound index created.');
    }
  } catch (error) {
    if (error.code !== 27) {
      console.error('Error fixing indexes:', error.message);
    }
  }
};

const ensureSearchHistoryIndexes = async () => {
  try {
    const indexes = await SearchHistory.collection.indexes();
    const desiredTextIndexName = 'user_id_1_query_text_results_search_text_text';

    for (const idx of indexes) {
      const hasTextKey = Object.values(idx.key || {}).includes('text');
      if (!hasTextKey) continue;

      const isDesired = idx.name === desiredTextIndexName;
      if (!isDesired) {
        try {
          await SearchHistory.collection.dropIndex(idx.name);
          console.log(`[SearchHistory] Dropped legacy text index: ${idx.name}`);
        } catch (dropErr) {
          console.warn(`[SearchHistory] Could not drop index ${idx.name}: ${dropErr.message}`);
        }
      }
    }

    await SearchHistory.createIndexes();
    console.log('[SearchHistory] Indexes ensured');
  } catch (error) {
    console.error('[SearchHistory] Failed to ensure indexes:', error.message);
  }
};

const ensureReportIndexes = async () => {
  try {
    await Report.createIndexes();
    console.log('[Report] Indexes ensured');
  } catch (error) {
    console.error('[Report] Failed to ensure indexes:', error.message);
  }
};

const buildSearchHistoryResultsText = (results) => {
  if (!Array.isArray(results) || results.length === 0) return '';

  const snippets = [];
  for (const item of results.slice(0, 300)) {
    if (!item || typeof item !== 'object') continue;

    const parts = [
      item.text,
      item.title,
      item.description,
      item.author,
      item.author_handle,
      item.channelTitle,
      item.screen_name,
      item.name,
      item.url,
      item.content_url
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (parts.length > 0) snippets.push(parts.join(' '));
  }

  return snippets.join(' ').slice(0, 20000).toLowerCase();
};

const backfillSearchHistoryResultsText = async () => {
  try {
    const docs = await SearchHistory.find({
      $or: [
        { results_search_text: { $exists: false } },
        { results_search_text: '' }
      ]
    })
      .select('_id results')
      .limit(2000)
      .lean();

    if (!docs.length) return;

    const bulkOps = docs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { results_search_text: buildSearchHistoryResultsText(doc.results) } }
      }
    }));

    if (bulkOps.length > 0) {
      await SearchHistory.bulkWrite(bulkOps, { ordered: false });
      console.log(`[SearchHistory] Backfilled results_search_text for ${bulkOps.length} records`);
    }
  } catch (error) {
    console.error('[SearchHistory] Backfill failed:', error.message);
  }
};

// Grievance Auto-Fetch Scheduler - interval driven by api_config.grievances
let grievanceSchedulerRunning = false;

const startGrievanceScheduler = () => {
  // Run immediately on startup (after a small delay to let everything initialize)
  setTimeout(async () => {
    await runGrievanceFetch();
  }, 30000); // 30 second delay on startup

  // Then run on a dynamic interval loop
  const scheduleNext = async () => {
    let intervalMs = 60 * 60 * 1000; // default 60 min
    try {
      const settings = await Settings.findOne({ id: 'global_settings' });
      // Use the smaller of the two platform intervals (x, facebook)
      const xMin = settings?.api_config?.grievances?.x || 60;
      const fbMin = settings?.api_config?.grievances?.facebook || 60;
      intervalMs = Math.min(xMin, fbMin) * 60 * 1000;
    } catch (_) { /* use default */ }
    setTimeout(async () => {
      await runGrievanceFetch();
      scheduleNext();
    }, intervalMs);
  };
  scheduleNext();
};

const runGrievanceFetch = async () => {
  // Prevent concurrent runs
  if (grievanceSchedulerRunning) {
    return;
  }

  try {
    grievanceSchedulerRunning = true;

    // Check if grievances are enabled in api_config
    const settings = await Settings.findOne({ id: 'global_settings' });
    if (settings?.api_config?.grievances?.enabled === false) {
      return;
    }

    // Check if there are any active grievance sources
    const activeSources = await GrievanceSource.countDocuments({ is_active: true });
    if (activeSources === 0) {
      return;
    }

    // Fetch grievances for today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const result = await grievanceService.fetchAllGrievances(todayStr, todayStr);

  } catch (error) {
    console.error('[Grievance Scheduler] Error during auto-fetch:', error.message);
  } finally {
    grievanceSchedulerRunning = false;
  }
};

// ─── Content Availability Checker ──────────────────────────────────────────
let availabilityCheckerRunning = false;

const startAvailabilityChecker = () => {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  // Run first check 2 minutes after startup
  setTimeout(async () => {
    await runAvailabilityCheckOnce();
  }, 2 * 60 * 1000);

  setInterval(async () => {
    await runAvailabilityCheckOnce();
  }, INTERVAL_MS);
};

const runAvailabilityCheckOnce = async () => {
  if (availabilityCheckerRunning) return;
  availabilityCheckerRunning = true;
  try {
    const { runFullAvailabilityCheck } = require('./services/availabilityCheckerService');
    const stats = await runFullAvailabilityCheck();
    console.log('[AvailabilityChecker] Scheduled check complete:', JSON.stringify(stats));
  } catch (err) {
    console.error('[AvailabilityChecker] Scheduled check error:', err.message);
  } finally {
    availabilityCheckerRunning = false;
  }
};

// Periodic Ollama relevance sweep over event posts that don't yet have an
// llm_verdict (or got stuck in 'pending' on a previous run).
let llmSweepRunning = false;
const startLlmRelevanceSweeper = () => {
  const enabled = process.env.LLM_RELEVANCE_SWEEPER !== '0' && process.env.LLM_RELEVANCE_SWEEPER !== 'false';
  if (!enabled) {
    console.log('[LLMSweeper] disabled via LLM_RELEVANCE_SWEEPER=0');
    return;
  }
  const intervalMs = Math.max(60 * 1000, Number(process.env.LLM_SWEEP_INTERVAL_MS || 5 * 60 * 1000));
  const batch = Math.max(10, Number(process.env.LLM_SWEEP_BATCH || 100));
  const kick = async () => {
    if (llmSweepRunning) return;
    llmSweepRunning = true;
    try {
      const { runSweep } = require('./services/llmRelevanceSweeper');
      const stats = await runSweep({ limit: batch });
      if (stats && !stats.skipped && stats.processed) {
        console.log(`[LLMSweeper] processed=${stats.processed} kept=${stats.kept} deleted=${stats.deleted} pending=${stats.pending} failed=${stats.failed}`);
      }
    } catch (err) {
      console.warn('[LLMSweeper] sweep error:', err.message);
    } finally {
      llmSweepRunning = false;
    }
  };
  setTimeout(kick, 60 * 1000); // first run 1 min after boot
  setInterval(kick, intervalMs);
};

const startServer = async () => {
  // Connect to database
  await connectDB();

  // Create default admin
  await createDefaultAdmin();

  // Create default settings
  await createDefaultSettings();

  // Seed sources
  // await seedSources();

  // Fix indexes
  await fixIndexes();
  await ensureReportIndexes();
  await ensureSearchHistoryIndexes();
  await backfillSearchHistoryResultsText();

  // Seed default velocity alert thresholds
  await seedDefaultThresholds();

  // Master calendar seed disabled — events are created manually only
  // await seedRecurringEvents();

  // Auto-creation from master calendar disabled — events are now created manually only
  // await syncCalendarToEvents();

  // Start Monitoring Service OR temp content processor (engine mode)
  const useEngine = String(process.env.USE_ENGINE || 'false').toLowerCase() === 'true';
  if (useEngine) {
    startTempContentProcessor();
  } else {
    startMonitoring();
  }

  // Start Grievance Auto-Fetch Scheduler only in legacy mode.
  if (!useEngine) {
    startGrievanceScheduler();
  }

  // Start Content Availability Checker
  startAvailabilityChecker();

  // Start Hyderabad/Telangana relevance sweeper — periodically asks Ollama
  // to classify event-tagged posts that don't yet have a verdict, and
  // hard-deletes the ones it confirms are off-topic.
  startLlmRelevanceSweeper();

  // Retweet Sync Scheduler — DISABLED (now on-demand via Frequent Engagers button)
  // try {
  //   const { startRetweetSyncScheduler } = require('./services/retweetNetworkService');
  //   startRetweetSyncScheduler();
  // } catch (err) {
  //   console.warn('[Server] Could not initialize Retweet Sync Scheduler:', err.message);
  // }

  const PORT = process.env.PORT || 8000;

  app.listen(PORT, () => {
    console.log('\\n----------------------------------------');
    console.log(`🚀 Server Status: Online`);
    console.log(`🔌 Port: ${PORT}`);
    console.log(`🍃 Database: MongoDB connected to '${mongoose.connection.name}'`);
    console.log(`🤖 Background Services: Active`);
    console.log('----------------------------------------\\n');
  });
};

startServer();
