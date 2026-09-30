import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { findTarget, prepareEmbeddedDocument } from './livePreviewUtils';

/**
 * A live, view-only copy of a real app page with numbered markers on its controls.
 * It uses the viewer's own session, so tenant branding, theme and data always match what they see.
 * Personal details are blurred. Markers are found by visible text, so they follow UI changes.
 *
 * Block: { type:'live', route, alt, caption, height?, blur?, markers:[{ n, target, label, text }] }
 */

const VIEW_W = 1440;
const SETTLE_MS = 12000;

const LivePreview = ({ route, alt = '', caption, markers = [], height = 560, blur = true }) => {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.6);
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState('loading'); // loading | ready | denied
  const [boxes, setBoxes] = useState({});

  const path = useMemo(() => String(route || '').split('?')[0], [route]);
  const src = useMemo(() => `${route}${String(route).includes('?') ? '&' : '?'}helpEmbed=1`, [route]);

  // Fit the 1440px-wide page to the article column.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setScale(Math.min(1, el.clientWidth / VIEW_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only load the page once it is near the screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || mounted) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setMounted(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setMounted(true); io.disconnect(); }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  const onLoad = () => {
    const frame = frameRef.current;
    if (!frame) return;
    let stopBlur = () => {};
    let timer;
    const started = Date.now();
    let attached = false;

    const measure = () => {
      let doc;
      let win;
      try {
        doc = frame.contentDocument;
        win = frame.contentWindow;
      } catch {
        setState('denied');
        return;
      }
      if (!doc || !doc.body) return;

      const here = win.location.pathname;
      const onRoute = here === path || here.startsWith(`${path}/`);
      if (!onRoute && Date.now() - started > 3500) { setState('denied'); return; }

      if (onRoute) {
        if (!attached) { stopBlur = prepareEmbeddedDocument(doc, { blur }); attached = true; }
        const next = {};
        for (const m of markers) {
          const el = findTarget(doc, m.target);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.top < height && r.bottom > 0) next[m.n] = { x: r.left, y: r.top, w: r.width, h: r.height };
          }
        }
        setBoxes(next);
        setState('ready');
      }
      if (Date.now() - started < SETTLE_MS) timer = setTimeout(measure, 700);
    };
    measure();
    frame.__helpCleanup = () => { clearTimeout(timer); stopBlur(); };
  };

  useEffect(() => () => { frameRef.current?.__helpCleanup?.(); }, []);

  return (
    <figure className="my-4">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm"
        style={{ height: height * scale }}
      >
        {mounted && (
          <iframe
            ref={frameRef}
            name="help-embed"
            title={alt || `Live preview of ${route}`}
            src={src}
            onLoad={onLoad}
            tabIndex={-1}
            aria-hidden="true"
            className={cn('absolute left-0 top-0 border-0 bg-background', state === 'denied' && 'invisible')}
            style={{ width: VIEW_W, height, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
          />
        )}

        {state === 'ready' && (
          <div className="pointer-events-none absolute inset-0">
            {markers.filter((m) => boxes[m.n]).map((m) => {
              const b = boxes[m.n];
              return (
                <div key={m.n} className="absolute rounded-md border-2 border-primary/80 bg-primary/10"
                  style={{ left: b.x * scale - 3, top: b.y * scale - 3, width: b.w * scale + 6, height: b.h * scale + 6 }}>
                  <span className="absolute -left-2 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow ring-2 ring-background">
                    {m.n}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {mounted ? 'Loading a live view of this page…' : 'Live view loads as you scroll here'}
          </div>
        )}
        {state === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">This screen isn&apos;t available to your account</p>
            <p className="text-xs text-muted-foreground">Ask your administrator for access to see it here. The steps below still apply.</p>
          </div>
        )}
      </div>

      {(caption || markers.length > 0) && (
        <figcaption className="mt-2.5 space-y-2">
          {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
          {markers.length > 0 && (
            <ol className="space-y-1.5">
              {markers.map((m) => {
                const found = state !== 'ready' || Boolean(boxes[m.n]);
                return (
                  <li key={m.n} className={cn('flex gap-2.5 text-[13px] leading-snug', !found && 'opacity-60')}>
                    <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{m.n}</span>
                    <span>
                      <strong className="font-semibold text-foreground">{m.label}</strong>
                      {m.text ? <span className="text-muted-foreground"> — {m.text}</span> : null}
                      {!found && <span className="text-muted-foreground"> (not visible on your screen right now)</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </figcaption>
      )}
    </figure>
  );
};

export default LivePreview;
