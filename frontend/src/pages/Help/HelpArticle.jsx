import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import AnnotatedShot from './AnnotatedShot';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

/**
 * Renders one help article from ./content/*.js
 * Block types: p | steps | shot | callout | table | list | fields
 */

const inline = (text) => {
  if (!text) return null;
  return String(text)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
};

const NOTE = {
  info: {
    label: 'Note',
    rule: 'border-border',
    head: 'text-muted-foreground',
  },
  tip: {
    label: 'Tip',
    rule: 'border-emerald-500',
    head: 'text-emerald-700 dark:text-emerald-400',
  },
  warn: {
    label: 'Important',
    rule: 'border-amber-500',
    head: 'text-amber-700 dark:text-amber-400',
  },
  danger: {
    label: 'Warning',
    rule: 'border-red-500',
    head: 'text-red-700 dark:text-red-400',
  },
};

const MEASURE = 'max-w-[46rem]';

const Block = ({ block }) => {
  switch (block.type) {
    case 'p':
      return (
        <p className={cn('my-3 text-[13.5px] leading-6 text-muted-foreground', MEASURE)}>
          {inline(block.text)}
        </p>
      );

    case 'steps':
      return (
        <ol className={cn('my-4 space-y-3', MEASURE)}>
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 text-[13.5px] leading-6 text-muted-foreground">
                {inline(item.text)}
                {item.note && (
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground/80">
                    {inline(item.note)}
                  </span>
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
        <div className={cn('my-4 border-l-2 pl-3', cfg.rule, MEASURE)}>
          <p className={cn('text-[10px] font-semibold uppercase tracking-wider', cfg.head)}>
            {block.title || cfg.label}
          </p>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{inline(block.text)}</p>
        </div>
      );
    }

    case 'table':
      return (
        <div className="thin-scrollbar my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-muted/30">
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="align-top hover:bg-muted/20">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border-b border-border px-3 py-2 leading-5 text-muted-foreground last:border-b-0"
                    >
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
        <ul className={cn('my-4 space-y-2', MEASURE)}>
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-[13.5px] leading-6 text-muted-foreground"
            >
              <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span className="min-w-0">{inline(item)}</span>
            </li>
          ))}
        </ul>
      );

    case 'fields':
      return (
        <dl className={cn('my-4 space-y-2.5', MEASURE)}>
          {block.items.map((f, i) => (
            <div key={i} className="sm:flex sm:gap-4">
              <dt className="shrink-0 text-xs font-semibold text-foreground sm:w-40">
                {f.name}
              </dt>
              <dd className="mt-0.5 text-[13px] leading-6 text-muted-foreground sm:mt-0">
                {inline(f.text)}
              </dd>
            </div>
          ))}
        </dl>
      );

    default:
      return null;
  }
};

const Section = ({ section, open, onToggle }) => (
  <section id={section.id} className="scroll-mt-20 border-b border-border last:border-b-0">
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-2.5 px-1 py-3 text-left"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
        />
        <span className="flex-1 text-sm font-semibold text-foreground group-hover:text-primary">
          {section.title}
        </span>
      </button>
    </h3>
    {open && (
      <div className="pb-5 pl-6 pr-1">
        {section.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    )}
  </section>
);

const HelpArticle = ({ article, focus }) => {
  const [openIds, setOpenIds] = useState(() => new Set([article?.sections?.[0]?.id]));

  useEffect(() => {
    if (!article?.id) return;
    setOpenIds(new Set([article.sections?.[0]?.id]));
  }, [article?.id]);

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOpen = openIds.size === article.sections.length;
  const setAll = () =>
    setOpenIds(allOpen ? new Set() : new Set(article.sections.map((s) => s.id)));

  const groups = [];
  for (const s of article.sections) {
    const name = s.group || 'More';
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, sections: [] };
      groups.push(g);
    }
    g.sections.push(s);
  }

  return (
    <article className="w-full p-4 md:p-5 pb-16">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">
            {article.title}
          </h1>
          {article.summary && (
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              {article.summary}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={setAll}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </Button>
      </header>

      {groups.map((g, gi) => (
        <div key={g.name} className={gi === 0 ? '' : 'mt-6'}>
          <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.name}
          </h2>
          <div className="rounded-lg border border-border bg-background px-3">
            {g.sections.map((s) => (
              <Section
                key={s.id}
                section={s}
                open={openIds.has(s.id)}
                onToggle={() => toggle(s.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </article>
  );
};

export default HelpArticle;
