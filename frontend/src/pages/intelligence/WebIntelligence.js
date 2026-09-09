import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Globe,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  Search,
  Radar,
  Link2,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import { bluwebApi, formatBluwebError } from '../../api';
import { CACHE_TTL, cacheGet, cacheInvalidate, cacheSet } from './cache';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const PREFLIGHT_OK = new Set(['completed', 'ready', 'ok', 'success', 'succeeded']);

/** Hostname for display labels — never leave a prior preflight domain stuck. */
const hostnameFromUrl = (raw) => {
  try {
    return new URL(raw).hostname || '';
  } catch {
    return '';
  }
};

/** FE URL guard (WI-10): reject empty, nested schemes, and non-http(s). */
const validateHttpUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value || value === 'https://' || value === 'http://') {
    return 'Enter a valid http(s) URL.';
  }
  if (/^(https?:\/\/)+(https?:\/\/)/i.test(value)) {
    return 'Enter a valid http(s) URL.';
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return 'Enter a valid http(s) URL.';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Enter a valid http(s) URL.';
  }
  if (!parsed.hostname || ['http', 'https'].includes(parsed.hostname.toLowerCase())) {
    return 'Enter a valid http(s) URL.';
  }
  return '';
};

const sourceNameMismatchesUrl = (source) => {
  const fromUrl = hostnameFromUrl(source?.base_url || source?.url || '');
  if (!fromUrl) return false;
  return String(source?.name || '').trim().toLowerCase() !== fromUrl.toLowerCase();
};

const preflightCanCreate = (preflight) => {
  if (!preflight?.preflight_id) return false;
  if (preflight.error) return false;
  const status = String(preflight.status || '').toLowerCase();
  if (status === 'failed' || status === 'not_ready' || status === 'error') return false;
  return PREFLIGHT_OK.has(status) || Boolean(preflight.capability || preflight.fetch);
};

const ErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-xs text-red-800 dark:text-red-200 flex gap-2 items-start">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span className="break-all">{message}</span>
    </div>
  );
};

const StatusChip = ({ status }) => {
  const s = String(status || '').toLowerCase();
  const tone =
    s === 'completed' || s === 'active' || s === 'ready' || s === 'ok' || s === 'alive' || s === 'success' || s === 'succeeded'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : s === 'failed' || s === 'not_ready' || s === 'paused' || s === 'error'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : s === 'running' || s === 'queued' || s === 'cancelling'
          ? 'bg-sky-50 text-sky-800 border-sky-200'
          : 'bg-muted text-muted-foreground border-border';
  return (
    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', tone)}>
      {status || '—'}
    </span>
  );
};

const Empty = ({ children }) => (
  <p className="text-xs text-muted-foreground text-center py-8">{children}</p>
);

const SkeletonBlock = ({ className }) => (
  <div className={cn('animate-pulse rounded bg-muted/60', className)} />
);

const WebIntelligence = () => {
  const [tab, setTab] = useState('overview');
  const [ready, setReady] = useState(null);
  const [readyError, setReadyError] = useState('');
  const [busy, setBusy] = useState(false);

  // Overview
  const [crawls, setCrawls] = useState([]);
  const [sources, setSources] = useState([]);
  const [overviewError, setOverviewError] = useState('');
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Sources tab
  const [preflightUrl, setPreflightUrl] = useState('https://');
  const [preflight, setPreflight] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceInterval, setSourceInterval] = useState(900);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [sourceEvents, setSourceEvents] = useState([]);
  const [sourceStats, setSourceStats] = useState(null);
  const [sourceError, setSourceError] = useState('');
  const [sourceStatsError, setSourceStatsError] = useState('');
  const [sourceEventsError, setSourceEventsError] = useState('');
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);

  // Crawl tab
  const [crawlUrl, setCrawlUrl] = useState('https://');
  const [maxPages, setMaxPages] = useState(5);
  const [maxDepth, setMaxDepth] = useState(1);
  const [activeCrawl, setActiveCrawl] = useState(null);
  const [crawlPages, setCrawlPages] = useState([]);
  const [crawlDocs, setCrawlDocs] = useState([]);
  const [crawlError, setCrawlError] = useState('');
  const [crawlArtifactsLoading, setCrawlArtifactsLoading] = useState(false);
  const pollAbortRef = useRef(null);
  const pollPausedRef = useRef(false);
  const activeCrawlIdRef = useRef(null);

  // Documents tab — source-first browser (IDs stay internal only)
  const [docSelectedSource, setDocSelectedSource] = useState(null); // { source_id, name, domain, … }
  const [sourceDocuments, setSourceDocuments] = useState([]);
  const [sourceDocCounts, setSourceDocCounts] = useState({}); // source_id → total_documents
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docVersion, setDocVersion] = useState(null);
  const [docChanges, setDocChanges] = useState([]);
  const [docDiff, setDocDiff] = useState(null);
  const [diffFrom, setDiffFrom] = useState(1);
  const [diffTo, setDiffTo] = useState(2);
  const [docError, setDocError] = useState('');
  const [loadingDocSources, setLoadingDocSources] = useState(false);
  const [loadingSourceDocuments, setLoadingSourceDocuments] = useState(false);
  const [loadingDocDetail, setLoadingDocDetail] = useState(false);
  const [docSourcesLoaded, setDocSourcesLoaded] = useState(false);
  // Internal handoff from Crawl tab only — never shown as a primary user input
  const [docHandoffCrawlId, setDocHandoffCrawlId] = useState('');
  const [showDocDebugFilters, setShowDocDebugFilters] = useState(false);

  // Search tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDomain, setSearchDomain] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [instantUrl, setInstantUrl] = useState('https://');
  const [instantQuery, setInstantQuery] = useState('');
  const [instantResult, setInstantResult] = useState(null);
  const [instantLoading, setInstantLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchAbortRef = useRef(null);
  const instantAbortRef = useRef(null);

  // Intelligence tab
  const [intelMode, setIntelMode] = useState('entities');
  const [entities, setEntities] = useState([]);
  const [stories, setStories] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedStory, setSelectedStory] = useState(null);
  const [entityDocs, setEntityDocs] = useState(null);
  const [storyTimeline, setStoryTimeline] = useState(null);
  const [storyEntities, setStoryEntities] = useState(null);
  const [intelError, setIntelError] = useState('');
  const [entitiesError, setEntitiesError] = useState('');
  const [storiesError, setStoriesError] = useState('');
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [intelLoaded, setIntelLoaded] = useState(false);

  const refreshReady = useCallback(async () => {
    try {
      const res = await bluwebApi.healthReady();
      setReady(res.data);
      setReadyError('');
    } catch (err) {
      setReady(null);
      setReadyError(formatBluwebError(err));
    }
  }, []);

  const refreshOverview = useCallback(async ({ force = false } = {}) => {
    setOverviewError('');
    setOverviewLoading(true);
    try {
      const cacheKey = 'overview:lists';
      if (!force) {
        const cached = cacheGet(cacheKey);
        if (cached) {
          setCrawls(cached.crawls);
          setSources(cached.sources);
          setOverviewLoaded(true);
          setOverviewLoading(false);
          return;
        }
      }
      const [cRes, sRes] = await Promise.all([
        bluwebApi.listCrawls(),
        bluwebApi.listSources(),
      ]);
      const nextCrawls = Array.isArray(cRes.data) ? cRes.data : [];
      const nextSources = Array.isArray(sRes.data) ? sRes.data : [];
      setCrawls(nextCrawls);
      setSources(nextSources);
      cacheSet(cacheKey, { crawls: nextCrawls, sources: nextSources }, CACHE_TTL.overview);
      setOverviewLoaded(true);
    } catch (err) {
      setOverviewError(formatBluwebError(err));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshReady();
    refreshOverview();
  }, [refreshReady, refreshOverview]);

  useEffect(() => () => {
    pollAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    instantAbortRef.current?.abort();
  }, []);

  // WI-01: pause crawl polling while not on Crawl tab; resume if still running.
  useEffect(() => {
    const onCrawlTab = tab === 'crawl';
    pollPausedRef.current = !onCrawlTab;
    if (onCrawlTab && activeCrawlIdRef.current) {
      const status = String(activeCrawl?.status || '').toLowerCase();
      if (activeCrawl && !TERMINAL.has(status) && !pollAbortRef.current) {
        // Resume poller after leaving/returning without an active controller.
        const crawlId = activeCrawlIdRef.current;
        const controller = new AbortController();
        pollAbortRef.current = controller;
        (async () => {
          try {
            const finalJob = await bluwebApi.pollCrawl(crawlId, {
              signal: controller.signal,
              onUpdate: setActiveCrawl,
              pausedRef: pollPausedRef,
            });
            setActiveCrawl(finalJob);
            await loadCrawlArtifacts(crawlId, { force: true });
            await refreshOverview({ force: true });
          } catch (err) {
            if (err.code !== 'ABORTED') setCrawlError(formatBluwebError(err));
          } finally {
            if (pollAbortRef.current === controller) pollAbortRef.current = null;
          }
        })();
      }
    }
    // eslint-disable-next-line
  }, [tab]);

  const serviceReady = String(ready?.status || '').toLowerCase() === 'ready';
  const writesDisabled = !serviceReady || busy;

  const loadCrawlArtifacts = async (crawlId, { force = false } = {}) => {
    if (!crawlId) return;
    const cacheKey = `crawlArtifacts:${crawlId}`;
    if (!force) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        setCrawlPages(cached.pages);
        setCrawlDocs(cached.docs);
        return;
      }
    }
    setCrawlArtifactsLoading(true);
    try {
      const [pagesRes, docsRes] = await Promise.all([
        bluwebApi.getCrawlPages(crawlId).catch(() => ({ data: [] })),
        bluwebApi.listDocuments({ crawl_id: crawlId }).catch(() => ({ data: [] })),
      ]);
      const pages = Array.isArray(pagesRes.data) ? pagesRes.data : [];
      const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
      setCrawlPages(pages);
      setCrawlDocs(docs);
      cacheSet(cacheKey, { pages, docs }, CACHE_TTL.crawlArtifacts);
    } finally {
      setCrawlArtifactsLoading(false);
    }
  };

  const selectCrawl = async (crawl) => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    setActiveCrawl(crawl);
    activeCrawlIdRef.current = crawl?.crawl_id || null;
    setDocHandoffCrawlId(crawl?.crawl_id || '');
    setCrawlPages([]);
    setCrawlDocs([]);
    setTab('crawl');
    if (crawl?.crawl_id) {
      await loadCrawlArtifacts(crawl.crawl_id);
      const status = String(crawl.status || '').toLowerCase();
      if (!TERMINAL.has(status)) {
        const controller = new AbortController();
        pollAbortRef.current = controller;
        try {
          const finalJob = await bluwebApi.pollCrawl(crawl.crawl_id, {
            signal: controller.signal,
            onUpdate: setActiveCrawl,
            pausedRef: pollPausedRef,
          });
          setActiveCrawl(finalJob);
          await loadCrawlArtifacts(crawl.crawl_id, { force: true });
        } catch (err) {
          if (err.code !== 'ABORTED') setCrawlError(formatBluwebError(err));
        } finally {
          if (pollAbortRef.current === controller) pollAbortRef.current = null;
        }
      }
    }
  };

  const runPreflight = async () => {
    const urlErr = validateHttpUrl(preflightUrl);
    if (urlErr) {
      setSourceError(urlErr);
      return;
    }
    setSourceError('');
    setBusy(true);
    setPreflight(null);
    setSourceName('');
    try {
      const { data } = await bluwebApi.createPreflight({ url: preflightUrl.trim() });
      setPreflight(data);
      const status = String(data?.status || '').toLowerCase();
      const failed = status === 'failed' || Boolean(data?.error);
      if (failed) {
        setSourceName('');
        return;
      }
      const host =
        hostnameFromUrl(data?.final_url || data?.url || preflightUrl.trim()) || 'Monitored site';
      setSourceName(host);
    } catch (err) {
      setSourceName('');
      setPreflight(null);
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const syncSourceNameFromUrl = async (source) => {
    const host = hostnameFromUrl(source?.base_url || source?.url || '');
    if (!host || !source?.source_id) return;
    setBusy(true);
    setSourceError('');
    try {
      await bluwebApi.updateSource(source.source_id, { name: host });
      cacheInvalidate('overview:');
      cacheInvalidate(`sourceDetail:${source.source_id}`);
      await refreshOverview({ force: true });
      if (selectedSourceId === source.source_id) await loadSourceDetail(source.source_id, { force: true });
    } catch (err) {
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const createAndStartSource = async () => {
    if (!preflightCanCreate(preflight)) {
      setSourceError('Run a successful preflight first');
      return;
    }
    setSourceError('');
    setBusy(true);
    try {
      const { data: created } = await bluwebApi.createSource({
        name: sourceName.trim() || 'Website',
        url: preflight.final_url || preflight.url || preflightUrl.trim(),
        preflight_id: preflight.preflight_id,
        interval_seconds: Number(sourceInterval) || 900,
        source_type: 'website',
      });
      await bluwebApi.startSource(created.source_id);
      cacheInvalidate('overview:');
      await refreshOverview({ force: true });
      setSelectedSourceId(created.source_id);
      await loadSourceDetail(created.source_id, { force: true });
    } catch (err) {
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadSourceDetail = async (sourceId, { force = false } = {}) => {
    setSelectedSourceId(sourceId);
    setSourceError('');
    setSourceStatsError('');
    setSourceEventsError('');
    const cacheKey = `sourceDetail:${sourceId}`;
    if (!force) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        setSourceEvents(cached.events);
        setSourceStats(cached.stats);
        setSourceStatsError(cached.statsError || '');
        setSourceEventsError(cached.eventsError || '');
        return;
      }
    }
    setSourceDetailLoading(true);
    setSourceEvents([]);
    setSourceStats(null);
    try {
      const [evSettled, stSettled] = await Promise.allSettled([
        bluwebApi.getSourceEvents(sourceId),
        bluwebApi.getSourceStatistics(sourceId),
      ]);

      let events = [];
      let eventsError = '';
      if (evSettled.status === 'fulfilled') {
        const ev = evSettled.value;
        events = Array.isArray(ev.data) ? ev.data : ev.data?.events || [];
        setSourceEvents(events);
      } else {
        eventsError = formatBluwebError(evSettled.reason);
        setSourceEventsError(eventsError);
      }

      let stats = null;
      let statsError = '';
      if (stSettled.status === 'fulfilled') {
        stats = stSettled.value.data;
        setSourceStats(stats);
      } else {
        statsError = formatBluwebError(stSettled.reason);
        setSourceStatsError(statsError);
      }

      cacheSet(
        cacheKey,
        { events, stats, eventsError, statsError },
        CACHE_TTL.sourceDetail
      );
    } finally {
      setSourceDetailLoading(false);
    }
  };

  const toggleSource = async (source, action) => {
    setBusy(true);
    setSourceError('');
    try {
      if (action === 'start') await bluwebApi.startSource(source.source_id);
      else await bluwebApi.pauseSource(source.source_id);
      cacheInvalidate('overview:');
      cacheInvalidate(`sourceDetail:${source.source_id}`);
      await refreshOverview({ force: true });
      if (selectedSourceId === source.source_id) await loadSourceDetail(source.source_id, { force: true });
    } catch (err) {
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const startCrawl = async () => {
    const urlErr = validateHttpUrl(crawlUrl);
    if (urlErr) {
      setCrawlError(urlErr);
      return;
    }
    setCrawlError('');
    setBusy(true);
    setCrawlPages([]);
    setCrawlDocs([]);
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    pollPausedRef.current = tab !== 'crawl';

    try {
      const { data: job } = await bluwebApi.createCrawl({
        url: crawlUrl.trim(),
        max_pages: Number(maxPages) || 5,
        max_depth: Number(maxDepth) || 1,
        same_domain_only: true,
      });
      setActiveCrawl(job);
      activeCrawlIdRef.current = job.crawl_id;

      const finalJob = await bluwebApi.pollCrawl(job.crawl_id, {
        signal: controller.signal,
        onUpdate: setActiveCrawl,
        pausedRef: pollPausedRef,
      });
      setActiveCrawl(finalJob);

      await loadCrawlArtifacts(job.crawl_id, { force: true });
      cacheInvalidate('overview:');
      await refreshOverview({ force: true });
    } catch (err) {
      if (err.code !== 'ABORTED') setCrawlError(formatBluwebError(err));
    } finally {
      if (pollAbortRef.current === controller) pollAbortRef.current = null;
      setBusy(false);
    }
  };

  const openDocument = async (doc) => {
    setDocError('');
    setLoadingDocDetail(true);
    setSelectedDoc(null);
    setDocVersion(null);
    setDocChanges([]);
    setDocDiff(null);
    try {
      const { data: detail } = await bluwebApi.getDocument(doc.document_id);
      setSelectedDoc(detail);
      const version = detail.current_version || 1;
      setDiffFrom(Math.max(1, version - 1));
      setDiffTo(version);
      const [verRes, chRes] = await Promise.all([
        bluwebApi.getDocumentVersion(doc.document_id, version),
        bluwebApi.getDocumentChanges(doc.document_id).catch(() => ({ data: [] })),
      ]);
      setDocVersion(verRes.data);
      setDocChanges(Array.isArray(chRes.data) ? chRes.data : []);
    } catch (err) {
      setDocError(formatBluwebError(err));
    } finally {
      setLoadingDocDetail(false);
    }
  };

  const enrichSourceCounts = async (sourceList) => {
    const entries = await Promise.all(
      (sourceList || []).slice(0, 40).map(async (s) => {
        try {
          const { data } = await bluwebApi.getSourceStatistics(s.source_id);
          return [s.source_id, Number(data?.total_documents) || 0];
        } catch {
          return [s.source_id, null];
        }
      })
    );
    const next = {};
    for (const [id, count] of entries) next[id] = count;
    setSourceDocCounts((prev) => ({ ...prev, ...next }));
  };

  const ensureDocSources = async ({ force = false } = {}) => {
    setDocError('');
    // Prefer already-loaded overview sources — never ask the user for IDs.
    if (!force && sources.length > 0) {
      setDocSourcesLoaded(true);
      enrichSourceCounts(sources);
      return sources;
    }
    setLoadingDocSources(true);
    try {
      await refreshOverview({ force: true });
      const cached = cacheGet('overview:lists');
      let list = cached?.sources;
      if (!list) {
        const { data } = await bluwebApi.listSources();
        list = Array.isArray(data) ? data : [];
      }
      setDocSourcesLoaded(true);
      enrichSourceCounts(list);
      return list;
    } catch (err) {
      setDocError(formatBluwebError(err));
      return [];
    } finally {
      setLoadingDocSources(false);
    }
  };

  const loadDocumentsForSource = async (source, { force = false } = {}) => {
    if (!source?.source_id) return;
    setDocError('');
    setLoadingSourceDocuments(true);
    // Clear detail when switching sources (caller may also clear selectedDoc)
    try {
      const cacheKey = `sourceDocuments:${source.source_id}`;
      if (!force) {
        const cached = cacheGet(cacheKey);
        if (cached) {
          setSourceDocuments(cached);
          return;
        }
      }
      // Internal API param only — never shown in UI
      const { data } = await bluwebApi.listDocuments({ source_id: source.source_id });
      const list = Array.isArray(data) ? data : [];
      setSourceDocuments(list);
      cacheSet(cacheKey, list, CACHE_TTL.sourceDetail);
      setSourceDocCounts((prev) => ({ ...prev, [source.source_id]: list.length }));
    } catch (err) {
      setSourceDocuments([]);
      setDocError(formatBluwebError(err));
    } finally {
      setLoadingSourceDocuments(false);
    }
  };

  const selectDocSource = async (source) => {
    setDocSelectedSource(source);
    setDocHandoffCrawlId(''); // leave crawl-scoped debug view when picking a source
    setSelectedDoc(null);
    setDocVersion(null);
    setDocChanges([]);
    setDocDiff(null);
    setSourceDocuments([]);
    await loadDocumentsForSource(source, { force: true });
  };

  /** Debug/developer: load by internal crawl handoff id (not part of normal UX). */
  const loadDocumentsByHandoffCrawl = async () => {
    if (!docHandoffCrawlId.trim()) return;
    setDocError('');
    setLoadingSourceDocuments(true);
    setDocSelectedSource(null);
    setSelectedDoc(null);
    try {
      const { data } = await bluwebApi.listDocuments({ crawl_id: docHandoffCrawlId.trim() });
      setSourceDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      setSourceDocuments([]);
      setDocError(formatBluwebError(err));
    } finally {
      setLoadingSourceDocuments(false);
    }
  };

  const loadDiff = async () => {
    if (!selectedDoc?.document_id) return;
    setDocError('');
    try {
      const { data } = await bluwebApi.getDocumentDiff(selectedDoc.document_id, {
        from_version: Number(diffFrom),
        to_version: Number(diffTo),
      });
      setDocDiff(data);
    } catch (err) {
      setDocError(formatBluwebError(err));
    }
  };

  const runSearch = async () => {
    setSearchError('');
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    try {
      const { data } = await bluwebApi.search(
        {
          query: searchQuery.trim() || null,
          domain: searchDomain.trim() || null,
          limit: 20,
          offset: 0,
        },
        { signal: controller.signal }
      );
      if (!controller.signal.aborted) setSearchResults(data);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.code === 'ABORTED') return;
      setSearchError(formatBluwebError(err));
    } finally {
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    searchAbortRef.current?.abort();
    setSearchQuery('');
    setSearchDomain('');
    setSearchResults(null);
    setSearchError('');
  };

  const runInstantSearch = async () => {
    const urlErr = validateHttpUrl(instantUrl);
    if (urlErr) {
      setSearchError(urlErr);
      return;
    }
    setSearchError('');
    instantAbortRef.current?.abort();
    const controller = new AbortController();
    instantAbortRef.current = controller;
    setInstantLoading(true);
    setBusy(true);
    try {
      const { data } = await bluwebApi.instantSearch(
        {
          url: instantUrl.trim(),
          query: instantQuery.trim() || null,
          max_pages: 5,
          wait_seconds: 8,
        },
        { signal: controller.signal }
      );
      if (!controller.signal.aborted) setInstantResult(data);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.code === 'ABORTED') return;
      setSearchError(formatBluwebError(err));
    } finally {
      if (instantAbortRef.current === controller) instantAbortRef.current = null;
      setInstantLoading(false);
      setBusy(false);
    }
  };

  const loadIntelligence = async ({ force = false } = {}) => {
    setIntelError('');
    setEntitiesError('');
    setStoriesError('');
    if (!force) {
      const cached = cacheGet('intelligence:lists');
      if (cached) {
        setEntities(cached.entities);
        setStories(cached.stories);
        setIntelLoaded(true);
        return;
      }
    }
    setEntitiesLoading(true);
    setStoriesLoading(true);
    try {
      const [eSettled, sSettled] = await Promise.allSettled([
        bluwebApi.listEntities(),
        bluwebApi.listStories(),
      ]);
      let nextEntities = [];
      let nextStories = [];
      if (eSettled.status === 'fulfilled') {
        nextEntities = Array.isArray(eSettled.value.data) ? eSettled.value.data : [];
        setEntities(nextEntities);
      } else {
        setEntitiesError(formatBluwebError(eSettled.reason));
      }
      if (sSettled.status === 'fulfilled') {
        nextStories = Array.isArray(sSettled.value.data) ? sSettled.value.data : [];
        setStories(nextStories);
      } else {
        setStoriesError(formatBluwebError(sSettled.reason));
      }
      cacheSet(
        'intelligence:lists',
        { entities: nextEntities, stories: nextStories },
        CACHE_TTL.intelligence
      );
      setIntelLoaded(true);
    } finally {
      setEntitiesLoading(false);
      setStoriesLoading(false);
    }
  };

  const openEntity = async (entity) => {
    setSelectedEntity(entity);
    setSelectedStory(null);
    try {
      const [detail, docs] = await Promise.all([
        bluwebApi.getEntity(entity.entity_id),
        bluwebApi.getEntityDocuments(entity.entity_id),
      ]);
      setSelectedEntity(detail.data);
      setEntityDocs(docs.data);
    } catch (err) {
      setIntelError(formatBluwebError(err));
    }
  };

  const openStory = async (story) => {
    setSelectedStory(story);
    setSelectedEntity(null);
    try {
      const [detail, timeline, ents] = await Promise.all([
        bluwebApi.getStory(story.story_id),
        bluwebApi.getStoryTimeline(story.story_id),
        bluwebApi.getStoryEntities(story.story_id),
      ]);
      setSelectedStory(detail.data);
      setStoryTimeline(timeline.data);
      setStoryEntities(ents.data);
    } catch (err) {
      setIntelError(formatBluwebError(err));
    }
  };

  useEffect(() => {
    if (tab === 'documents' && !docSourcesLoaded && !loadingDocSources) {
      ensureDocSources();
    }
    if (tab === 'intelligence' && !intelLoaded) loadIntelligence();
    // eslint-disable-next-line
  }, [tab]);

  return (
    <div className="w-full space-y-3 animate-in fade-in duration-300" data-testid="web-intelligence-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Create Web Intelligence
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Bluweb crawl, monitoring sources, documents, search, and entity intelligence
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {ready ? (
            <StatusChip status={ready.status} />
          ) : readyError ? (
            <StatusChip status="offline" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              refreshReady();
              cacheInvalidate('overview:');
              refreshOverview({ force: true });
            }}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <ErrorBanner message={readyError} />
      {!serviceReady && !readyError && ready && (
        <ErrorBanner message="Bluweb is not ready — write actions are disabled until /health/ready succeeds." />
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="sources" className="text-xs">Sources</TabsTrigger>
          <TabsTrigger value="crawl" className="text-xs">Crawl</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
          <TabsTrigger value="search" className="text-xs">Search</TabsTrigger>
          <TabsTrigger value="intelligence" className="text-xs">Intelligence</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-3">
          <ErrorBanner message={overviewError} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Sources', value: sources.length, icon: Link2 },
              { label: 'Crawls', value: crawls.length, icon: Radar },
              {
                label: 'Active sources',
                value: sources.filter((s) => String(s.status).toLowerCase() === 'active').length,
                icon: Play,
              },
              {
                label: 'Running crawls',
                value: crawls.filter((c) => ['queued', 'running'].includes(String(c.status).toLowerCase())).length,
                icon: Loader2,
              },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <card.icon className="h-3 w-3" />
                  {card.label}
                </div>
                {overviewLoading && !overviewLoaded ? (
                  <SkeletonBlock className="h-8 w-12 mt-1" />
                ) : (
                  <div className="text-2xl font-semibold tabular-nums mt-1">{card.value}</div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Recent crawls</div>
              <div className="max-h-64 overflow-y-auto divide-y">
                {overviewLoading && !overviewLoaded ? (
                  <div className="p-3 space-y-2">
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-5/6" />
                  </div>
                ) : crawls.length === 0 ? (
                  <Empty>No crawls yet</Empty>
                ) : (
                  crawls.slice(0, 20).map((c) => (
                    <button
                      key={c.crawl_id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 flex items-center gap-2"
                      onClick={() => selectCrawl(c)}
                    >
                      <StatusChip status={c.status} />
                      <span className="truncate flex-1">{c.seed_url}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Sources</div>
              <div className="max-h-64 overflow-y-auto divide-y">
                {overviewLoading && !overviewLoaded ? (
                  <div className="p-3 space-y-2">
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                  </div>
                ) : sources.length === 0 ? (
                  <Empty>No sources registered</Empty>
                ) : (
                  sources.slice(0, 20).map((s) => (
                    <button
                      key={s.source_id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 flex items-center gap-2"
                      onClick={() => {
                        setTab('sources');
                        loadSourceDetail(s.source_id);
                      }}
                    >
                      <StatusChip status={s.status} />
                      <span className="truncate flex-1 font-medium">{s.name}</span>
                      <span className="text-muted-foreground truncate max-w-[40%]">{s.domain || s.base_url}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Sources */}
        <TabsContent value="sources" className="space-y-3">
          <ErrorBanner message={sourceError} />
          <div className="rounded-lg border border-border p-3 space-y-2">
            <h2 className="text-sm font-semibold">Register website for monitoring</h2>
            <p className="text-[11px] text-muted-foreground">
              Preflight (synchronous) → create source (paused) → start. Preflight can take tens of seconds.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={preflightUrl}
                onChange={(e) => setPreflightUrl(e.target.value)}
                placeholder="https://example.com/"
                className="h-9 text-xs flex-1 min-w-[200px]"
              />
              <Button size="sm" className="h-9 text-xs" disabled={writesDisabled} onClick={runPreflight}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run preflight'}
              </Button>
            </div>
            {preflight && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <StatusChip status={preflight.status} />
                  <span className="font-mono text-[10px] text-muted-foreground">{preflight.preflight_id}</span>
                </div>
                <div>Score: {preflight.capability?.score ?? '—'} · Fetch: {preflight.fetch?.recommended || '—'}</div>
                {preflight.error && <div className="text-red-600">{preflight.error}</div>}
                {(preflight.limitations || []).slice(0, 3).map((l) => (
                  <div key={l} className="text-muted-foreground">• {l}</div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Input
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="Source name"
                    className="h-8 text-xs w-40"
                  />
                  <Input
                    type="number"
                    value={sourceInterval}
                    onChange={(e) => setSourceInterval(e.target.value)}
                    placeholder="Interval sec"
                    className="h-8 text-xs w-28"
                    min={60}
                    max={86400}
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writesDisabled || !preflightCanCreate(preflight)}
                    onClick={createAndStartSource}
                  >
                    Create & start
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40 flex justify-between">
                <span>All sources</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-1"
                  onClick={() => {
                    cacheInvalidate('overview:');
                    refreshOverview({ force: true });
                  }}
                >
                  Reload
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y">
                {!overviewLoaded && overviewLoading ? (
                  <div className="p-3 space-y-2">
                    <SkeletonBlock className="h-10 w-full" />
                    <SkeletonBlock className="h-10 w-full" />
                  </div>
                ) : sources.length === 0 ? (
                  <Empty>No sources</Empty>
                ) : (
                  sources.map((s) => (
                    <div key={s.source_id} className="px-3 py-2 text-xs flex items-center gap-2">
                      <button type="button" className="flex-1 text-left min-w-0" onClick={() => loadSourceDetail(s.source_id)}>
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-muted-foreground truncate">{s.base_url}</div>
                        {sourceNameMismatchesUrl(s) && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                            Name does not match URL — only the URL is monitored
                          </div>
                        )}
                      </button>
                      <StatusChip status={s.status} />
                      {sourceNameMismatchesUrl(s) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Set name from URL hostname"
                          disabled={writesDisabled}
                          onClick={() => syncSourceNameFromUrl(s)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {String(s.status).toLowerCase() === 'active' ? (
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={writesDisabled} onClick={() => toggleSource(s, 'pause')}>
                          <Pause className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={writesDisabled} onClick={() => toggleSource(s, 'start')}>
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">
                Source detail {selectedSourceId ? `· ${selectedSourceId.slice(0, 8)}…` : ''}
              </div>
              <div className="p-3 space-y-2 max-h-80 overflow-y-auto text-xs">
                {!selectedSourceId ? (
                  <Empty>Select a source</Empty>
                ) : sourceDetailLoading ? (
                  <div className="space-y-2">
                    <SkeletonBlock className="h-24 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                  </div>
                ) : (
                  <>
                    <ErrorBanner message={sourceStatsError} />
                    {sourceStats ? (
                      <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(sourceStats, null, 2)}
                      </pre>
                    ) : !sourceStatsError ? (
                      <p className="text-muted-foreground">No statistics</p>
                    ) : null}
                    <div className="font-medium">Events</div>
                    <ErrorBanner message={sourceEventsError} />
                    {(sourceEvents || []).length === 0 && !sourceEventsError ? (
                      <p className="text-muted-foreground">No events</p>
                    ) : (
                      sourceEvents.slice(0, 30).map((ev, i) => (
                        <div key={ev.event_id || i} className="border-b border-border/60 py-1">
                          <StatusChip status={ev.event_type || ev.type || ev.status} />{' '}
                          <span className="text-muted-foreground">{ev.created_at || ev.timestamp || ''}</span>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Crawl */}
        <TabsContent value="crawl" className="space-y-3">
          <ErrorBanner message={crawlError} />
          <div className="rounded-lg border border-border p-3 space-y-2">
            <h2 className="text-sm font-semibold">Instant crawl</h2>
            <div className="flex flex-wrap gap-2">
              <Input
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                placeholder="https://example.com/"
                className="h-9 text-xs flex-1 min-w-[200px]"
              />
              <Input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                className="h-9 text-xs w-24"
                min={1}
                max={1000}
                title="max_pages"
              />
              <Input
                type="number"
                value={maxDepth}
                onChange={(e) => setMaxDepth(e.target.value)}
                className="h-9 text-xs w-24"
                min={0}
                max={10}
                title="max_depth"
              />
              <Button size="sm" className="h-9 text-xs" disabled={writesDisabled} onClick={startCrawl}>
                {busy && activeCrawl && !TERMINAL.has(String(activeCrawl.status).toLowerCase()) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : null}
                Start crawl
              </Button>
            </div>
            {activeCrawl && (
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <StatusChip status={activeCrawl.status} />
                  <span className="font-mono text-[10px]">{activeCrawl.crawl_id}</span>
                </div>
                {activeCrawl.error && <div className="text-red-600">{activeCrawl.error}</div>}
                {activeCrawl.statistics && (
                  <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto">
                    {JSON.stringify(activeCrawl.statistics, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40 flex justify-between">
                <span>Pages</span>
                {crawlArtifactsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y">
                {crawlArtifactsLoading && crawlPages.length === 0 ? (
                  <div className="p-3 space-y-2">
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                  </div>
                ) : crawlPages.length === 0 ? (
                  <Empty>{activeCrawl ? 'No pages for this crawl' : 'No pages'}</Empty>
                ) : (
                  crawlPages.map((p, i) => (
                    <div key={`${p.url}-${i}`} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <StatusChip status={p.status} />
                        <span className="text-muted-foreground">{p.http_status}</span>
                      </div>
                      <div className="truncate">{p.url}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40 flex justify-between">
                <span>Documents from crawl</span>
                {crawlArtifactsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y">
                {crawlArtifactsLoading && crawlDocs.length === 0 ? (
                  <div className="p-3 space-y-2">
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                  </div>
                ) : crawlDocs.length === 0 ? (
                  <Empty>{activeCrawl ? 'No documents for this crawl' : 'No documents'}</Empty>
                ) : (
                  crawlDocs.map((d) => (
                    <button
                      key={d.document_id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40"
                      onClick={() => {
                        setTab('documents');
                        openDocument(d);
                      }}
                    >
                      <div className="font-medium truncate">{d.title || d.url}</div>
                      <div className="text-muted-foreground truncate">{d.domain}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Documents — Source → Documents → Detail (IDs never user-entered) */}
        <TabsContent value="documents" className="space-y-3">
          <ErrorBanner message={docError} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
              Choose a source by name, then browse its documents. No IDs required.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={loadingDocSources}
              onClick={() => {
                setDocSourcesLoaded(false);
                ensureDocSources({ force: true });
              }}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loadingDocSources && 'animate-spin')} />
              Reload sources
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[10px] text-muted-foreground"
              onClick={() => setShowDocDebugFilters((v) => !v)}
            >
              {showDocDebugFilters ? 'Hide debug' : 'Debug'}
            </Button>
          </div>

          {showDocDebugFilters && (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 space-y-2">
              <p className="text-[10px] text-amber-800 dark:text-amber-200">
                Developer only — crawl-scoped handoff. Ordinary users should pick a Source above.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={docHandoffCrawlId}
                  onChange={(e) => setDocHandoffCrawlId(e.target.value)}
                  placeholder="Internal crawl handoff (optional)"
                  className="h-8 text-xs w-64 font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!docHandoffCrawlId.trim() || loadingSourceDocuments}
                  onClick={loadDocumentsByHandoffCrawl}
                >
                  Load by crawl handoff
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Sources */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Sources</div>
              <div className="max-h-[28rem] overflow-y-auto divide-y">
                {loadingDocSources && !docSourcesLoaded && sources.length === 0 ? (
                  <div className="p-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground">Loading Sources…</p>
                    <SkeletonBlock className="h-12 w-full" />
                    <SkeletonBlock className="h-12 w-full" />
                    <SkeletonBlock className="h-12 w-5/6" />
                  </div>
                ) : sources.length === 0 ? (
                  <Empty>No sources available.</Empty>
                ) : (
                  sources.map((s) => {
                    const selected = docSelectedSource?.source_id === s.source_id;
                    const count = sourceDocCounts[s.source_id];
                    return (
                      <button
                        key={s.source_id}
                        type="button"
                        className={cn(
                          'w-full text-left px-3 py-2.5 text-xs hover:bg-muted/40',
                          selected && 'bg-muted/60 border-l-2 border-l-primary'
                        )}
                        onClick={() => selectDocSource(s)}
                      >
                        <div className="font-medium truncate">{s.name || s.domain || 'Unnamed source'}</div>
                        <div className="text-muted-foreground truncate">{s.domain || s.base_url}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <StatusChip status={s.status} />
                          <span>
                            {count == null ? '… documents' : `${count} document${count === 1 ? '' : 's'}`}
                          </span>
                          {s.last_crawl_at && (
                            <span className="truncate">· last crawl {String(s.last_crawl_at).slice(0, 19)}</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Documents for selected source */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40 flex items-center justify-between gap-2">
                <span className="truncate">
                  Documents
                  {docSelectedSource
                    ? ` · ${docSelectedSource.name || docSelectedSource.domain}`
                    : docHandoffCrawlId
                      ? ' · crawl handoff'
                      : ''}
                </span>
                {docSelectedSource && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-1"
                    disabled={loadingSourceDocuments}
                    onClick={() => loadDocumentsForSource(docSelectedSource, { force: true })}
                  >
                    <RefreshCw className={cn('h-3 w-3', loadingSourceDocuments && 'animate-spin')} />
                  </Button>
                )}
              </div>
              <div className="max-h-[28rem] overflow-y-auto divide-y">
                {!docSelectedSource && !docHandoffCrawlId ? (
                  <Empty>Select a source to view its documents.</Empty>
                ) : loadingSourceDocuments && sourceDocuments.length === 0 ? (
                  <div className="p-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground">Loading Documents…</p>
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-4/5" />
                  </div>
                ) : sourceDocuments.length === 0 ? (
                  <Empty>
                    {docSelectedSource
                      ? 'No documents found for this source.'
                      : 'No documents found for this crawl handoff.'}
                  </Empty>
                ) : (
                  sourceDocuments.map((d) => (
                    <button
                      key={d.document_id}
                      type="button"
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs hover:bg-muted/40',
                        selectedDoc?.document_id === d.document_id && 'bg-muted/60 border-l-2 border-l-primary'
                      )}
                      onClick={() => openDocument(d)}
                    >
                      <div className="font-medium truncate">{d.title || '(untitled)'}</div>
                      <div className="text-muted-foreground truncate">{d.url}</div>
                      {(d.page_type || d.current_version) && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {d.page_type || '—'}
                          {d.current_version != null ? ` · v${d.current_version}` : ''}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Detail + body */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Detail + body</div>
              <div className="p-3 space-y-2 max-h-[28rem] overflow-y-auto text-xs">
                {loadingDocDetail ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">Loading document detail…</p>
                    <SkeletonBlock className="h-6 w-3/4" />
                    <SkeletonBlock className="h-24 w-full" />
                  </div>
                ) : !selectedDoc ? (
                  <Empty>Select a document</Empty>
                ) : (
                  <>
                    <div className="font-semibold">{selectedDoc.title || '(untitled)'}</div>
                    <a href={selectedDoc.url} target="_blank" rel="noreferrer" className="text-sky-700 break-all underline">
                      {selectedDoc.url}
                    </a>
                    <div className="text-muted-foreground">
                      v{selectedDoc.current_version} · {selectedDoc.domain} · {selectedDoc.page_type || '—'}
                    </div>
                    {selectedDoc.story_id && (
                      <div className="text-muted-foreground">
                        Story confidence: {selectedDoc.story_match_confidence || '—'}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                      <Input type="number" className="h-8 text-xs w-20" value={diffFrom} onChange={(e) => setDiffFrom(e.target.value)} />
                      <span>→</span>
                      <Input type="number" className="h-8 text-xs w-20" value={diffTo} onChange={(e) => setDiffTo(e.target.value)} />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadDiff}>Diff</Button>
                    </div>
                    {docDiff && (
                      <pre className="text-[10px] bg-muted/40 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {(docDiff.diff || []).join('\n') || JSON.stringify(docDiff.summary, null, 2)}
                      </pre>
                    )}
                    <div className="font-medium pt-1">Body (version {docVersion?.version_number})</div>
                    <pre className="text-[10px] bg-muted/40 rounded p-2 whitespace-pre-wrap max-h-56 overflow-y-auto">
                      {docVersion?.content || '(empty)'}
                    </pre>
                    {(docChanges || []).length > 0 && (
                      <>
                        <div className="font-medium">Changes</div>
                        {docChanges.slice(0, 10).map((ch) => (
                          <div key={ch.change_id} className="border-b py-1">
                            <StatusChip status={ch.change_type} /> {ch.severity} · {ch.created_at}
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Search */}
        <TabsContent value="search" className="space-y-3">
          <ErrorBanner message={searchError} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Search className="h-4 w-4" /> Indexed search
              </h2>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="Query"
                className="h-9 text-xs"
              />
              <Input
                value={searchDomain}
                onChange={(e) => setSearchDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="Domain (optional)"
                className="h-9 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-9 text-xs" disabled={searchLoading} onClick={runSearch}>
                  {searchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Search
                </Button>
                <Button size="sm" variant="outline" className="h-9 text-xs" onClick={clearSearch}>
                  Clear
                </Button>
              </div>
              {searchLoading && !searchResults ? (
                <div className="space-y-2 py-2">
                  <SkeletonBlock className="h-6 w-full" />
                  <SkeletonBlock className="h-6 w-5/6" />
                </div>
              ) : searchResults ? (
                <div className="text-xs space-y-1 max-h-72 overflow-y-auto">
                  <div className="text-muted-foreground">
                    Total: {searchResults.total}
                    {searchLoading ? ' · updating…' : ''}
                  </div>
                  {(searchResults.results || []).length === 0 ? (
                    <Empty>No hits</Empty>
                  ) : (
                    (searchResults.results || []).map((hit) => (
                      <button
                        key={hit.document_id}
                        type="button"
                        className="w-full text-left border-b py-1.5 hover:bg-muted/40"
                        onClick={() => {
                          setTab('documents');
                          openDocument({ document_id: hit.document_id, title: hit.title, url: hit.url });
                        }}
                      >
                        <div className="font-medium">{hit.title || hit.url}</div>
                        <div className="text-muted-foreground line-clamp-2">{hit.snippet}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <h2 className="text-sm font-semibold">Instant crawl + search</h2>
              <Input value={instantUrl} onChange={(e) => setInstantUrl(e.target.value)} placeholder="https://…" className="h-9 text-xs" />
              <Input value={instantQuery} onChange={(e) => setInstantQuery(e.target.value)} placeholder="Filter query (optional)" className="h-9 text-xs" />
              <Button size="sm" className="h-9 text-xs" disabled={writesDisabled || instantLoading} onClick={runInstantSearch}>
                {instantLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Instant search
              </Button>
              {instantResult && (
                <div className="text-xs space-y-1">
                  <div>
                    Crawl <span className="font-mono text-[10px]">{instantResult.crawl_id}</span>{' '}
                    <StatusChip status={instantResult.crawl_status} />
                  </div>
                  {instantResult.note && <p className="text-muted-foreground">{instantResult.note}</p>}
                  <div className="text-muted-foreground">Hits: {instantResult.total}</div>
                  {(instantResult.results || []).map((hit) => (
                    <div key={hit.document_id} className="border-b py-1">
                      <div className="font-medium">{hit.title || hit.url}</div>
                      <div className="text-muted-foreground line-clamp-2">{hit.snippet}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Intelligence */}
        <TabsContent value="intelligence" className="space-y-3">
          <ErrorBanner message={intelError || (intelMode === 'entities' ? entitiesError : storiesError)} />
          <p className="text-[11px] text-muted-foreground">
            Bluweb stories and entities are separate from the sidebar Alerts badge, which counts catalog
            social-media alerts — not Bluweb change events.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={intelMode === 'entities' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setIntelMode('entities')}
            >
              Entities
            </Button>
            <Button
              size="sm"
              variant={intelMode === 'stories' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setIntelMode('stories')}
            >
              Stories
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs ml-auto"
              onClick={() => {
                cacheInvalidate('intelligence:');
                loadIntelligence({ force: true });
              }}
              disabled={entitiesLoading || storiesLoading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', (entitiesLoading || storiesLoading) && 'animate-spin')} />
              Reload
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">
                {intelMode === 'entities' ? 'Entities' : 'Stories'}
              </div>
              <div className="max-h-96 overflow-y-auto divide-y">
                {intelMode === 'entities' ? (
                  entitiesLoading && !intelLoaded ? (
                    <div className="p-3 space-y-2">
                      <SkeletonBlock className="h-8 w-full" />
                      <SkeletonBlock className="h-8 w-full" />
                      <SkeletonBlock className="h-8 w-4/5" />
                    </div>
                  ) : entities.length === 0 ? (
                    <Empty>No entities</Empty>
                  ) : (
                    entities.map((e) => (
                      <button
                        key={e.entity_id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40"
                        onClick={() => openEntity(e)}
                      >
                        <div className="font-medium">{e.canonical_name}</div>
                        <div className="text-muted-foreground">{e.entity_type} · {e.confidence}</div>
                      </button>
                    ))
                  )
                ) : storiesLoading && !intelLoaded ? (
                  <div className="p-3 space-y-2">
                    <SkeletonBlock className="h-8 w-full" />
                    <SkeletonBlock className="h-8 w-full" />
                  </div>
                ) : stories.length === 0 ? (
                  <Empty>No stories</Empty>
                ) : (
                  stories.map((s) => (
                    <button
                      key={s.story_id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40"
                      onClick={() => openStory(s)}
                    >
                      <div className="font-medium">{s.canonical_title}</div>
                      <div className="text-muted-foreground">
                        {s.status} · {s.document_count} docs · {s.entity_count} entities
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Detail</div>
              <div className="p-3 text-xs space-y-2 max-h-96 overflow-y-auto">
                {selectedEntity && (
                  <>
                    <div className="font-semibold">{selectedEntity.canonical_name}</div>
                    <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedEntity, null, 2)}
                    </pre>
                    {entityDocs && (
                      <div>
                        Linked docs: {(entityDocs.document_ids || []).length}
                        <ul className="list-disc pl-4 mt-1">
                          {(entityDocs.document_ids || []).slice(0, 20).map((id) => (
                            <li key={id}>
                              <button
                                type="button"
                                className="underline text-sky-700"
                                onClick={() => {
                                  setTab('documents');
                                  openDocument({ document_id: id });
                                }}
                              >
                                {id}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                {selectedStory && (
                  <>
                    <div className="font-semibold">{selectedStory.canonical_title}</div>
                    <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedStory, null, 2)}
                    </pre>
                    {storyEntities && (
                      <div>
                        Entities:{' '}
                        {Array.isArray(storyEntities)
                          ? storyEntities.map((e) => e.canonical_name || e.entity_id).join(', ')
                          : JSON.stringify(storyEntities)}
                      </div>
                    )}
                    {storyTimeline && (
                      <div>
                        <div className="font-medium">Timeline</div>
                        <pre className="text-[10px] bg-muted/40 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {JSON.stringify(storyTimeline, null, 2)}
                        </pre>
                      </div>
                    )}
                  </>
                )}
                {!selectedEntity && !selectedStory && <Empty>Select an entity or story</Empty>}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WebIntelligence;
