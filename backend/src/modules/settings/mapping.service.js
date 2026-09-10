const logger = require('../../lib/logger');
const { listActivePolicies } = require('./settings.service');

/**
 * Deterministic Mapping Engine
 * Resolves legal sections and platform policies based on category.
 * Dynamic: fetches from Postgres (cached).
 */
class MappingService {
    constructor() {
        this.mappingData = { category_mappings: [] }; // Initial empty state
        this.isLoaded = false;
        this.refreshTimer = null;
    }

    /**
     * Begin DB-backed mapping loads. Safe to call more than once.
     */
    async start() {
        if (this.refreshTimer) return this.waitForLoad();
        await this.loadMappings();
        this.refreshTimer = setInterval(() => this.loadMappings(), 5 * 60 * 1000);
        if (this.refreshTimer.unref) this.refreshTimer.unref();
    }

    async loadMappings({ db } = {}) {
        try {
            let mappings = await listActivePolicies({ db });

            // Startup / interval path has no tenant db. Also pull active
            // overrides from every provisioned tenant so keyword inference
            // is not stuck on an empty policy_mappings table forever.
            if (!db) {
                try {
                    const { forEachTenant } = require('../../lib/tenantDatabase.service');
                    const seen = new Set(mappings.map((m) => String(m.id || m.category_id)));
                    await forEachTenant(async (tenantPrisma) => {
                        const rows = await listActivePolicies({ db: tenantPrisma });
                        for (const row of rows) {
                            if (row.is_global) continue;
                            const key = String(row.id || row.category_id);
                            if (seen.has(key)) continue;
                            seen.add(key);
                            mappings.push(row);
                        }
                    });
                } catch (tenantErr) {
                    logger.warn(
                        `[MappingService] Tenant policy merge skipped: ${tenantErr.message}`
                    );
                }
            }

            this.mappingData.category_mappings = mappings.map((m) => ({
                category_id: m.category_id,
                definition: m.definition,
                severity_level: m.severity_level || 'Medium',
                keywords: m.keywords || [],
                country: 'IN',
                legal_sections: m.legal_sections,
                platform_policies:
                    m.platform_policies && typeof m.platform_policies === 'object'
                        ? m.platform_policies
                        : {},
            }));

            this.isLoaded = true;
            logger.info(
                `[MappingService] Successfully loaded ${mappings.length} category mappings from Postgres.`
            );
        } catch (error) {
            logger.error('[MappingService] Error loading mapping data from DB:', error.message);
            // Stay on last good cache if any; otherwise empty mappings.
            if (!this.isLoaded) {
                this.mappingData = { category_mappings: [] };
                this.isLoaded = true;
            }
        }
    }

    async waitForLoad(timeoutMs = 15000) {
        if (this.isLoaded) return;
        if (!this.refreshTimer) {
            await this.start();
            if (this.isLoaded) return;
        }
        const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 15000);
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (this.isLoaded) {
                    clearInterval(check);
                    resolve();
                    return;
                }
                if (Date.now() >= deadline) {
                    clearInterval(check);
                    if (!this.isLoaded) {
                        this.mappingData = { category_mappings: [] };
                        this.isLoaded = true;
                    }
                    resolve();
                }
            }, 100);
        });
    }

    // Method to force refresh (e.g., after Admin API update)
    async forceRefresh({ db } = {}) {
        logger.info("[MappingService] Force refreshing mappings...");
        await this.loadMappings({ db });
    }

    /**
     * Normalize category labels from LLM / UI to PolicyMapping category_id shape.
     * "Hate Speech" / "hate_speech" → "Hate_Speech"
     */
    normalizeCategoryId(category) {
        const raw = String(category || '').trim();
        if (!raw) return '';
        const collapsed = raw.replace(/[\s-]+/g, '_');
        const lower = collapsed.toLowerCase();
        const hit = this.mappingData.category_mappings.find(
            (m) => String(m.category_id).toLowerCase() === lower
        );
        if (hit) return hit.category_id;
        return collapsed
            .split('_')
            .filter(Boolean)
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join('_');
    }

    findMapping(category, country = 'IN') {
        const normalized = this.normalizeCategoryId(category);
        if (!normalized) return null;
        return (
            this.mappingData.category_mappings.find(
                (m) =>
                    String(m.category_id).toLowerCase() === normalized.toLowerCase() &&
                    (m.country || 'IN') === country
            ) ||
            this.mappingData.category_mappings.find(
                (m) => String(m.category_id).toLowerCase() === normalized.toLowerCase()
            ) ||
            null
        );
    }

    /**
     * Infer best policy category from text using Policy Manager keywords.
     * Skips Normal. Returns category_id or null.
     */
    inferCategoryFromText(text) {
        const hay = String(text || '').toLowerCase();
        if (!hay.trim()) return null;

        let best = null;
        let bestScore = 0;

        for (const mapping of this.mappingData.category_mappings) {
            const id = String(mapping.category_id || '');
            if (!id || /^normal$/i.test(id)) continue;
            const kws = Array.isArray(mapping.keywords) ? mapping.keywords : [];
            let score = 0;
            for (const kw of kws) {
                const term = String(kw || '').toLowerCase().trim();
                if (term.length < 2) continue;
                if (hay.includes(term)) score += Math.min(40, 8 + term.length);
            }
            if (score > bestScore) {
                bestScore = score;
                best = id;
            }
        }

        return bestScore > 0 ? best : null;
    }

    /**
     * Resolve legal sections and platform policies based on category.
     * @returns {object} { legal_sections, platform_policies, triggered_keywords, category_id }
     */
    resolveMapping(category, text, platform = 'x', country = 'IN') {
        const platformKey = String(platform || 'x').toLowerCase() === 'twitter'
            ? 'x'
            : String(platform || 'x').toLowerCase();

        const mapping = this.findMapping(category, country);

        const result = {
            category_id: mapping?.category_id || this.normalizeCategoryId(category) || null,
            legal_sections: [],
            platform_policies: [],
            triggered_keywords: []
        };

        if (mapping) {
            result.legal_sections = (mapping.legal_sections || []).map((s) => ({
                act: country === 'IN' ? 'BNS 2023' : 'International Law',
                section: s.code,
                description: s.title,
                code: s.code,
                title: s.title,
                id: s.id || s.code,
            }));

            const policiesMap = mapping.platform_policies || {};
            const policies = policiesMap[platformKey] || [];

            result.platform_policies = policies.map((p) => ({
                policy_id: p.id,
                policy_name: p.name,
                name: p.name,
                platform: platformKey
            }));
        } else if (category) {
            logger.info(`[MappingService] No mapping found for category: ${category} (Country: ${country})`);
        }

        result.triggered_keywords = this.extractKeywords(
            text,
            mapping ? (mapping.keywords || []) : [],
            result.category_id
        );

        return result;
    }

    /**
     * Resolve mapping for analysis: use ML category, else infer from policy keywords.
     */
    resolveForAnalysis({ category, text, platform = 'x', country = 'IN' } = {}) {
        let cat = this.normalizeCategoryId(category);
        if (!cat || /^normal$/i.test(cat) || /^unknown$/i.test(cat) || /^neutral$/i.test(cat)) {
            const inferred = this.inferCategoryFromText(text);
            if (inferred) cat = inferred;
        }
        return this.resolveMapping(cat, text, platform, country);
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
     * Extract triggered keywords from text using Policy Manager keywords only.
     * No hardcoded KR_MAP fallback.
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

        if (list.length === 0) return [];
        return this.matchKeywords(text, list);
    }
}

module.exports = new MappingService();
