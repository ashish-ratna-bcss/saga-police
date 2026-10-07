import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table';
import {
  Newspaper, Search, Loader2, Trash2, Globe, Languages, MapPin, Rss, Check, ChevronDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowRight, ExternalLink, X, Clock, RefreshCw, Zap, Archive, History,
  Layers
} from 'lucide-react';
import { newsApi } from '../../../api';
import { toast } from 'sonner';

// No 100: a page of full article bodies can pass BluGate's 2 MB response cap.
const PAGE_SIZES = [10, 20, 50];
const SEARCH_HISTORY_SIZE = 30;
// The news API answers within ~25 s (BluGate cuts off at 30 s); only drives the progress bar.
const LIVE_SEARCH_SECONDS = 30;

const errMsg = (err, fallback) => {
  if (err.response?.data?.code === 'NO_TENANT_DB') return 'This account has no tenant workspace, so nothing is saved for it.';
  return err.response?.data?.message || err.response?.data?.detail || err.response?.data?.error?.message || fallback;
};

const timeAgo = (ts) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const publishedLabel = (iso) => {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return '';
  return Date.now() - t < 7 * 86400000 ? timeAgo(t) : new Date(t).toLocaleDateString();
};
const placeOf = (a) => [a.district, a.state].filter(Boolean).join(', ') || a.country || '';
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; } };

/* ---------- filters ---------- */

const EMPTY_FILTERS = { keyword: '', minMatch: 1, country: [], language: [], state: [], source: [], location: '' };

// The keyword may be one phrase or a list of phrases split by commas, semicolons or
// new lines (the API ranks articles by how many phrases they match). This is only a
// preview count — the API's parse (query_phrases) is authoritative.
const listItems = (keyword) => {
  const seen = new Set();
  return String(keyword || '').split(/[,;\n\r]+/).map((s) => s.trim()).filter((s) => {
    const key = s.toLowerCase();
    if (!s || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const MIN_MATCH_OPTIONS = [1, 2, 3, 5, 10];
// The keyword travels in the URL; the backend refuses longer than this.
const MAX_KEYWORD_LENGTH = 6000;
const EMPTY_RANGE = { from: '', to: '' };

// Mirrors the API's matching: substring within a filter (so 'Telangana' also matches
// 'Andhra Pradesh & Telangana'), and source = registry id or name substring.
const FACETS = [
  { key: 'country', label: 'Country', icon: Globe, field: (s) => s.country },
  { key: 'language', label: 'Language', icon: Languages, field: (s) => s.language },
  { key: 'state', label: 'State', icon: MapPin, field: (s) => s.state },
  { key: 'source', label: 'Source', icon: Rss, field: (s) => s.id },
];
const SOURCE_TABLE_FACETS = FACETS.filter((f) => f.key !== 'source');
const matchesFacet = (facet, s, values) => {
  if (!values.length) return true;
  if (facet.key === 'source') {
    return values.some((v) => s.id === v || String(s.name || '').toLowerCase().includes(v.toLowerCase()));
  }
  const hay = String(facet.field(s) || '').toLowerCase();
  return values.some((v) => hay.includes(v.toLowerCase()));
};

const toParams = (f) => {
  const p = {};
  if (f.keyword.trim()) p.keyword = f.keyword.trim();
  // The selector only shows for lists; never let a leftover value narrow a single phrase.
  if (f.minMatch > 1 && listItems(p.keyword).length > 1) p.min_match = f.minMatch;
  FACETS.forEach(({ key }) => { if (f[key].length) p[key] = f[key].join(','); });
  if (f.location.trim()) p.location = f.location.trim();
  return p;
};
/** Stored search filters (API param strings) → form filters. */
const fromParams = (p = {}) => ({
  ...EMPTY_FILTERS,
  keyword: p.keyword || '',
  minMatch: Math.max(1, Number.parseInt(p.min_match, 10) || 1),
  location: p.location || '',
  ...Object.fromEntries(FACETS.map(({ key }) => [key, String(p[key] || '').split(',').map((v) => v.trim()).filter(Boolean)])),
});
const hasFilters = (f) => JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);
const describeFilters = (f, nameOf) => {
  const parts = FACETS.filter(({ key }) => f[key].length)
    .map(({ key }) => (key === 'source' ? f[key].map(nameOf) : f[key]).join(', '));
  if (f.location.trim()) parts.push(f.location.trim());
  if (f.minMatch > 1 && listItems(f.keyword).length > 1) parts.push(`at least ${f.minMatch} phrases`);
  return parts.join(' · ') || 'All sources';
};
const searchTitle = (f) => {
  const items = listItems(f.keyword);
  if (items.length > 1) return `${items[0]} +${items.length - 1} more`;
  return f.keyword?.trim() || 'Latest news';
};

/** Options for one facet, narrowed by the other selected facets, with source counts. */
const facetOptions = (sources, filters, facet, byId) => {
  const others = FACETS.filter((o) => o.key !== facet.key && filters[o.key].length);
  const counts = new Map();
  sources.forEach((s) => {
    if (!others.every((o) => matchesFacet(o, s, filters[o.key]))) return;
    const v = facet.field(s);
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([value, n]) => (facet.key === 'source'
      ? { value, label: byId.get(value)?.name || value, hint: byId.get(value)?.language }
      : { value, label: value, hint: n }))
    .sort((a, b) => a.label.localeCompare(b.label));
};
const useFacetOptions = (sources, filters, byId) => useMemo(
  () => Object.fromEntries(FACETS.map((f) => [f.key, facetOptions(sources, filters, f, byId)])),
  [sources, filters, byId]
);

const PRESETS = [
  { label: 'Telangana', filters: { state: ['Telangana'] } },
  { label: 'Telugu news', filters: { language: ['Telugu'] } },
  { label: 'India · English', filters: { country: ['India'], language: ['English'] } },
  { label: 'World news', filters: { country: ['International', 'United States', 'United Kingdom'] } },
];

const TYPE_LABEL = { newspaper: 'Newspaper', tv_news: 'TV news', digital_news: 'Digital', news_agency: 'Agency' };

const HEALTH = {
  checking: { dot: 'bg-amber-500 animate-pulse', label: 'checking gateway' },
  online: { dot: 'bg-emerald-500', label: 'gateway online' },
  offline: { dot: 'bg-red-500', label: 'gateway offline' },
  unconfigured: { dot: 'bg-red-500', label: 'not configured' },
};

/* ---------- small pieces ---------- */

const Chip = ({ dot, label, value }) => (
  <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
    {dot && <span className={`h-1.5 w-1.5 rounded-full self-center ${dot}`} />}
    <span className="tabular-nums font-semibold text-foreground">{value}</span> {label}
  </span>
);

const Label = ({ children, count }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}{count != null && <span className="rounded bg-muted px-1 tabular-nums">{count}</span>}
  </div>
);

const Empty = ({ children }) => <p className="text-xs text-muted-foreground py-8 text-center">{children}</p>;

const MultiSelect = ({ label, icon: Icon, options, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const toggle = (v) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = value.length === 0 ? label
    : value.length === 1 ? (options.find((o) => o.value === value[0])?.label || value[0])
      : `${label} · ${value.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}
          className={`h-8 gap-1.5 text-xs max-w-[220px] ${value.length ? 'border-primary/40 bg-primary/5 text-foreground' : 'text-muted-foreground'}`}>
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)} className="text-xs gap-2">
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-sm border flex items-center justify-center ${selected.has(o.value) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                    {selected.has(o.value) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate flex-1">{o.label}</span>
                  {o.hint != null && <span className="text-[10px] text-muted-foreground tabular-nums">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {value.length > 0 && (
            <div className="border-t border-border p-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => onChange([])}>
                Clear {label.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/** Keyword + facet filters, shared by the live and saved views. */
const FilterBar = ({ filters, setFilters, options, facetsDisabled, loading, submitLabel, placeholder, onSubmit, canClear, onClear, children }) => {
  const items = listItems(filters.keyword);
  const isList = items.length > 1;
  const tooLong = filters.keyword.length > MAX_KEYWORD_LENGTH;
  const lines = filters.keyword.split('\n').length;
  // One phrase stays a one-line box; a pasted list grows to show itself (up to 6 lines).
  const rows = isList || lines > 1 ? Math.min(6, Math.max(3, lines, Math.ceil(filters.keyword.length / 120))) : 1;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!tooLong) onSubmit(); }} className="rounded-xl border border-border bg-card p-2.5 space-y-2.5">
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Textarea value={filters.keyword} rows={rows} aria-label="Keyword or keyword list"
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyDown={(e) => {
              // Enter searches; Shift+Enter adds a line (one phrase per line also works).
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              const { form } = e.currentTarget;
              if (form?.requestSubmit) form.requestSubmit();
              else form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }}
            placeholder={placeholder}
            className={`pl-9 text-sm leading-6 ${rows === 1 ? 'min-h-0 h-10 resize-none overflow-hidden py-[7px]' : 'min-h-0 resize-y'} ${tooLong ? 'border-red-500 focus-visible:ring-red-500' : ''}`} />
        </div>
        <Button type="submit" disabled={loading || tooLong} className="h-10 px-5 gap-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-[10px] text-muted-foreground">
        {isList ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
              <Layers className="h-3 w-3" /> {items.length} phrases
            </span>
            <label className="inline-flex items-center gap-1.5">
              Show articles matching at least
              <Select value={String(filters.minMatch)} onValueChange={(v) => setFilters((x) => ({ ...x, minMatch: Number(v) }))}>
                <SelectTrigger className="h-6 w-16 text-[11px]" aria-label="Minimum phrases matched"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MIN_MATCH_OPTIONS.filter((n) => n <= items.length).map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              phrase{filters.minMatch === 1 ? '' : 's'}
            </label>
            <span>An article matches a phrase when it has all of that phrase’s words. More phrases matched = higher.</span>
          </>
        ) : (
          <span>
            Each word is searched separately and articles containing more of them come first. Paste several phrases separated by
            commas to search them all at once. Use &quot;quotes&quot; for an exact phrase. For Telugu, Hindi or Odia sources, type in that script.
          </span>
        )}
        {tooLong && (
          <span className="font-semibold text-red-600">
            Too long: {filters.keyword.length.toLocaleString()} / {MAX_KEYWORD_LENGTH.toLocaleString()} characters.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
      {FACETS.map((f) => (
        <MultiSelect key={f.key} label={f.label} icon={f.icon} value={filters[f.key]} options={options[f.key]}
          disabled={facetsDisabled} onChange={(v) => setFilters((x) => ({ ...x, [f.key]: v }))} />
      ))}
      <Input value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })}
        placeholder="Location" title="Matched against the article's district, location or state. Comma-separate for several."
        className="h-8 w-32 text-xs" />
      {children}
      {canClear && (
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      )}
      </div>
    </form>
  );
};

const LoadingNote = ({ elapsed }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="flex justify-between text-[11px] mb-1.5">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Fetching live from news sites…</span>
      <span className="tabular-nums font-semibold">{elapsed}s</span>
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${Math.min(95, Math.max(4, (elapsed / LIVE_SEARCH_SECONDS) * 100))}%` }} />
    </div>
    <p className="text-[10px] text-muted-foreground mt-1.5">
      A new search takes up to 30 seconds. Sources that need longer keep loading in the background; repeat searches return instantly for the next 10 minutes.
    </p>
  </div>
);
const QuickLoading = () => (
  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading from your workspace…</p>
);

const wordsOf = (a) => a.word_count ?? (a.content ? a.content.trim().split(/\s+/).filter(Boolean).length : 0);
const fullDate = (iso) => {
  const t = new Date(iso).getTime();
  return !iso || Number.isNaN(t) ? '' : new Date(t).toLocaleString();
};
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Highlights search terms with the API's rule: Latin-script terms from the start
 *  of a word ('kill' not inside 'skill'), Indian scripts anywhere. */
const termRegex = (terms) => {
  const parts = [...(terms || [])].filter(Boolean).sort((x, y) => y.length - x.length)
    .map((t) => (/^[a-z0-9]/i.test(t) ? `(?<![\\p{L}\\p{N}_])${escapeRegex(t)}` : escapeRegex(t)));
  return parts.length ? new RegExp(`(${parts.join('|')})`, 'giu') : null;
};
const Highlight = ({ text, terms }) => {
  const re = useMemo(() => termRegex(terms), [terms]);
  if (!text) return null;
  if (!re) return text;
  // split() with one capture group puts the matches at the odd indexes.
  return String(text).split(re).map((part, i) => (i % 2
    ? <mark key={i} className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">{part}</mark>
    : part));
};

const Tag = ({ children, tone }) => (
  <span className={`inline-flex max-w-full items-center gap-0.5 truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
    {children}
  </span>
);

const MatchBadge = ({ strong, title, children }) => (
  <span title={title}
    className={`inline-flex w-fit max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${strong ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>
    <Check className="h-3 w-3 shrink-0" />
    {children}
  </span>
);

const ArticleCard = ({ article: a, terms = [], phrases = [], onOpen }) => {
  const [imageOk, setImageOk] = useState(Boolean(a.image_url));
  const words = wordsOf(a);
  // Some feeds repeat the summary inside the title; showing it twice is noise.
  const summary = a.summary && !(a.title || '').includes(a.summary) ? a.summary : '';
  const place = [a.district, a.state].filter(Boolean).join(', ');
  const matched = a.matched_terms || [];
  const allMatched = matched.length === terms.length;
  const matchedPhrases = a.matched_phrases || [];
  const isList = phrases.length > 1;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <button type="button" onClick={() => onOpen(a, terms)} className="flex flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          {imageOk ? (
            <img src={a.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageOk(false)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-primary/10 via-muted to-muted text-primary/50">
              <Newspaper className="h-8 w-8" />
              <span className="text-[11px] font-medium text-muted-foreground">{a.source}</span>
            </div>
          )}
          {a.language && (
            <span className="absolute left-2 top-2 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur">
              {a.language}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          {isList && matchedPhrases.length > 0 && (
            <MatchBadge strong={matchedPhrases.length >= Math.min(3, phrases.length)} title={`Matches: ${matchedPhrases.join(', ')}`}>
              {matchedPhrases.length} of {phrases.length} phrases: {matchedPhrases.slice(0, 3).join(' · ')}
              {matchedPhrases.length > 3 ? ` +${matchedPhrases.length - 3}` : ''}
            </MatchBadge>
          )}
          {!isList && terms.length > 1 && matched.length > 0 && (
            <MatchBadge strong={allMatched} title={`Contains: ${matched.join(', ')}`}>
              {allMatched ? 'All words' : `Matches ${matched.length}/${terms.length} words`}: {matched.join(' · ')}
            </MatchBadge>
          )}
          <h3 className="text-sm font-semibold leading-snug line-clamp-3"><Highlight text={a.title || 'Untitled'} terms={matched} /></h3>
          {summary && <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3"><Highlight text={summary} terms={matched} /></p>}
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11px] font-medium text-primary">
            Read full article{words ? ` · ${words.toLocaleString()} words` : ''}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </button>
      <div className="flex flex-wrap gap-1 px-3 pb-2.5">
        <Tag tone="primary">{a.source}</Tag>
        {a.country && <Tag>{a.country}</Tag>}
        {place && <Tag><MapPin className="h-2.5 w-2.5 shrink-0" />{place}</Tag>}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        {publishedLabel(a.published_at) && (
          <span className="inline-flex items-center gap-1" title={fullDate(a.published_at)}>
            <Clock className="h-3 w-3" />{publishedLabel(a.published_at)}
          </span>
        )}
        {a.seen_count > 1 && <span title="Times this article came up in your workspace's searches">· seen {a.seen_count}×</span>}
        {a.source_url && (
          <a href={a.source_url} target="_blank" rel="noreferrer" title="Open the original article"
            className="ml-auto inline-flex min-w-0 items-center gap-1 hover:text-primary">
            <span className="truncate">{hostOf(a.source_url)}</span><ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )}
      </div>
    </article>
  );
};

const CardSkeleton = () => (
  <div className="overflow-hidden rounded-xl border border-border bg-background animate-pulse">
    <div className="aspect-[16/9] bg-muted" />
    <div className="space-y-2 p-3">
      <div className="h-3.5 w-11/12 rounded bg-muted" />
      <div className="h-3.5 w-3/4 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted/70" />
      <div className="h-3 w-5/6 rounded bg-muted/70" />
    </div>
  </div>
);

const PageButton = ({ label, icon: Icon, disabled, onClick }) => (
  <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    <Icon className="h-4 w-4" />
  </Button>
);

/** Card grid with header, paging and page size; shared by live, stored and saved views. */
const ResultsPanel = ({
  heading, meta, subheading, actions, result, loading, loadingNote, error, notice,
  pageSize, onPage, onPageSize, onOpen, emptyText, className = '',
  gridClassName = 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3',
}) => {
  const articles = result?.articles || [];
  const total = result?.count ?? 0;
  const offset = result?.offset ?? 0;
  const size = result?.limit || pageSize;
  const from = total ? offset + 1 : 0;
  const to = offset + articles.length;
  const page = Math.floor(offset / size) + 1;
  const pages = Math.max(1, Math.ceil(total / size));
  const scrollRef = useRef(null);

  // A new page starts at its top, not where the previous page was scrolled to.
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); }, [result]);

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden min-h-[420px] flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-heading font-bold tracking-tight">{heading}</h2>
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </div>
        {result && total > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
            Showing <span className="font-semibold text-foreground">{from}–{to}</span> of{' '}
            <span className="font-semibold text-foreground">{total.toLocaleString()}</span> articles
            {(result.query_phrases?.length || 0) > 1 && ` · ranked by ${result.query_phrases.length} phrases`}
            {meta ? ` · ${meta}` : ''}
          </p>
        )}
        {subheading && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subheading}</p>}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/20 p-4 space-y-3">
        {loading && loadingNote}
        {error && !loading && <p className="text-xs text-red-600 rounded-lg border border-red-500/30 bg-red-500/5 p-3">{error}</p>}
        {notice && !loading && notice}
        {result && !articles.length && !loading && <Empty>{emptyText}</Empty>}
        {!result && loading ? (
          <div className={`grid gap-3 ${gridClassName}`}>{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
        ) : (
          <div className={`grid gap-3 ${gridClassName} ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} terms={result?.query_terms || []} phrases={result?.query_phrases || []} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
      {result && total > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-border">
          <Select value={String(size)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-28 text-xs" aria-label="Page size"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)} className="text-xs">{n} per page</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1">
            <PageButton label="First page" icon={ChevronsLeft} disabled={loading || offset === 0} onClick={() => onPage(0, size)} />
            <PageButton label="Previous page" icon={ChevronLeft} disabled={loading || offset === 0} onClick={() => onPage(Math.max(0, offset - size), size)} />
            <span className="px-2 text-[11px] text-muted-foreground tabular-nums">
              Page <span className="font-semibold text-foreground">{page}</span> of {pages.toLocaleString()}
            </span>
            <PageButton label="Next page" icon={ChevronRight} disabled={loading || to >= total} onClick={() => onPage(offset + size, size)} />
            <PageButton label="Last page" icon={ChevronsRight} disabled={loading || page >= pages} onClick={() => onPage((pages - 1) * size, size)} />
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- article detail ---------- */

const ArticleSheet = ({ article, terms = [], onClose }) => {
  const [full, setFull] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch by id for the full text: the live copy while the API still caches it,
  // otherwise the copy stored in this workspace. A failure keeps what we have.
  useEffect(() => {
    if (!article) return undefined;
    let cancelled = false;
    setFull(null);
    setRefreshing(true);
    newsApi.getArticle(article.id)
      .then((d) => { if (!cancelled) setFull(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [article]);

  const a = full ? { ...article, ...full } : article;
  return (
    <Sheet open={!!article} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col gap-0">
        {a && (
          <>
            <SheetHeader className="px-4 py-3 border-b border-border space-y-1 text-left">
              <SheetTitle className="text-base leading-snug pr-6"><Highlight text={a.title || 'Untitled'} terms={terms} /></SheetTitle>
              <SheetDescription className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-foreground">{a.source}</span>
                {a.language && <span>{a.language}</span>}
                {placeOf(a) && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{placeOf(a)}</span>}
                {a.published_at && !Number.isNaN(new Date(a.published_at).getTime()) && <span>{new Date(a.published_at).toLocaleString()}</span>}
                {a.first_seen_at && <span>· first saved {timeAgo(new Date(a.first_seen_at).getTime())}</span>}
                {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {a.source_url && (
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <a href={a.source_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open original on {hostOf(a.source_url)}</a>
                </Button>
              )}
              {a.image_url && (
                <img src={a.image_url} alt="" referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="w-full max-h-72 rounded-lg object-cover bg-muted" />
              )}
              {a.summary && <p className="text-xs rounded-lg bg-primary/5 border border-primary/20 p-3"><Highlight text={a.summary} terms={terms} /></p>}
              {a.content
                ? <div className="text-sm leading-relaxed whitespace-pre-line"><Highlight text={a.content} terms={terms} /></div>
                : refreshing
                  ? <QuickLoading />
                  : <Empty>No article text was extracted. Open the original to read it.</Empty>}
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground">Raw data</summary>
                <pre className="mx-3 mb-3 rounded-md bg-gray-950 p-3 overflow-x-auto text-gray-300 font-mono text-[11px] leading-relaxed">{JSON.stringify(a, null, 2)}</pre>
              </details>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

/* ---------- saved (tenant archive) ---------- */

const SavedExplorer = ({ sources, sourcesStatus, byId, onOpen }) => {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState(EMPTY_RANGE);
  const [limit, setLimit] = useState(20);
  const [submitted, setSubmitted] = useState({ filters: EMPTY_FILTERS, range: EMPTY_RANGE });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqRef = useRef(0);
  const options = useFacetOptions(sources, filters, byId);
  const nameOf = useCallback((id) => byId.get(id)?.name || id, [byId]);

  const load = useCallback(async (q, offset, pageSize) => {
    const id = ++reqRef.current;
    setLoading(true);
    setError('');
    try {
      const params = { ...toParams(q.filters), limit: pageSize, offset };
      if (q.range.from) params.from = q.range.from;
      if (q.range.to) params.to = q.range.to;
      const data = await newsApi.getSaved(params);
      if (id !== reqRef.current) return;
      setResult(data);
      setSubmitted(q);
    } catch (err) {
      if (id !== reqRef.current) return;
      setError(errMsg(err, 'Could not load saved articles'));
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load({ filters: EMPTY_FILTERS, range: EMPTY_RANGE }, 0, 20); }, [load]);

  const narrowed = hasFilters(submitted.filters) || submitted.range.from || submitted.range.to;
  const rangeLabel = [submitted.range.from && `from ${submitted.range.from}`, submitted.range.to && `to ${submitted.range.to}`].filter(Boolean).join(' ');

  return (
    <div className="space-y-3">
      <FilterBar filters={filters} setFilters={setFilters} options={options} facetsDisabled={sourcesStatus !== 'ready'}
        loading={loading} submitLabel="Search saved" placeholder="Keyword in saved articles (optional)"
        onSubmit={() => load({ filters, range }, 0, limit)}
        canClear={hasFilters(filters) || !!range.from || !!range.to}
        onClear={() => { setFilters(EMPTY_FILTERS); setRange(EMPTY_RANGE); }}>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          From <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="h-8 w-36 text-xs" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          To <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-8 w-36 text-xs" />
        </label>
      </FilterBar>

      <ResultsPanel
        className="lg:h-[calc(100dvh-22rem)]"
        gridClassName="grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        heading="Saved articles"
        meta="from your workspace"
        subheading={narrowed
          ? [submitted.filters.keyword.trim() && `“${searchTitle(submitted.filters)}”`, describeFilters(submitted.filters, nameOf), rangeLabel].filter(Boolean).join(' · ')
          : 'Everything your workspace’s searches have collected, newest first'}
        actions={(
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={loading}
            onClick={() => load(submitted, result?.offset || 0, result?.limit || limit)}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        )}
        result={result} loading={loading} loadingNote={<QuickLoading />} error={error}
        pageSize={limit}
        onPage={(offset, size) => load(submitted, offset, size)}
        onPageSize={(n) => { setLimit(n); load(submitted, 0, n); }}
        onOpen={onOpen}
        emptyText={narrowed
          ? 'No saved articles match these filters.'
          : 'Nothing saved yet. Articles are saved here automatically whenever someone in your workspace searches News.'}
      />
    </div>
  );
};

/* ---------- sources explorer ---------- */

const SourcesExplorer = ({ sources, status, onReload, onSearchSource }) => {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({ country: [], language: [], state: [], source: [] });
  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sources.filter((s) =>
      SOURCE_TABLE_FACETS.every((f) => matchesFacet(f, s, sel[f.key]))
      && (!t || `${s.name} ${s.id} ${s.base_url}`.toLowerCase().includes(t)));
  }, [sources, sel, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter sources by name or website…" className="h-8 pl-8 text-xs" />
        </div>
        {SOURCE_TABLE_FACETS.map((f) => (
          <MultiSelect key={f.key} label={f.label} icon={f.icon} value={sel[f.key]}
            options={facetOptions(sources, sel, f, byId)} disabled={status !== 'ready'}
            onChange={(v) => setSel((x) => ({ ...x, [f.key]: v }))} />
        ))}
        <Chip label="shown" value={filtered.length} />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs ml-auto" onClick={onReload} disabled={status === 'loading'}>
          <RefreshCw className={`h-3.5 w-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="h-8">Source</TableHead>
              <TableHead className="h-8">Country</TableHead>
              <TableHead className="h-8">State</TableHead>
              <TableHead className="h-8">Language</TableHead>
              <TableHead className="h-8">Type</TableHead>
              <TableHead className="h-8 text-right">Articles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status === 'loading' && (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading sources…
              </TableCell></TableRow>
            )}
            {status !== 'loading' && !filtered.length && (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">
                {status === 'failed' ? 'Could not load sources. Try Refresh.' : 'Nothing matches these filters.'}
              </TableCell></TableRow>
            )}
            {status !== 'loading' && filtered.map((s) => (
              <TableRow key={s.id} className="text-xs">
                <TableCell className="py-2 max-w-[280px]">
                  <p className="font-medium truncate">{s.name}</p>
                  {s.base_url && (
                    <a href={s.base_url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary hover:underline truncate block">
                      {hostOf(s.base_url)}
                    </a>
                  )}
                </TableCell>
                <TableCell className="py-2 text-muted-foreground">{s.country || '—'}</TableCell>
                <TableCell className="py-2 text-muted-foreground max-w-[200px] truncate">{s.state || '—'}</TableCell>
                <TableCell className="py-2 text-muted-foreground">{s.language || '—'}</TableCell>
                <TableCell className="py-2 text-muted-foreground">{TYPE_LABEL[s.type] || s.type || '—'}</TableCell>
                <TableCell className="py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onSearchSource(s.id)}>
                    <Newspaper className="h-3.5 w-3.5" /> Search news
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

/* ---------- page ---------- */

const NewsWorkspace = () => {
  const [view, setView] = useState('articles');
  const [sources, setSources] = useState([]);
  const [sourcesStatus, setSourcesStatus] = useState('loading');
  const [health, setHealth] = useState({ status: 'checking', message: '' });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(20);
  // What the results panel shows: a live search, or a stored search reopened from the DB.
  // { mode: 'live'|'stored', filters, searchId, search? }
  const [active, setActive] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(null); // null | 'live' | 'stored'
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [searches, setSearches] = useState({ status: 'loading', items: [], count: 0, message: '' });
  const [opened, setOpened] = useState(null); // { article, terms } shown in the detail sheet
  const openArticle = useCallback((article, terms = []) => setOpened({ article, terms }), []);
  const reqRef = useRef(0);

  const checkHealth = useCallback(async () => {
    setHealth({ status: 'checking', message: '' });
    try {
      await newsApi.health();
      setHealth({ status: 'online', message: '' });
    } catch (err) {
      setHealth({
        status: err.response?.data?.code === 'NEWS_NOT_CONFIGURED' ? 'unconfigured' : 'offline',
        message: errMsg(err, 'The news service is not reachable.'),
      });
    }
  }, []);

  const loadSources = useCallback(async () => {
    setSourcesStatus('loading');
    try {
      const list = await newsApi.getSources();
      setSources(Array.isArray(list) ? [...list].sort((a, b) => String(a.name).localeCompare(String(b.name))) : []);
      setSourcesStatus('ready');
    } catch (err) {
      setSourcesStatus('failed');
      toast.error(errMsg(err, 'Failed to load news sources'));
    }
  }, []);

  const loadSearches = useCallback(async () => {
    try {
      const data = await newsApi.getSearches({ limit: SEARCH_HISTORY_SIZE });
      setSearches({ status: 'ready', items: data?.items || [], count: data?.count || 0, message: '' });
    } catch (err) {
      setSearches({ status: 'failed', items: [], count: 0, message: errMsg(err, 'Could not load searches') });
    }
  }, []);

  useEffect(() => { checkHealth(); loadSources(); loadSearches(); }, [checkHealth, loadSources, loadSearches]);

  useEffect(() => {
    if (loading !== 'live' || !startedAt) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading, startedAt]);

  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const nameOf = useCallback((id) => byId.get(id)?.name || id, [byId]);
  const options = useFacetOptions(sources, filters, byId);

  /** Live search. searchId continues an existing search (paging); omit it to start a new one. */
  const runLive = useCallback(async (f, offset, pageSize, searchId = null) => {
    const id = ++reqRef.current;
    const started = Date.now();
    setLoading('live');
    setStartedAt(started);
    setError('');
    try {
      const params = { ...toParams(f), limit: pageSize, offset };
      if (searchId) params.search_id = searchId;
      const data = await newsApi.getArticles(params);
      if (id !== reqRef.current) return;
      setResult(data);
      setActive({ mode: 'live', filters: f, searchId: data?.saved?.search_id || searchId, took: (Date.now() - started) / 1000 });
      if (data?.saved?.error) toast.warning(data.saved.error);
      // A new search, or page 1 re-run (load the rest / page size) that can raise its count.
      if (data?.saved?.search_id && offset === 0) loadSearches();
    } catch (err) {
      if (id !== reqRef.current) return;
      const msg = errMsg(err, 'News search failed');
      setError(msg);
      toast.error(msg);
    } finally {
      if (id === reqRef.current) setLoading(null);
    }
  }, [loadSearches]);

  /** Reopen a stored search from this workspace's DB — instant, no re-scrape. */
  const openStored = useCallback(async (search, offset, pageSize) => {
    const id = ++reqRef.current;
    setLoading('stored');
    setError('');
    try {
      const data = await newsApi.getSearchArticles(search.id, { limit: pageSize, offset });
      if (id !== reqRef.current) return;
      setResult(data);
      setActive({ mode: 'stored', filters: fromParams(search.filters), searchId: search.id, search: { ...search, ...data?.search } });
    } catch (err) {
      if (id !== reqRef.current) return;
      setError(errMsg(err, 'Could not open this search'));
    } finally {
      if (id === reqRef.current) setLoading(null);
    }
  }, []);

  const search = (f) => {
    setFilters(f);
    setView('articles');
    runLive(f, 0, limit);
  };
  const reopen = (s) => {
    setFilters(fromParams(s.filters));
    setView('articles');
    openStored(s, 0, limit);
  };
  const goToPage = (offset, size) => {
    if (!active) return;
    if (active.mode === 'live') runLive(active.filters, offset, size, active.searchId);
    else openStored(active.search, offset, size);
  };
  const changePageSize = (n) => {
    setLimit(n);
    goToPage(0, n);
  };
  const removeSearch = async (s) => {
    try {
      await newsApi.deleteSearch(s.id);
      setSearches((x) => ({ ...x, items: x.items.filter((i) => i.id !== s.id), count: Math.max(0, x.count - 1) }));
      if (active?.searchId === s.id && active.mode === 'stored') { setActive(null); setResult(null); }
    } catch (err) {
      toast.error(errMsg(err, 'Could not delete this search'));
    }
  };

  const countries = useMemo(() => new Set(sources.map((s) => s.country).filter(Boolean)).size, [sources]);
  const languages = useMemo(() => new Set(sources.map((s) => s.language).filter(Boolean)).size, [sources]);
  const H = HEALTH[health.status];
  const stored = active?.mode === 'stored' ? active.search : null;
  const whoRan = (s) => (s.mine ? 'you' : s.user_name || 'someone');
  const savedNote = active?.mode === 'live' && result?.saved?.search_id ? ' · saved to your workspace' : '';
  const pending = active?.mode === 'live' ? result?.pending_sources || 0 : 0;
  // Re-runs page 1 as the same stored search, so the late sources join it instead of a duplicate.
  const loadRest = () => runLive(active.filters, 0, result?.limit || limit, active.searchId);

  return (
    <div className="p-4 space-y-3 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-heading font-bold tracking-tight leading-none">
            News · {{ articles: 'Articles', saved: 'Saved', sources: 'Sources' }[view]}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {{
              articles: 'Search live articles from Indian and international news sources',
              saved: 'Articles collected by your workspace’s searches, kept in your workspace database',
              sources: 'News websites, TV channels and agencies being monitored',
            }[view]}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <button type="button" onClick={checkHealth} title="Check again"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${H.dot}`} />{H.label}
          </button>
          <Chip label="sources" value={sources.length} />
          <Chip label="countries" value={countries} />
          <Chip label="languages" value={languages} />
        </div>
      </div>

      {(health.status === 'offline' || health.status === 'unconfigured') && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600">
          <span className="flex-1 min-w-[200px]">{health.message}</span>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { checkHealth(); loadSources(); }}>
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto no-scrollbar">
        {[['articles', 'Articles', Newspaper], ['saved', 'Saved', Archive], ['sources', 'Sources', Rss]].map(([k, l, I]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${view === k ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <I className="h-3.5 w-3.5" />{l}
          </button>
        ))}
      </div>

      {view === 'sources' && (
        <SourcesExplorer sources={sources} status={sourcesStatus} onReload={loadSources}
          onSearchSource={(id) => search({ ...EMPTY_FILTERS, source: [id] })} />
      )}

      {view === 'saved' && (
        <SavedExplorer sources={sources} sourcesStatus={sourcesStatus} byId={byId} onOpen={openArticle} />
      )}

      {view === 'articles' && (
      <>
      <FilterBar filters={filters} setFilters={setFilters} options={options} facetsDisabled={sourcesStatus !== 'ready'}
        loading={loading === 'live'} submitLabel="Search news" placeholder="Keyword, e.g. drugs, accident, protest (optional)"
        onSubmit={() => search(filters)} canClear={hasFilters(filters)} onClear={() => setFilters(EMPTY_FILTERS)} />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3 items-start">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center px-3 py-2 border-b border-border bg-muted/10">
            <Label count={searches.status === 'ready' ? searches.count : null}>Searches in this workspace</Label>
            <button type="button" onClick={loadSearches} aria-label="Refresh searches" className="ml-auto text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-[calc(100dvh-26rem)] min-h-[120px] overflow-y-auto">
            {searches.status === 'loading' && <p className="p-6 text-xs text-muted-foreground text-center"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />Loading…</p>}
            {searches.status === 'failed' && <p className="p-6 text-xs text-muted-foreground text-center">{searches.message}</p>}
            {searches.status === 'ready' && !searches.items.length && (
              <p className="p-6 text-xs text-muted-foreground text-center">No searches yet. Searches and their articles are saved here for everyone in your workspace.</p>
            )}
            {searches.items.map((s) => {
              const f = fromParams(s.filters);
              return (
                <div key={s.id} onClick={() => reopen(s)}
                  className={`group px-3 py-2 cursor-pointer border-b border-border last:border-0 ${active?.searchId === s.id ? 'bg-primary/10' : 'hover:bg-accent/50'}`}>
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium truncate flex-1">{searchTitle(f)}</p>
                    <span className="text-[10px] tabular-nums text-muted-foreground" title="Articles found">{s.result_count}</span>
                    {s.mine && (
                      <button onClick={(e) => { e.stopPropagation(); removeSearch(s); }} aria-label="Delete search"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 pl-5 truncate">
                    {describeFilters(f, nameOf)} · {whoRan(s)} · {timeAgo(new Date(s.created_at).getTime())}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {result || loading || error ? (
          <ResultsPanel
            className="lg:h-[calc(100dvh-20rem)]"
            heading={result
              ? (stored ? 'Saved search' : 'Live results')
              : loading === 'stored' ? 'Opening…' : 'Searching…'}
            meta={stored ? 'from your workspace' : active?.took != null ? `${active.took.toFixed(1)}s` : ''}
            subheading={active && [
              active.filters.keyword?.trim() && `“${searchTitle(active.filters)}”`,
              describeFilters(active.filters, nameOf),
              stored && `searched by ${whoRan(stored)} ${timeAgo(new Date(stored.created_at).getTime())}, ${stored.result_count} found then`,
            ].filter(Boolean).join(' · ') + savedNote}
            actions={stored && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!!loading} onClick={() => search(active.filters)}>
                <Zap className="h-3.5 w-3.5" /> Refresh live
              </Button>
            )}
            result={result}
            loading={!!loading}
            loadingNote={loading === 'live' ? <LoadingNote elapsed={elapsed} /> : <QuickLoading />}
            error={error}
            notice={pending > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="flex-1 min-w-[200px]">
                  {pending} source{pending === 1 ? ' is' : 's are'} still loading in the background. Load them in a minute to see more articles.
                </span>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={loadRest}>
                  <RefreshCw className="h-3 w-3" /> Load the rest
                </Button>
              </div>
            )}
            pageSize={limit}
            onPage={goToPage}
            onPageSize={changePageSize}
            onOpen={openArticle}
            emptyText="No articles match these filters. Try fewer filters or a broader keyword."
          />
        ) : (
          <div className="rounded-xl border border-border bg-card min-h-[420px] lg:h-[calc(100dvh-20rem)] flex flex-col items-center justify-center text-center gap-2 p-8">
            <Newspaper className="h-7 w-7 text-primary/60" />
            <p className="text-sm font-semibold">Your articles appear here</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Search by keyword and narrow by country, language, state or source. Results are saved to your workspace. Or start with:
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-1">
              {PRESETS.map((p) => (
                <Button key={p.label} type="button" variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => search({ ...EMPTY_FILTERS, ...p.filters })}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      <ArticleSheet article={opened?.article} terms={opened?.terms} onClose={() => setOpened(null)} />
    </div>
  );
};

export default NewsWorkspace;
