import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Globe,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  Search,
  FileText,
  Radar,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { bluwebApi, formatBluwebError } from '../features/webIntelligence/api/bluwebApi';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

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
    s === 'completed' || s === 'active' || s === 'ready' || s === 'ok' || s === 'alive'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : s === 'failed' || s === 'not_ready' || s === 'paused'
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

const WebIntelligence = () => {
  const [tab, setTab] = useState('overview');
  const [ready, setReady] = useState(null);
  const [readyError, setReadyError] = useState('');
  const [busy, setBusy] = useState(false);

  // Overview
  const [crawls, setCrawls] = useState([]);
  const [sources, setSources] = useState([]);
  const [overviewError, setOverviewError] = useState('');

  // Sources tab
  const [preflightUrl, setPreflightUrl] = useState('https://');
  const [preflight, setPreflight] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceInterval, setSourceInterval] = useState(900);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [sourceEvents, setSourceEvents] = useState([]);
  const [sourceStats, setSourceStats] = useState(null);
  const [sourceError, setSourceError] = useState('');

  // Crawl tab
  const [crawlUrl, setCrawlUrl] = useState('https://');
  const [maxPages, setMaxPages] = useState(5);
  const [maxDepth, setMaxDepth] = useState(1);
  const [activeCrawl, setActiveCrawl] = useState(null);
  const [crawlPages, setCrawlPages] = useState([]);
  const [crawlDocs, setCrawlDocs] = useState([]);
  const [crawlError, setCrawlError] = useState('');
  const pollAbortRef = useRef(null);

  // Documents tab
  const [docFilterCrawlId, setDocFilterCrawlId] = useState('');
  const [docFilterDomain, setDocFilterDomain] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docVersion, setDocVersion] = useState(null);
  const [docChanges, setDocChanges] = useState([]);
  const [docDiff, setDocDiff] = useState(null);
  const [diffFrom, setDiffFrom] = useState(1);
  const [diffTo, setDiffTo] = useState(2);
  const [docError, setDocError] = useState('');

  // Search tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDomain, setSearchDomain] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [instantUrl, setInstantUrl] = useState('https://');
  const [instantQuery, setInstantQuery] = useState('');
  const [instantResult, setInstantResult] = useState(null);
  const [searchError, setSearchError] = useState('');

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

  const refreshOverview = useCallback(async () => {
    setOverviewError('');
    try {
      const [cRes, sRes] = await Promise.all([
        bluwebApi.listCrawls(),
        bluwebApi.listSources(),
      ]);
      setCrawls(Array.isArray(cRes.data) ? cRes.data : []);
      setSources(Array.isArray(sRes.data) ? sRes.data : []);
    } catch (err) {
      setOverviewError(formatBluwebError(err));
    }
  }, []);

  useEffect(() => {
    refreshReady();
    refreshOverview();
  }, [refreshReady, refreshOverview]);

  useEffect(() => () => {
    pollAbortRef.current?.abort();
  }, []);

  const serviceReady = String(ready?.status || '').toLowerCase() === 'ready';
  const writesDisabled = !serviceReady || busy;

  const runPreflight = async () => {
    setSourceError('');
    setBusy(true);
    setPreflight(null);
    try {
      const { data } = await bluwebApi.createPreflight({ url: preflightUrl.trim() });
      setPreflight(data);
      if (data?.url && !sourceName) {
        try {
          setSourceName(new URL(data.final_url || data.url).hostname);
        } catch {
          setSourceName('Monitored site');
        }
      }
    } catch (err) {
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const createAndStartSource = async () => {
    if (!preflight?.preflight_id) {
      setSourceError('Run preflight first');
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
      await refreshOverview();
      setSelectedSourceId(created.source_id);
    } catch (err) {
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadSourceDetail = async (sourceId) => {
    setSelectedSourceId(sourceId);
    setSourceError('');
    try {
      const [ev, st] = await Promise.all([
        bluwebApi.getSourceEvents(sourceId),
        bluwebApi.getSourceStatistics(sourceId),
      ]);
      setSourceEvents(Array.isArray(ev.data) ? ev.data : ev.data?.events || []);
      setSourceStats(st.data);
    } catch (err) {
      setSourceError(formatBluwebError(err));
    }
  };

  const toggleSource = async (source, action) => {
    setBusy(true);
    setSourceError('');
    try {
      if (action === 'start') await bluwebApi.startSource(source.source_id);
      else await bluwebApi.pauseSource(source.source_id);
      await refreshOverview();
      if (selectedSourceId === source.source_id) await loadSourceDetail(source.source_id);
    } catch (err) {
      setSourceError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const startCrawl = async () => {
    setCrawlError('');
    setBusy(true);
    setCrawlPages([]);
    setCrawlDocs([]);
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    try {
      const { data: job } = await bluwebApi.createCrawl({
        url: crawlUrl.trim(),
        max_pages: Number(maxPages) || 5,
        max_depth: Number(maxDepth) || 1,
        same_domain_only: true,
      });
      setActiveCrawl(job);

      const finalJob = await bluwebApi.pollCrawl(job.crawl_id, {
        signal: controller.signal,
        onUpdate: setActiveCrawl,
      });
      setActiveCrawl(finalJob);

      const [pagesRes, docsRes] = await Promise.all([
        bluwebApi.getCrawlPages(job.crawl_id).catch(() => ({ data: [] })),
        bluwebApi.listDocuments({ crawl_id: job.crawl_id }).catch(() => ({ data: [] })),
      ]);
      setCrawlPages(Array.isArray(pagesRes.data) ? pagesRes.data : []);
      setCrawlDocs(Array.isArray(docsRes.data) ? docsRes.data : []);
      await refreshOverview();
    } catch (err) {
      if (err.code !== 'ABORTED') setCrawlError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (doc) => {
    setDocError('');
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
    }
  };

  const loadDocuments = async () => {
    setDocError('');
    setBusy(true);
    try {
      const params = {};
      if (docFilterCrawlId.trim()) params.crawl_id = docFilterCrawlId.trim();
      if (docFilterDomain.trim()) params.domain = docFilterDomain.trim();
      const { data } = await bluwebApi.listDocuments(params);
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      setDocError(formatBluwebError(err));
    } finally {
      setBusy(false);
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
    setBusy(true);
    try {
      const { data } = await bluwebApi.search({
        query: searchQuery.trim() || null,
        domain: searchDomain.trim() || null,
        limit: 20,
        offset: 0,
      });
      setSearchResults(data);
    } catch (err) {
      setSearchError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const runInstantSearch = async () => {
    setSearchError('');
    setBusy(true);
    try {
      const { data } = await bluwebApi.instantSearch({
        url: instantUrl.trim(),
        query: instantQuery.trim() || null,
        max_pages: 5,
        wait_seconds: 8,
      });
      setInstantResult(data);
    } catch (err) {
      setSearchError(formatBluwebError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelError('');
    setBusy(true);
    try {
      const [eRes, sRes] = await Promise.all([
        bluwebApi.listEntities(),
        bluwebApi.listStories(),
      ]);
      setEntities(Array.isArray(eRes.data) ? eRes.data : []);
      setStories(Array.isArray(sRes.data) ? sRes.data : []);
    } catch (err) {
      setIntelError(formatBluwebError(err));
    } finally {
      setBusy(false);
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
    if (tab === 'documents' && documents.length === 0) loadDocuments();
    if (tab === 'intelligence' && entities.length === 0 && stories.length === 0) loadIntelligence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              refreshOverview();
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
                <div className="text-2xl font-semibold tabular-nums mt-1">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Recent crawls</div>
              <div className="max-h-64 overflow-y-auto divide-y">
                {crawls.length === 0 ? (
                  <Empty>No crawls yet</Empty>
                ) : (
                  crawls.slice(0, 20).map((c) => (
                    <button
                      key={c.crawl_id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 flex items-center gap-2"
                      onClick={() => {
                        setActiveCrawl(c);
                        setDocFilterCrawlId(c.crawl_id);
                        setTab('crawl');
                      }}
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
                {sources.length === 0 ? (
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
                    disabled={writesDisabled || String(preflight.status).toLowerCase() === 'failed'}
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
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1" onClick={refreshOverview}>
                  Reload
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y">
                {sources.length === 0 ? (
                  <Empty>No sources</Empty>
                ) : (
                  sources.map((s) => (
                    <div key={s.source_id} className="px-3 py-2 text-xs flex items-center gap-2">
                      <button type="button" className="flex-1 text-left min-w-0" onClick={() => loadSourceDetail(s.source_id)}>
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-muted-foreground truncate">{s.base_url}</div>
                      </button>
                      <StatusChip status={s.status} />
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
                ) : (
                  <>
                    {sourceStats && (
                      <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(sourceStats, null, 2)}
                      </pre>
                    )}
                    <div className="font-medium">Events</div>
                    {(sourceEvents || []).length === 0 ? (
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
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Pages</div>
              <div className="max-h-72 overflow-y-auto divide-y">
                {crawlPages.length === 0 ? (
                  <Empty>No pages</Empty>
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
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Documents from crawl</div>
              <div className="max-h-72 overflow-y-auto divide-y">
                {crawlDocs.length === 0 ? (
                  <Empty>No documents</Empty>
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

        {/* Documents */}
        <TabsContent value="documents" className="space-y-3">
          <ErrorBanner message={docError} />
          <div className="flex flex-wrap gap-2">
            <Input
              value={docFilterCrawlId}
              onChange={(e) => setDocFilterCrawlId(e.target.value)}
              placeholder="crawl_id filter"
              className="h-9 text-xs w-48"
            />
            <Input
              value={docFilterDomain}
              onChange={(e) => setDocFilterDomain(e.target.value)}
              placeholder="domain filter"
              className="h-9 text-xs w-40"
            />
            <Button size="sm" className="h-9 text-xs" onClick={loadDocuments} disabled={busy}>
              <FileText className="h-3.5 w-3.5 mr-1" />
              List (max 50)
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Documents</div>
              <div className="max-h-[28rem] overflow-y-auto divide-y">
                {documents.length === 0 ? (
                  <Empty>No documents</Empty>
                ) : (
                  documents.map((d) => (
                    <button
                      key={d.document_id}
                      type="button"
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs hover:bg-muted/40',
                        selectedDoc?.document_id === d.document_id && 'bg-muted/60'
                      )}
                      onClick={() => openDocument(d)}
                    >
                      <div className="font-medium truncate">{d.title || '(untitled)'}</div>
                      <div className="text-muted-foreground truncate">{d.url}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">Detail + body</div>
              <div className="p-3 space-y-2 max-h-[28rem] overflow-y-auto text-xs">
                {!selectedDoc ? (
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
                      <div>Story: {selectedDoc.story_id} ({selectedDoc.story_match_confidence})</div>
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
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Query" className="h-9 text-xs" />
              <Input value={searchDomain} onChange={(e) => setSearchDomain(e.target.value)} placeholder="Domain (optional)" className="h-9 text-xs" />
              <Button size="sm" className="h-9 text-xs" disabled={busy} onClick={runSearch}>Search</Button>
              {searchResults && (
                <div className="text-xs space-y-1 max-h-72 overflow-y-auto">
                  <div className="text-muted-foreground">Total: {searchResults.total}</div>
                  {(searchResults.results || []).map((hit) => (
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
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <h2 className="text-sm font-semibold">Instant crawl + search</h2>
              <Input value={instantUrl} onChange={(e) => setInstantUrl(e.target.value)} placeholder="https://…" className="h-9 text-xs" />
              <Input value={instantQuery} onChange={(e) => setInstantQuery(e.target.value)} placeholder="Filter query (optional)" className="h-9 text-xs" />
              <Button size="sm" className="h-9 text-xs" disabled={writesDisabled} onClick={runInstantSearch}>
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
          <ErrorBanner message={intelError} />
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
            <Button size="sm" variant="outline" className="h-8 text-xs ml-auto" onClick={loadIntelligence} disabled={busy}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', busy && 'animate-spin')} />
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
                  entities.length === 0 ? (
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
