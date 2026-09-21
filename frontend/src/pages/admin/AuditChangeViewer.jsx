import React, { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Search,
  Eye,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Code2,
  FileSpreadsheet,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';

// Format key names to human-readable labels (e.g. "page_id" -> "Page ID", "is_active" -> "Is Active")
const formatLabel = (key) => {
  if (!key) return '';
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\bIp\b/g, 'IP');
};

// Render value cleanly
const formatValue = (val) => {
  if (val === null || val === undefined) {
    return <span className="text-muted-foreground italic text-xs">None</span>;
  }
  if (typeof val === 'boolean') {
    return (
      <Badge variant={val ? 'default' : 'secondary'} className="text-[11px] font-mono">
        {val ? 'TRUE' : 'FALSE'}
      </Badge>
    );
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-muted-foreground text-xs">[Empty list]</span>;
      return (
        <span className="text-xs bg-muted/60 px-2 py-0.5 rounded text-foreground font-mono">
          {val.length} item{val.length > 1 ? 's' : ''}
        </span>
      );
    }
    return (
      <span className="text-xs bg-muted/60 px-2 py-0.5 rounded text-foreground font-mono">
        Object ({Object.keys(val).length} keys)
      </span>
    );
  }
  if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
    return (
      <a
        href={val}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1 break-all text-xs"
      >
        {val}
        <ExternalLink className="w-3 h-3 flex-shrink-0" />
      </a>
    );
  }
  return <span className="break-all text-xs text-foreground font-medium">{String(val)}</span>;
};

// Check if payload is a search query / results pattern
const getSearchData = (data) => {
  if (!data || typeof data !== 'object') return null;
  if (data.query !== undefined || (data.results && Array.isArray(data.results))) {
    return {
      query: data.query || '',
      results: Array.isArray(data.results) ? data.results : [],
      count: Array.isArray(data.results) ? data.results.length : (data.count || 0),
    };
  }
  return null;
};

// Extract differences between oldData and newData
const extractDifferences = (oldData, newData) => {
  const oldObj = (oldData && typeof oldData === 'object' && !Array.isArray(oldData)) ? oldData : {};
  const newObj = (newData && typeof newData === 'object' && !Array.isArray(newData)) ? newData : {};

  const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
  const changed = [];
  const unchanged = [];

  allKeys.forEach((key) => {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    const isDifferent = JSON.stringify(oldVal) !== JSON.stringify(newVal);

    if (isDifferent) {
      changed.push({ key, oldVal, newVal });
    } else {
      unchanged.push({ key, val: newVal !== undefined ? newVal : oldVal });
    }
  });

  return { changed, unchanged };
};

/**
 * Compact, human-friendly summary shown inside the table cell
 */
export const AuditChangeCell = ({ log, onOpenDetails }) => {
  const oldData = log?.old_data;
  const newData = log?.new_data;
  const details = log?.details;

  // Case 1: Search query with results (like in user screenshot)
  const searchPayload = getSearchData(newData) || getSearchData(details);
  if (searchPayload) {
    const firstResultName = searchPayload.results?.[0]?.name || searchPayload.results?.[0]?.title || null;
    return (
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Search className="w-3 h-3 text-blue-500" />
            Query
          </span>
          <span className="font-semibold text-foreground text-xs truncate max-w-[150px]">
            "{searchPayload.query || '—'}"
          </span>
          <span className="text-[11px] text-muted-foreground">
            ({searchPayload.results.length} {searchPayload.results.length === 1 ? 'result' : 'results'})
          </span>
        </div>
        {firstResultName && (
          <div className="text-[11px] text-muted-foreground truncate">
            Top match: <span className="font-medium text-foreground">{firstResultName}</span>
          </div>
        )}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDetails(log)}
            className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
          >
            <Eye className="w-3 h-3" />
            View Results
          </Button>
        </div>
      </div>
    );
  }

  // Case 2: Update (both old and new exist)
  if (oldData && newData) {
    const { changed } = extractDifferences(oldData, newData);
    const changedCount = changed.length;
    const previewKeys = changed.slice(0, 2).map((c) => formatLabel(c.key)).join(', ');

    return (
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[11px] font-normal border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
            {changedCount} {changedCount === 1 ? 'field changed' : 'fields changed'}
          </Badge>
          {previewKeys && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              ({previewKeys}{changedCount > 2 ? '…' : ''})
            </span>
          )}
        </div>
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDetails(log)}
            className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
          >
            <Eye className="w-3 h-3" />
            Compare Changes
          </Button>
        </div>
      </div>
    );
  }

  // Case 3: Created record (only new data)
  if (!oldData && newData) {
    const isObj = typeof newData === 'object' && !Array.isArray(newData);
    const primaryTitle = isObj ? (newData.name || newData.title || newData.handle || newData.email || newData.keyword) : null;
    const fieldCount = isObj ? Object.keys(newData).length : 0;

    return (
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[11px] font-normal border-emerald-300 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
            New Record
          </Badge>
          {primaryTitle && (
            <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
              {primaryTitle}
            </span>
          )}
        </div>
        {fieldCount > 0 && !primaryTitle && (
          <span className="text-[11px] text-muted-foreground">{fieldCount} fields added</span>
        )}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDetails(log)}
            className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
          >
            <Eye className="w-3 h-3" />
            View Record
          </Button>
        </div>
      </div>
    );
  }

  // Case 4: Deleted record (only old data)
  if (oldData && !newData) {
    const isObj = typeof oldData === 'object' && !Array.isArray(oldData);
    const primaryTitle = isObj ? (oldData.name || oldData.title || oldData.handle || oldData.email) : null;

    return (
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[11px] font-normal border-rose-300 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30">
            Deleted Record
          </Badge>
          {primaryTitle && (
            <span className="text-xs text-muted-foreground line-through truncate max-w-[160px]">
              {primaryTitle}
            </span>
          )}
        </div>
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDetails(log)}
            className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
          >
            <Eye className="w-3 h-3" />
            View Deleted
          </Button>
        </div>
      </div>
    );
  }

  // Case 5: Details object
  if (details && typeof details === 'object' && Object.keys(details).length > 0) {
    const entries = Object.entries(details);
    const isSmall = entries.length <= 2;

    if (isSmall) {
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="truncate">
              <span className="font-medium text-foreground">{formatLabel(k)}:</span> {String(v)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{entries.length} attributes</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenDetails(log)}
          className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
        >
          <Eye className="w-3 h-3" />
          View Details
        </Button>
      </div>
    );
  }

  return <span className="text-xs text-muted-foreground">—</span>;
};

/**
 * Full details modal with clean visual cards & raw JSON toggle
 */
export const AuditDetailModal = ({ log, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  if (!log) return null;

  const oldData = log.old_data;
  const newData = log.new_data;
  const details = log.details;

  const searchPayload = getSearchData(newData) || getSearchData(details);
  const isDiff = Boolean(oldData && newData);
  const { changed, unchanged } = isDiff ? extractDifferences(oldData, newData) : { changed: [], unchanged: [] };

  const rawJsonContent = JSON.stringify(
    {
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      old: oldData,
      new: newData,
      details: details,
    },
    null,
    2
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawJsonContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-xl">
        {/* Modal Header */}
        <DialogHeader className="p-5 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-4 pr-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold">Audit Event Details</DialogTitle>
                <Badge variant="outline" className="text-xs font-mono uppercase">
                  {log.action || 'ACTION'}
                </Badge>
                {log.resource_type && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {log.resource_type}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>By: <strong className="text-foreground">{log.user_name || log.user_email || 'System'}</strong></span>
                {log.ip && <span>IP: <strong className="text-foreground">{log.ip}</strong></span>}
                {log.device_label && <span>Device: <strong className="text-foreground">{log.device_label}</strong></span>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body with Tabs */}
        <Tabs defaultValue="visual" className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 border-b flex items-center justify-between bg-muted/10">
            <TabsList className="h-8">
              <TabsTrigger value="visual" className="text-xs gap-1.5 h-7">
                <Layers className="w-3.5 h-3.5" />
                Visual Overview
              </TabsTrigger>
              <TabsTrigger value="raw" className="text-xs gap-1.5 h-7">
                <Code2 className="w-3.5 h-3.5" />
                Raw JSON
              </TabsTrigger>
            </TabsList>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {/* TAB 1: VISUAL OVERVIEW */}
            <TabsContent value="visual" className="m-0 space-y-5">
              {/* CASE A: Search Results */}
              {searchPayload && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800/60 rounded-lg p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-500 text-white rounded-lg shadow-sm">
                          <Search className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs text-blue-700 dark:text-blue-300 font-medium">Search Query</div>
                          <div className="text-base font-bold text-foreground tracking-tight">
                            "{searchPayload.query}"
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-blue-600 text-white">
                        {searchPayload.results.length} {searchPayload.results.length === 1 ? 'Result Found' : 'Results Found'}
                      </Badge>
                    </div>
                  </div>

                  {searchPayload.results.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Matched Profiles / Pages
                      </div>
                      <div className="grid gap-2.5">
                        {searchPayload.results.map((item, idx) => (
                          <div
                            key={item.id || item.page_id || idx}
                            className="flex items-start justify-between gap-3 p-3.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-foreground">
                                  {item.name || item.title || 'Unknown Entity'}
                                </span>
                                {(item.id || item.page_id) && (
                                  <Badge variant="secondary" className="font-mono text-[10px]">
                                    ID: {item.id || item.page_id}
                                  </Badge>
                                )}
                              </div>
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline inline-flex items-center gap-1 break-all"
                                >
                                  {item.url}
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                              )}
                            </div>
                            {item.url && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="h-7 text-xs gap-1 flex-shrink-0"
                              >
                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                  Visit <ExternalLink className="w-3 h-3 ml-1" />
                                </a>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground text-xs border rounded-lg">
                      No results were returned for this query.
                    </div>
                  )}
                </div>
              )}

              {/* CASE B: Diff / Updates */}
              {!searchPayload && isDiff && (
                <div className="space-y-4">
                  {changed.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/40 px-4 py-2.5 border-b text-xs font-semibold text-muted-foreground flex justify-between items-center">
                        <span>Modified Fields ({changed.length})</span>
                        <span className="text-[11px] font-normal">Comparing Old vs New</span>
                      </div>
                      <div className="divide-y">
                        {changed.map(({ key, oldVal, newVal }) => (
                          <div key={key} className="p-3.5 grid grid-cols-1 md:grid-cols-12 gap-2 text-xs items-center">
                            <div className="md:col-span-3 font-medium text-foreground">
                              {formatLabel(key)}
                            </div>
                            <div className="md:col-span-4 p-2 rounded bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mb-0.5">Previous</div>
                              <div className="line-through text-rose-700 dark:text-rose-300">
                                {formatValue(oldVal)}
                              </div>
                            </div>
                            <div className="hidden md:flex md:col-span-1 justify-center text-muted-foreground">
                              <ArrowRight className="w-4 h-4" />
                            </div>
                            <div className="md:col-span-4 p-2 rounded bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mb-0.5">Updated</div>
                              <div className="text-emerald-800 dark:text-emerald-200 font-medium">
                                {formatValue(newVal)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-muted/30 border text-center text-xs text-muted-foreground">
                      No field changes detected between old and new snapshots.
                    </div>
                  )}

                  {/* Unchanged Fields Accordion */}
                  {unchanged.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowUnchanged(!showUnchanged)}
                        className="w-full px-4 py-2.5 bg-muted/20 text-xs font-medium text-muted-foreground flex items-center justify-between hover:bg-muted/30 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          {showUnchanged ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          Unchanged Fields ({unchanged.length})
                        </span>
                        <span className="text-[11px]">Click to {showUnchanged ? 'collapse' : 'expand'}</span>
                      </button>
                      {showUnchanged && (
                        <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t divide-y sm:divide-y-0 text-xs">
                          {unchanged.map(({ key, val }) => (
                            <div key={key} className="p-2 rounded bg-muted/20 flex flex-col gap-0.5">
                              <span className="text-[11px] text-muted-foreground font-medium">{formatLabel(key)}</span>
                              <div className="truncate">{formatValue(val)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* CASE C: Single Record (Create or Delete) */}
              {!searchPayload && !isDiff && (oldData || newData) && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {newData ? 'Created Record Attributes' : 'Deleted Record Attributes'}
                  </div>
                  <div className="border rounded-lg overflow-hidden divide-y">
                    {Object.entries((newData || oldData) && typeof (newData || oldData) === 'object' ? (newData || oldData) : {}).map(([key, val]) => (
                      <div key={key} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-muted/20 transition-colors">
                        <span className="font-medium text-muted-foreground sm:w-1/3">
                          {formatLabel(key)}
                        </span>
                        <div className="sm:w-2/3">
                          {formatValue(val)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CASE D: Details Extra Section */}
              {details && typeof details === 'object' && Object.keys(details).length > 0 && !searchPayload && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-primary" />
                    Additional Metadata
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(details).map(([k, v]) => (
                      <div key={k} className="p-2.5 rounded-lg border bg-muted/10 flex flex-col gap-0.5 text-xs">
                        <span className="text-[11px] text-muted-foreground font-medium">{formatLabel(k)}</span>
                        <span className="font-mono text-foreground break-all">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!searchPayload && !isDiff && !oldData && !newData && (!details || Object.keys(details).length === 0) && (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  No additional data attributes recorded for this activity.
                </div>
              )}
            </TabsContent>

            {/* TAB 2: RAW JSON (Clean formatting with syntax look) */}
            <TabsContent value="raw" className="m-0">
              <div className="rounded-lg border bg-slate-950 text-slate-100 p-4 font-mono text-xs overflow-auto max-h-[500px]">
                <pre className="whitespace-pre-wrap break-all leading-relaxed">
                  {rawJsonContent}
                </pre>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
