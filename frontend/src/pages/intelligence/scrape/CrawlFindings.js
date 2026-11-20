import React from 'react';
import { Badge } from '../../../components/ui/badge';
import {
  FileText, AlertTriangle, Layers, Link2, Clock, HardDrive, ArrowUpRight, Loader2, Users,
} from 'lucide-react';
import { crawlStats, formatBytes, formatDuration, isHttpUrl, pathOf } from './scrapeShape';

/** Presentational pieces of a finished crawl's report. Data loading lives in ScrapeWorkspace. */

const Label = ({ children, count }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}{count != null && <span className="rounded bg-muted px-1 tabular-nums">{count}</span>}
  </div>
);

const Tile = ({ icon: Icon, label, value, tone }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background p-2">
    <span className={`h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${tone === 'red' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
    <div className="min-w-0">
      <p className="text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">{label}</p>
      {/* A number or "1m 07s" must stay on one line; the label above is what wraps. */}
      <p className="text-sm font-semibold tabular-nums whitespace-nowrap">{value}</p>
    </div>
  </div>
);

// The tiles follow the width of the report pane, not of the window (the pane is much narrower than
// the window because of the sidebar and run list). Six in a row when there is room, otherwise as many
// as fit at 9rem each, down to one. No horizontal scrolling at any width.
export const STAT_GRID_STYLE = {
  display: 'grid',
  gap: '0.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(max(9rem, calc((100% - 2.5rem) / 6)), 1fr))',
};

const Note = ({ children }) => <p className="text-xs text-muted-foreground py-4 text-center">{children}</p>;

const day = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

export const StatTiles = ({ crawl, options }) => {
  const st = crawlStats(crawl);
  const depth = options?.max_depth ?? crawl?.max_depth;
  const pages = options?.max_pages ?? crawl?.max_pages;
  return (
    <>
      <div style={STAT_GRID_STYLE}>
        <Tile icon={FileText} label="Pages fetched" value={st.pagesFetched} />
        <Tile icon={Layers} label="Pages extracted" value={st.pagesExtracted} />
        <Tile icon={AlertTriangle} label="Failed" value={st.pagesFailed} tone={st.pagesFailed ? 'red' : undefined} />
        <Tile icon={Link2} label="Links found" value={st.linksFound} />
        <Tile icon={Clock} label="Time taken" value={st.durationMs ? formatDuration(st.durationMs) : '—'} />
        <Tile icon={HardDrive} label="Data size" value={st.bytes ? formatBytes(st.bytes) : '—'} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {depth != null ? `Followed links up to ${depth} deep` : 'Followed links'}
        {pages != null ? `, up to ${pages} pages` : ''}
        {options?.same_domain_only === false ? ', including other domains.' : options?.same_domain_only ? ', same domain only.' : '.'}
      </p>
    </>
  );
};

const EntityChip = ({ e }) => (
  <span
    title={e.confidence != null ? `${e.type} · confidence ${Math.round(e.confidence * 100)}%` : e.type}
    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
  >
    {e.name}
  </span>
);

/** One extracted page. Opening it asks the parent to load the page text. */
const DocumentCard = ({ doc, entities = [], text, onExpand }) => {
  const date = day(doc.publishedAt);
  return (
    <details
      className="group rounded-lg border border-border bg-background"
      onToggle={(ev) => { if (ev.currentTarget.open && onExpand) onExpand(doc); }}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-xs group-open:rotate-90 transition-transform select-none">▸</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold break-words">{doc.title}</p>
          <p className="text-[10px] text-muted-foreground truncate">{pathOf(doc.url)}</p>
        </div>
        {doc.pageType && <Badge variant="outline" className="text-[10px] capitalize">{doc.pageType}</Badge>}
        {entities.length > 0 && <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{entities.length} {entities.length === 1 ? 'entity' : 'entities'}</span>}
      </summary>
      <div className="px-3 pb-3 space-y-2.5 border-t border-border pt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {isHttpUrl(doc.url) && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Open page<ArrowUpRight className="h-3 w-3" />
            </a>
          )}
          {doc.author && <span>By {doc.author}</span>}
          {date && <span>Published {date}</span>}
          {doc.confidence != null && <span>Extraction confidence {Math.round(doc.confidence * 100)}%</span>}
        </div>
        {entities.length > 0 && <div className="flex flex-wrap gap-1">{entities.map((e) => <EntityChip key={e.id} e={e} />)}</div>}
        {!text || text.status === 'loading' ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Loading page text…</p>
        ) : text.status === 'error' ? (
          <p className="text-xs text-red-600">{text.message || 'Could not load the page text.'}</p>
        ) : text.content ? (
          <p className="text-xs leading-relaxed whitespace-pre-wrap break-words max-h-72 overflow-y-auto rounded-md bg-muted/30 p-2.5">{text.content}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No text was extracted from this page.</p>
        )}
      </div>
    </details>
  );
};

/** What the crawl actually collected. */
export const CollectedPages = ({ documents, entitiesByDoc, texts, onExpand, loading, error, wasEmpty }) => (
  <div className="space-y-2">
    <Label count={loading ? null : documents.length}>What was collected</Label>
    {loading && <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-3"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading what the crawl collected…</p>}
    {!loading && error && <Note>{error}</Note>}
    {!loading && !error && documents.length === 0 && (
      <Note>{wasEmpty
        ? 'This crawl finished without collecting any page. The Pages visited tab shows what happened to each URL.'
        : 'No readable content was extracted from the pages that were fetched. The Pages visited tab lists them.'}</Note>
    )}
    {!loading && !error && documents.map((d) => (
      <DocumentCard key={d.id} doc={d} entities={entitiesByDoc?.get(d.id) || []} text={texts?.[d.id]} onExpand={onExpand} />
    ))}
  </div>
);

/** People, organisations, phone numbers... found on the crawl's pages, grouped by kind. */
export const EntitiesFound = ({ groups, status }) => {
  if (status === 'loading') {
    return <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Finding people, organisations and contacts…</p>;
  }
  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="space-y-2">
      <Label count={total}><Users className="h-3 w-3" />Found on these pages</Label>
      {groups.map((g) => (
        <div key={g.type} className="rounded-lg border border-border bg-background p-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.type} · {g.items.length}</p>
          <div className="flex flex-wrap gap-1">{g.items.map((e) => <EntityChip key={e.id} e={e} />)}</div>
        </div>
      ))}
    </div>
  );
};

const PAGE_TONE = { fetched: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10', failed: 'text-red-600 border-red-500/30 bg-red-500/10' };

/** Every URL the crawl visited, including failures and why. */
export const PagesTable = ({ pages, loading }) => {
  if (loading) return <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-6 justify-center"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading pages…</p>;
  if (!pages.length) return <Note>No pages were recorded for this crawl.</Note>;
  return (
    <div className="space-y-2">
      <Label count={pages.length}>Pages visited</Label>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-3 py-2 font-semibold">Page</th>
              <th className="px-2 py-2 font-semibold">Depth</th>
              <th className="px-2 py-2 font-semibold">Result</th>
              <th className="px-2 py-2 font-semibold">Method</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p, i) => (
              <tr key={`${p.url}${i}`} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2 max-w-[420px]">
                  {isHttpUrl(p.url)
                    ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline break-all">{pathOf(p.url)}</a>
                    : <span className="font-medium break-all">{p.url}</span>}
                  {p.error && <p className="text-[11px] text-red-600 mt-0.5 break-words">{p.error}</p>}
                </td>
                <td className="px-2 py-2 tabular-nums text-muted-foreground">{p.depth}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <Badge variant="outline" className={`text-[10px] capitalize ${PAGE_TONE[p.status] || ''}`}>{p.status}</Badge>
                  {p.http != null && <span className="ml-1.5 text-muted-foreground tabular-nums">{p.http}</span>}
                </td>
                <td className="px-2 py-2 text-muted-foreground capitalize">{p.method || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
