const axios = require('axios');
const logger = require('../utils/logger');

// RAG pipeline FastAPI service URL
const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8100';

const ragApi = axios.create({
  baseURL: RAG_API_URL,
  timeout: 300000, // 5 min — generation can be slow on CPU
  headers: { 'Content-Type': 'application/json' },
});

// GET /api/rag/health
exports.health = async (req, res) => {
  try {
    const { data } = await ragApi.get('/api/rag/health');
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Health check failed:', error.message);
    res.status(503).json({
      healthy: false,
      error: 'RAG pipeline service is not reachable. Is api_server.py running?',
    });
  }
};

// GET /api/rag/collections
exports.collections = async (req, res) => {
  try {
    const { data } = await ragApi.get('/api/rag/collections');
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Collections fetch failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch collections from RAG service' });
  }
};

// POST /api/rag/query  { question, collection, top_k }
exports.query = async (req, res) => {
  try {
    const { question, collection, top_k, time_window_days, use_db } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }
    const { data } = await ragApi.post('/api/rag/query', {
      question: question.trim(),
      collection: collection || null,
      top_k: top_k || 5,
      time_window_days: time_window_days ?? 7,
      use_db: use_db ?? true,
    });
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Query failed:', error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'RAG query failed';
    res.status(status).json({ error: detail });
  }
};

// POST /api/rag/query/async  { question, collection, top_k }
exports.queryAsync = async (req, res) => {
  try {
    const { question, collection, top_k, time_window_days } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }
    const { data } = await ragApi.post('/api/rag/query/async', {
      question: question.trim(),
      collection: collection || null,
      top_k: top_k || 12,
      time_window_days: time_window_days ?? 7,
    });
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Async query failed:', error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'RAG async query failed';
    res.status(status).json({ error: detail });
  }
};

// GET /api/rag/jobs/:id
exports.getJob = async (req, res) => {
  try {
    const { data } = await ragApi.get(`/api/rag/jobs/${encodeURIComponent(req.params.id)}`);
    res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'Failed to fetch job';
    res.status(status).json({ error: detail });
  }
};

// GET /api/rag/jobs?collection=&limit=&status=
exports.listJobs = async (req, res) => {
  try {
    const { data } = await ragApi.get('/api/rag/jobs', { params: req.query });
    res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'Failed to list jobs';
    res.status(status).json({ error: detail });
  }
};

// DELETE /api/rag/jobs/:id
exports.deleteJob = async (req, res) => {
  try {
    const { data } = await ragApi.delete(`/api/rag/jobs/${encodeURIComponent(req.params.id)}`);
    res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'Failed to delete job';
    res.status(status).json({ error: detail });
  }
};

// POST /api/rag/ingest  { collection }
exports.ingest = async (req, res) => {
  try {
    const { collection } = req.body;
    if (!collection) {
      return res.status(400).json({ error: 'collection is required' });
    }
    const { data } = await ragApi.post('/api/rag/ingest', { collection });
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Ingest failed:', error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'RAG ingestion failed';
    res.status(status).json({ error: detail });
  }
};

// GET /api/rag/stats
exports.stats = async (req, res) => {
  try {
    const { data } = await ragApi.get('/api/rag/stats');
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Stats failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch RAG stats' });
  }
};

// POST /api/rag/top-alerts/by-category
exports.topAlertsByCategory = async (req, res) => {
  try {
    const { data } = await ragApi.post('/api/rag/top-alerts/by-category', req.body || {});
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Top alerts by category failed:', error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'Failed to fetch top alerts by category';
    res.status(status).json({ error: detail });
  }
};

// GET /api/rag/top-alerts/cached
exports.topAlertsCached = async (req, res) => {
  try {
    const { data } = await ragApi.get('/api/rag/top-alerts/cached', { params: req.query });
    res.json(data);
  } catch (error) {
    logger.error('[RAG] Cached top alerts failed:', error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || 'Failed to fetch cached top alerts';
    res.status(status).json({ error: detail });
  }
};
