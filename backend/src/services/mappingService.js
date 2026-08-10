const fs = require('fs');
const path = require('path');
const PolicyMapping = require('../models/PolicyMapping');
const logger = require('../utils/logger');

/**
 * Deterministic Mapping Engine
 * Resolves legal sections and platform policies based on category.
 * Now dynamic: Fetches from MongoDB (cached).
 */
class MappingService {
    constructor() {
        this.mappingData = { category_mappings: [] }; // Initial empty state
        this.isLoaded = false;

        // Initial load
        this.loadMappings();

        // Refresh cache every 5 minutes (optional, can be triggered manually too)
        setInterval(() => this.loadMappings(), 5 * 60 * 1000);
    }

    async loadMappings() {
        try {
            const mappings = await PolicyMapping.find({ is_active: true });

            // Transform DB format back to service internal format
            this.mappingData.category_mappings = mappings.map(m => ({
                category_id: m.category_id,
                definition: m.definition,
                severity_level: m.severity_level || 'Medium',
                keywords: m.keywords || [],
                country: 'IN', // Default
                legal_sections: m.legal_sections,
                platform_policies: m.platform_policies instanceof Map ?
                    Object.fromEntries(m.platform_policies) : m.platform_policies // Handle Mongoose Map
            }));

            this.isLoaded = true;
            logger.info(`[MappingService] Successfully loaded ${mappings.length} category mappings from MongoDB.`);
        } catch (error) {
            logger.error('[MappingService] Error loading mapping data from DB:', error.message);
            // Fallback to file if DB fails on startup? 
            // Better to keep previous cache if update fails
            if (!this.isLoaded) {
                this.loadFallbackFile();
            }
        }
    }

    async waitForLoad() {
        if (this.isLoaded) return;
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (this.isLoaded) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    loadFallbackFile() {
        try {
            const dataPath = path.join(__dirname, '../config/mapping_data.json');
            const rawData = fs.readFileSync(dataPath, 'utf8');
            this.mappingData = JSON.parse(rawData);
            logger.info(`[MappingService] Loaded fallback file data.`);
            this.isLoaded = true;
        } catch (e) { logger.error("Fallback load failed", e); }
    }

    // Method to force refresh (e.g., after Admin API update)
    async forceRefresh() {
        logger.info("[MappingService] Force refreshing mappings...");
        await this.loadMappings();
    }

    /**
     * Resolve legal and policy violations for a given category.
     * @param {string} category - The detected category (e.g., "Hate_Speech")
     * @param {string} text - The input text to extract keywords from.
     * @param {string} platform - The source platform (e.g., "x", "youtube")
     * @param {string} country - The target country (default: "IN")
     * @returns {object} { legal_sections: [], platform_policies: [], triggered_keywords: [] }
     */
    resolveMapping(category, text, platform = 'x', country = 'IN') {
        const platformKey = platform.toLowerCase();

        // Find mapping for category and country
        const mapping = this.mappingData.category_mappings.find(
            m => m.category_id === category && m.country === country
        );

        const result = {
            legal_sections: [],
            platform_policies: [],
            triggered_keywords: []
        };

        if (mapping) {
            result.legal_sections = (mapping.legal_sections || []).map(s => ({
                act: country === 'IN' ? 'BNS 2023' : 'International Law',
                section: s.code,
                description: s.title
            }));

            // Handle both Map object and plain object in case of different load states
            const policiesMap = mapping.platform_policies;
            const policies = policiesMap[platformKey] || [];

            result.platform_policies = policies.map(p => ({
                policy_id: p.id,
                policy_name: p.name,
                platform: platformKey
            }));
        } else {
            logger.info(`[MappingService] No mapping found for category: ${category} (Country: ${country})`);
        }

        // Prefer PolicyMapping.keywords when present; empty → KR_MAP fallback inside extractKeywords
        result.triggered_keywords = this.extractKeywords(
            text,
            mapping ? (mapping.keywords || []) : [],
            category
        );

        return result;
    }

    /**
     * Shared keyword matcher — case-insensitive substring, dedupe, sort.
     * @param {string} text
     * @param {string[]} keywordList
     * @returns {string[]}
     */
    matchKeywords(text, keywordList) {
        if (!text || !Array.isArray(keywordList) || keywordList.length === 0) return [];
        const text_norm = text.toLowerCase();
        const keywords_found = new Set();

        for (const kw of keywordList) {
            if (kw == null || kw === '') continue;
            const term = String(kw);
            if (text_norm.includes(term.toLowerCase())) {
                keywords_found.add(term);
            }
        }
        return Array.from(keywords_found).sort();
    }

    /**
     * Extract triggered keywords from text.
     * Primary source: PolicyMapping.keywords (when non-empty).
     * Fallback: hardcoded KR_MAP (backward compatible).
     * @param {string} text
     * @param {string[]} [dbKeywords=[]]
     * @param {string|null} [categoryId=null]
     * @returns {string[]}
     */
    extractKeywords(text, dbKeywords = [], categoryId = null) {
        if (!text) return [];

        const list = Array.isArray(dbKeywords)
            ? dbKeywords.filter((kw) => kw != null && String(kw).trim() !== '').map(String)
            : [];

        if (list.length > 0) {
            console.debug(`Using PolicyMapping keywords for category ${categoryId}`);
            return this.matchKeywords(text, list);
        }

        console.debug('PolicyMapping keywords empty, falling back to KR_MAP');

        // Allocated only on fallback path — skipped when DB keywords are used
        const KR_MAP = {
            "violence": ["kill", "murder", "attack", "wipe out", "revolt", "overthrow", "weapons", "terrorism", "extremist", "bomb", "explode", "sovereignty", "integrity", "చంపేస్తా", "దాడి", "मारो", "बम"],
            "sexual": ["rape", "sex", "modesty", "nudity", "porn", "బలాత్కారం", "బలాత్కరించు", "बलात्कार"],
            "hate": ["scum", "drive them out", "dehumanizing", "hateful conduct", "promoting enmity", "తరిమేస్తాం", "నికృష్ట", "కుక్కలు", "भगाओ", "नीच"],
            "harassment": ["idiot", "stupid", "moron", "useless", "shut up", "అవినీతి", "దొంగ", "बेवकूफ", "चोर"],
            "religious": ["religion", "god", "mulla", "temple", "mosque", "church", "prophet", "idol", "blasphemy", "దేవుడు", "గుడి", "మసీదు", "చర్చి", "धर्म", "भगवान", "मंदिर"],
            "communal": ["hindu", "muslim", "christian", "dalit", "brahmin", "caste", "minority", "majority", "కులం", "హిందూ", "ముస్లిం", "जाతి", "हिंदू", "मुस्लिम"],
            "privacy": ["address", "phone number", "aadhaar", "ssn", "passport", "చిరునామా", "ఫోన్ నంబర్", "आधार", "पता"],
            "civic": ["election", "vote", "voter card", "evm", "rigging", "misinformation", "ఓటు", "ఎన్నికలు", "चुनाव", "वोट"]
        };

        const flat = [];
        for (const cat in KR_MAP) {
            for (const kw of KR_MAP[cat]) {
                flat.push(kw);
            }
        }
        return this.matchKeywords(text, flat);
    }
}

module.exports = new MappingService();
