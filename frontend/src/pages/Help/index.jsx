import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  AlertTriangle,
  MessageSquare,
  Settings as SettingsIcon,
  Globe,
  Search,
  BookOpen,
  ChevronRight,
  X,
} from 'lucide-react';
import HelpArticle from './HelpArticle';
import events from './content/events';
import alerts from './content/alerts';
import grievances from './content/grievances';
import settings from './content/settings';
import globalsearch from './content/globalsearch';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';

const ICONS = { CalendarDays, AlertTriangle, MessageSquare, SettingsIcon, Globe };

const ARTICLES = [events, alerts, grievances, globalsearch, settings];

const sectionText = (section) => {
  const out = [section.title];
  for (const b of section.blocks || []) {
    if (b.text) out.push(b.text);
    if (b.title) out.push(b.title);
    if (b.caption) out.push(b.caption);
    if (Array.isArray(b.items)) {
      for (const it of b.items) {
        out.push(
          typeof it === 'string'
            ? it
            : [it.text, it.note, it.name].filter(Boolean).join(' ')
        );
      }
    }
    if (Array.isArray(b.rows)) for (const r of b.rows) out.push(r.join(' '));
    if (Array.isArray(b.markers)) {
      for (const m of b.markers) out.push(`${m.label} ${m.text || ''}`);
    }
  }
  return out.join(' ').toLowerCase();
};

const groupSections = (article) => {
  const out = [];
  for (const s of article.sections) {
    const name = s.group || 'More';
    let g = out.find((x) => x.name === name);
    if (!g) {
      g = { name, sections: [] };
      out.push(g);
    }
    g.sections.push(s);
  }
  return out;
};

const HelpGuide = () => {
  const [activeId, setActiveId] = useState(ARTICLES[0]?.id);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(null);
  const jump = (id) => setFocus({ id, seq: Date.now() });

  const article = ARTICLES.find((a) => a.id === activeId) || ARTICLES[0];
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return null;
    const found = [];
    for (const a of ARTICLES) {
      for (const s of a.sections) {
        if (sectionText(s).includes(q)) {
          found.push({
            articleId: a.id,
            articleTitle: a.title,
            sectionId: s.id,
            sectionTitle: s.title,
          });
        }
      }
    }
    return found;
  }, [q]);

  const goTo = (articleId, sectionId) => {
    setActiveId(articleId);
    setQuery('');
    jump(sectionId);
  };

  return (
    <div
      className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] w-full flex-col gap-2.5"
      data-testid="help-page"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Help</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Platform guide — modules, workflows, and screenshots
          </p>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-md ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile module strip */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 lg:hidden shrink-0">
        {ARTICLES.map((a) => {
          const Icon = ICONS[a.icon] || BookOpen;
          const isActive = a.id === article?.id && !q;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setActiveId(a.id);
                setQuery('');
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shrink-0 transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground font-semibold'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {a.title}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-hidden">
        {/* Sidebar */}
        <aside className="thin-scrollbar hidden w-[240px] shrink-0 overflow-y-auto rounded-xl border border-border bg-card lg:block">
          <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-2.5">
            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-none">Modules</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{ARTICLES.length} guides</p>
            </div>
          </div>

          <nav className="p-1.5 space-y-0.5">
            {ARTICLES.map((a) => {
              const Icon = ICONS[a.icon] || BookOpen;
              const isActive = a.id === article?.id && !q;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setActiveId(a.id);
                    setQuery('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{a.title}</span>
                </button>
              );
            })}
          </nav>

          {article && !q && (
            <div className="border-t border-border p-1.5 space-y-3">
              {groupSections(article).map((g) => (
                <div key={g.name}>
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.name}
                  </p>
                  <ul className="space-y-0.5">
                    {g.sections.map((sec) => (
                      <li key={sec.id}>
                        <button
                          type="button"
                          onClick={() => jump(sec.id)}
                          className="w-full rounded-md px-2.5 py-1 text-left text-[11px] leading-snug text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        >
                          {sec.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Content */}
        <main className="thin-scrollbar min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card">
          {q ? (
            <div className="p-4 md:p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">
                  {matches.length} result{matches.length === 1 ? '' : 's'} for “{query}”
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs ml-auto"
                  onClick={() => setQuery('')}
                >
                  Clear
                </Button>
              </div>
              {matches.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  Nothing found. Try a different word.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {matches.map((m) => (
                    <li key={`${m.articleId}-${m.sectionId}`}>
                      <button
                        type="button"
                        onClick={() => goTo(m.articleId, m.sectionId)}
                        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {m.articleTitle}
                          </p>
                          <p className="text-sm font-medium truncate">{m.sectionTitle}</p>
                        </div>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <HelpArticle article={article} focus={focus} />
          )}
        </main>
      </div>
    </div>
  );
};

export default HelpGuide;
