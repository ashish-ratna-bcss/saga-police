import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import AnnotatedShot from './AnnotatedShot';

/**
 * Renders one help article from the structured content in ./content/*.js
 *
 * Each section is a collapsible panel so the reader sees the shape of the
 * article first and opens only what they need.
 *
 * Block types: p | steps | shot | callout | table | list | fields
 *
 * `callout` renders as a slim margin note — a rule and a label — rather than a
 * filled tile, so notes sit beside the guidance instead of competing with it.
 */

// Minimal inline formatting so content stays plain data: **bold** and `code`
const inline = (text) => {
  if (!text) return null;
  return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
};

// Tone → the label and rule colour of a margin note.
const NOTE = {
  info: { label: 'Note', rule: 'border-slate-300 dark:border-slate-600', head: 'text-slate-500 dark:text-slate-400' },
  tip: { label: 'Tip', rule: 'border-emerald-400 dark:border-emerald-600', head: 'text-emerald-700 dark:text-emerald-400' },
  warn: { label: 'Important', rule: 'border-amber-400 dark:border-amber-600', head: 'text-amber-700 dark:text-amber-500' },
  danger: { label: 'Warning', rule: 'border-rose-400 dark:border-rose-600', head: 'text-rose-700 dark:text-rose-400' },
};

// Prose stays at a readable measure even when the article is wide — only
// screenshots and tables are allowed to use the full column.
const MEASURE = 'max-w-[46rem]';

const Block = ({ block }) => {
  switch (block.type) {
    case 'p':
      return <p className={`my-4 text-[15px] leading-7 text-slate-600 dark:text-slate-300 ${MEASURE}`}>{inline(block.text)}</p>;

    case 'steps':
      return (
        <ol className={`my-5 space-y-4 ${MEASURE}`}>
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="mt-[3px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                {i + 1}
              </span>
              <div className="min-w-0 text-[15px] leading-7 text-slate-600 dark:text-slate-300">
                {inline(item.text)}
                {item.note && (
                  <span className="mt-1 block text-[13.5px] leading-6 text-slate-400 dark:text-slate-500">{inline(item.note)}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      );

    case 'shot':
      return <AnnotatedShot {...block} />;

    case 'callout': {
      const cfg = NOTE[block.tone] || NOTE.info;
      return (
        <div className={`my-5 border-l-2 pl-4 ${cfg.rule} ${MEASURE}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${cfg.head}`}>
            {block.title || cfg.label}
          </p>
          <p className="mt-1.5 text-[14.5px] leading-7 text-slate-600 dark:text-slate-300">{inline(block.text)}</p>
        </div>
      );
    }

    case 'table':
      return (
        <div className="thin-scrollbar my-5 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} className="border-b border-slate-300 pb-2 pr-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 last:pr-0 dark:border-slate-600">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="align-top">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-slate-100 py-2.5 pr-5 leading-6 text-slate-600 last:pr-0 dark:border-slate-800 dark:text-slate-300">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'list':
      return (
        <ul className={`my-5 space-y-2.5 ${MEASURE}`}>
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-7 text-slate-600 dark:text-slate-300">
              <span className="mt-[13px] h-[3px] w-[3px] shrink-0 rounded-full bg-slate-400" />
              <span className="min-w-0">{inline(item)}</span>
            </li>
          ))}
        </ul>
      );

    case 'fields':
      return (
        <dl className={`my-5 space-y-3 ${MEASURE}`}>
          {block.items.map((f, i) => (
            <div key={i} className="sm:flex sm:gap-5">
              <dt className="shrink-0 text-[14px] font-semibold text-slate-800 sm:w-44 dark:text-slate-200">{f.name}</dt>
              <dd className="mt-0.5 text-[14.5px] leading-7 text-slate-600 sm:mt-0 dark:text-slate-300">{inline(f.text)}</dd>
            </div>
          ))}
        </dl>
      );

    default:
      return null;
  }
};

// A single collapsible section.
const Section = ({ section, open, onToggle }) => (
  <section id={section.id} className="scroll-mt-24 border-b border-slate-200 last:border-b-0 dark:border-slate-800">
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 py-4 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:text-slate-500 dark:text-slate-600 ${open ? '' : '-rotate-90'}`}
        />
        <span className="flex-1 text-[15px] font-semibold text-slate-800 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-400">
          {section.title}
        </span>
      </button>
    </h3>
    {open && <div className="pb-8 pl-7 pr-1">{section.blocks.map((b, i) => <Block key={i} block={b} />)}</div>}
  </section>
);

const HelpArticle = ({ article, focus }) => {
  // Open the first section only; the reader expands what they need.
  const [openIds, setOpenIds] = useState(() => new Set([article?.sections?.[0]?.id]));

  // Jumping from the sidebar or search must OPEN the target section — scrolling
  // to a collapsed one would land the reader on a closed heading.
  useEffect(() => {
    if (!focus?.id) return;
    setOpenIds((cur) => new Set(cur).add(focus.id));
    requestAnimationFrame(() => {
      document.getElementById(focus.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [focus]);

  if (!article) return null;

  const toggle = (id) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allOpen = openIds.size === article.sections.length;
  const setAll = () =>
    setOpenIds(allOpen ? new Set() : new Set(article.sections.map((s) => s.id)));

  // Preserve author order while collecting sections into their groups.
  const groups = [];
  for (const s of article.sections) {
    const name = s.group || 'More';
    let g = groups.find((x) => x.name === name);
    if (!g) { g = { name, sections: [] }; groups.push(g); }
    g.sections.push(s);
  }

  return (
    <article className="mx-auto w-full max-w-[46rem] pb-24 xl:max-w-[56rem] 2xl:max-w-[68rem]">
      <header className="mb-10">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          {article.title}
        </h1>
        {article.summary && (
          <p className="mt-3 max-w-[46rem] text-[16px] leading-7 text-slate-500 dark:text-slate-400">{article.summary}</p>
        )}
        <button
          type="button"
          onClick={setAll}
          className="mt-5 text-[13px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </header>

      {groups.map((g, gi) => (
        <div key={g.name} className={gi === 0 ? '' : 'mt-12'}>
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {g.name}
          </h2>
          <div className="border-t border-slate-200 dark:border-slate-800">
            {g.sections.map((s) => (
              <Section key={s.id} section={s} open={openIds.has(s.id)} onToggle={() => toggle(s.id)} />
            ))}
          </div>
        </div>
      ))}
    </article>
  );
};

export default HelpArticle;
