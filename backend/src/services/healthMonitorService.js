const axios = require('axios');
const mongoose = require('mongoose');

// Internal service ping helper
const pingService = async (url, path = '') => {
    if (!url) return { status: 'offline', error: 'Not configured' };
    try {
        const target = url.endsWith('/') ? `${url.slice(0, -1)}${path}` : `${url}${path}`;
        const start = Date.now();
        await axios.get(target, { timeout: 3000 });
        return { status: 'online', latency: Date.now() - start };
    } catch (error) {
        return { status: 'offline', error: error.code || error.message };
    }
};

const checkSystemHealth = async () => {
    // Check MongoDB
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'online' : 'offline';

    // Check Microservices
    const ollama = await pingService(process.env.OLLAMA_BASE_URL, '/api/tags');
    const deepfake = await pingService(process.env.DEEPFAKE_ML_URL);
    const sentiment = await pingService(process.env.CUSTOM_SENTIMENT_URL);
    const mediaAnalyzer = await pingService(process.env.MEDIA_ANALYZER_URL, '/health');
    const ragApi = await pingService(process.env.RAG_API_URL, '/api/rag/health');

    // Attempt to pull RapidAPI stats from existing services if they expose it
    let instagramLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
    let facebookLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
    let xLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
    let youtubeLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };

    try {
        const igService = require('./rapidApiInstagramService');
        if (igService.getKeyHealthStatus) {
            const igHealth = igService.getKeyHealthStatus();
            const firstKey = Array.isArray(igHealth) ? igHealth[0] : null;
            if (firstKey) {
                instagramLimit = {
                    totalCalls: firstKey.totalCalls || 0,
                    remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
                    limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
                    available: firstKey.available
                };
            }
        }
    } catch (e) {}

    try {
        const fbService = require('./rapidApiFacebookService');
        if (fbService.getKeyHealthStatus) {
            const fbHealth = fbService.getKeyHealthStatus();
            const firstKey = Array.isArray(fbHealth) ? fbHealth[0] : null;
            if (firstKey) {
                facebookLimit = {
                    totalCalls: firstKey.totalCalls || 0,
                    remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
                    limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
                    available: firstKey.available
                };
            }
        }
    } catch (e) {}

    try {
        const xService = require('./rapidApiXService');
        if (xService.getKeyHealthStatus) {
            const xHealth = xService.getKeyHealthStatus();
            const firstKey = Array.isArray(xHealth) ? xHealth[0] : null;
            if (firstKey) {
                xLimit = {
                    totalCalls: firstKey.totalCalls || 0,
                    remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
                    limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
                    available: firstKey.available
                };
            }
        }
    } catch (e) {}

    try {
        const ytService = require('./youtube.service');
        if (ytService.getKeyHealthStatus) {
            const ytHealth = ytService.getKeyHealthStatus();
            const firstKey = Array.isArray(ytHealth) ? ytHealth[0] : null;
            if (firstKey) {
                youtubeLimit = {
                    totalCalls: firstKey.totalCalls || 0,
                    remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
                    limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
                    available: firstKey.available
                };
            }
        }
    } catch (e) {}

    return {
        timestamp: new Date().toISOString(),
        database: { status: dbStatus },
        services: {
            ollama,
            deepfake,
            sentiment,
            mediaAnalyzer,
            ragApi
        },
        quotas: {
            totalOverallCalls: (instagramLimit.totalCalls || 0) + (facebookLimit.totalCalls || 0) + (xLimit.totalCalls || 0) + (youtubeLimit.totalCalls || 0),
            instagram: instagramLimit,
            facebook: facebookLimit,
            x: xLimit,
            youtube: youtubeLimit
        }
    };
};

module.exports = {
    checkSystemHealth
};
