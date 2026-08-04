import React, { useMemo, useState } from 'react';
import {
  CalendarDays, AlertTriangle, MessageSquare, Settings as SettingsIcon, Globe,
  Search, BookOpen, ChevronRight,
} from 'lucide-react';
import HelpArticle from './HelpArticle';
import events from './content/events';
import alerts from './content/alerts';
import grievances from './content/grievances';
import settings from './content/settings';
import globalsearch from './content/globalsearch';

const ICONS = { CalendarDays, AlertTriangle, MessageSquare, SettingsIcon, Globe };

// Sidebar order — the order an officer meets these modules in practice.
const ARTICLES = [events, alerts, grievances, globalsearch, settings];

// Flatten a section's blocks into plain text so search can look inside content,
// not just headings.
const sectionText = (section) => {
  const out = [section.title];
  for (const b of section.blocks || []) {
    if (b.text) out.push(b.text);
    if (b.title) out.push(b.title);
    if (b.caption) out.push(b.caption);
    if (Array.isArray(b.items)) {
      for (const it of b.items) out.push(typeof it === 'string' ? it : [it.text, it.note, it.name].filter(Boolean).join(' '));
    }
    if (Array.isArray(b.rows)) for (const r of b.rows) out.push(r.join(' '));
    if (Array.isArray(b.markers)) for (const m of b.markers) out.push(`${m.label} ${m.text || ''}`);
  }
  return out.join(' ').toLowerCase();
};

// Collect sections into their groups, preserving author order.
const groupSections = (article) => {
  const out = [];
  for (const s of article.sections) {
    const name = s.group || 'More';
    let g = out.find((x) => x.name === name);
    if (!g) { g = { name, sections: [] }; out.push(g); }
    g.sections.push(s);
  }
  return out;
};

const HelpGuide = () => {
  const [activeId, setActiveId] = useState(ARTICLES[0]?.id);
  const [query, setQuery] = useState('');
  // Bumped whenever a section should be opened + scrolled to. The counter makes
  // repeat clicks on the same section re-trigger the effect.
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
          found.push({ articleId: a.id, articleTitle: a.title, sectionId: s.id, sectionTitle: s.title });
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
    <div className="flex h-full min-h-0 bg-white dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="thin-scrollbar hidden w-[264px] shrink-0 overflow-y-auto border-r border-slate-200 lg:block dark:border-slate-800">
        <div className="space-y-6 px-5 py-7">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-[18px] w-[18px] text-blue-600" />
              <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">Platform Guide</h2>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the guide…"
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <nav className="space-y-0.5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Modules</p>
            {ARTICLES.map((a) => {
              const Icon = ICONS[a.icon] || BookOpen;
              const isActive = a.id === article?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => { setActiveId(a.id); setQuery(''); }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13.5px] transition-colors ${
                    isActive
                      ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {a.title}
                </button>
              );
            })}
          </nav>

          {/* On-page contents */}
          {article && !q && (
            <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              {groupSections(article).map((g) => (
                <div key={g.name}>
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{g.name}</p>
                  <ul>
                    {g.sections.map((sec) => (
                      <li key={sec.id}>
                        <button
                          onClick={() => jump(sec.id)}
                          className="w-full rounded-md px-3 py-1 text-left text-[13px] leading-6 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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
        </div>
      </aside>

      {/* Content */}
      <main className="thin-scrollbar min-w-0 flex-1 overflow-y-auto px-6 py-9 lg:px-10 xl:px-14">
        {/* Mobile search */}
        <div className="relative mb-6 lg:hidden">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        {q ? (
          <div className="mx-auto max-w-[46rem]">
            <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
              {matches.length} result{matches.length === 1 ? '' : 's'} for “{query}”
            </h2>
            {matches.length === 0 ? (
              <p className="text-slate-500">Nothing found. Try a different word.</p>
            ) : (
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li key={`${m.articleId}-${m.sectionId}`}>
                    <button
                      onClick={() => goTo(m.articleId, m.sectionId)}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-400">{m.articleTitle}</p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{m.sectionTitle}</p>
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
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
  );
};

export default HelpGuide;
