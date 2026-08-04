import React, { useState, useEffect } from 'react';
import { ImageOff, Maximize2, X, Crosshair } from 'lucide-react';

/**
 * A screenshot with numbered callouts placed OUTSIDE the image, each connected
 * to its target by a leader line — so nothing on the screenshot is covered.
 *
 * Everything is positioned in PERCENTAGES, never pixels, so the annotations
 * stay correct at any screen size and survive the screenshot being re-taken at
 * a different resolution.
 *
 *   markers={[
 *     { n: 1, x: 40, y: 34, side: 'left',   at: 20, label: '…', text: '…' },
 *     { n: 2, x: 82, y: 40, side: 'right',  at: 55, label: '…', text: '…' },
 *     { n: 3, x: 35, y: 62, side: 'bottom', at: 30, label: '…', text: '…' },
 *   ]}
 *
 *   x, y  target point ON THE IMAGE, 0-100% of the image
 *   side  which margin the number sits in: left | right | top | bottom
 *   at    position along that margin, 0-100%. Defaults to y (left/right) or x
 *         (top/bottom). Stagger these so numbers don't collide.
 *
 * Omit `markers` for a plain image (e.g. one already annotated externally).
 *
 * POSITIONING HELPER: the crosshair button turns on a mode where clicking the
 * image reports the x/y percentage under the cursor.
 */

// Margins reserved around the image for the callout numbers, as a percentage
// of the whole frame. The image occupies what's left in the middle.
const GUT = { l: 7, r: 7, t: 7, b: 7 };
const IMG = { x: GUT.l, y: GUT.t, w: 100 - GUT.l - GUT.r, h: 100 - GUT.t - GUT.b };

// Map a point on the IMAGE (0-100) to a point on the FRAME (0-100).
const toFrame = (x, y) => ({
  cx: IMG.x + (x / 100) * IMG.w,
  cy: IMG.y + (y / 100) * IMG.h,
});

// Where the number sits, in frame coordinates.
const badgePos = (m) => {
  const side = m.side || (m.x < 50 ? 'left' : 'right');
  const at = Number.isFinite(m.at) ? m.at : (side === 'top' || side === 'bottom' ? m.x : m.y);
  switch (side) {
    case 'top': return { bx: IMG.x + (at / 100) * IMG.w, by: GUT.t / 2, side };
    case 'bottom': return { bx: IMG.x + (at / 100) * IMG.w, by: 100 - GUT.b / 2, side };
    case 'right': return { bx: 100 - GUT.r / 2, by: IMG.y + (at / 100) * IMG.h, side };
    default: return { bx: GUT.l / 2, by: IMG.y + (at / 100) * IMG.h, side };
  }
};

const Callouts = ({ markers, active, onPick }) => (
  <>
    {/* Leader lines. preserveAspectRatio="none" lets the 0-100 viewBox stretch
        to the frame; non-scaling-stroke keeps the line an even width. */}
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {markers.map((m) => {
        const { cx, cy } = toFrame(m.x, m.y);
        const { bx, by } = badgePos(m);
        const on = active === m.n;
        return (
          <g key={m.n}>
            <line
              x1={bx} y1={by} x2={cx} y2={cy}
              stroke={on ? '#2563eb' : '#e11d48'}
              strokeWidth={on ? 2 : 1.4}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={on ? '0' : '3 2'}
            />
            <circle cx={cx} cy={cy} r={on ? 1.1 : 0.8} fill={on ? '#2563eb' : '#e11d48'} />
          </g>
        );
      })}
    </svg>

    {markers.map((m) => {
      const { bx, by } = badgePos(m);
      const on = active === m.n;
      return (
        <button
          key={m.n}
          type="button"
          onClick={(e) => { e.stopPropagation(); onPick(m.n); }}
          style={{ left: `${bx}%`, top: `${by}%` }}
          className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
            on ? 'bg-blue-600 scale-110' : 'bg-rose-600'
          }`}
          aria-label={`${m.n}. ${m.label}`}
        >
          {m.n}
        </button>
      );
    })}
  </>
);

const Legend = ({ markers, onHover, dark }) => (
  <ol className={`mt-3 grid gap-1.5 sm:grid-cols-2 ${dark ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>
    {markers.map((m) => (
      <li
        key={m.n}
        onMouseEnter={() => onHover?.(m.n)}
        onMouseLeave={() => onHover?.(null)}
        className="flex cursor-default gap-2 text-sm"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
          {m.n}
        </span>
        <span>
          <strong className={dark ? 'text-white' : 'text-slate-800 dark:text-slate-100'}>{m.label}</strong>
          {m.text ? ` — ${m.text}` : ''}
        </span>
      </li>
    ))}
  </ol>
);

const AnnotatedShot = ({ src, alt = '', caption, markers = [], pending }) => {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [active, setActive] = useState(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(null);

  const missing = failed || !src || pending;
  const hasMarkers = markers.length > 0;

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  const toggle = (n) => setActive((cur) => (cur === n ? null : n));

  // Reports the click position as a percentage OF THE IMAGE, so exact marker
  // coordinates can be read off instead of estimated.
  const handlePick = (e) => {
    if (!picking) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPicked({ x: x.toFixed(1), y: y.toFixed(1) });
  };

  // The frame reserves margins around the image for the numbers.
  const Frame = ({ imgClass }) => (
    <div
      className="relative"
      style={{ padding: `${GUT.t}% ${GUT.r}% ${GUT.b}% ${GUT.l}%` }}
    >
      <img
        src={src}
        alt={alt || caption || 'Screenshot'}
        onError={() => setFailed(true)}
        onClick={handlePick}
        className={`block w-full rounded-md border border-slate-200 dark:border-slate-700 ${picking ? 'cursor-crosshair' : ''} ${imgClass || ''}`}
      />
      {hasMarkers && <Callouts markers={markers} active={active} onPick={toggle} />}
    </div>
  );

  return (
    <figure className="my-6">
      {missing ? (
        <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20 p-6">
          <div className="flex items-start gap-3">
            <ImageOff className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Screenshot needed</p>
              <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80 break-all">
                Save it as <code className="font-mono">{src}</code> under{' '}
                <code className="font-mono">frontend/public</code>
              </p>
              {caption && <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">{caption}</p>}
              {hasMarkers && (
                <ol className="mt-3 space-y-1.5">
                  {markers.map((m) => (
                    <li key={m.n} className="flex gap-2 text-sm text-amber-900/90 dark:text-amber-200/90">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                        {m.n}
                      </span>
                      <span>
                        <strong>{m.label}</strong>
                        {m.text ? ` — ${m.text}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="group relative rounded-xl bg-slate-50 dark:bg-slate-900/50">
            <Frame />

            <div className="absolute right-2 top-2 flex gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => { setPicking((p) => !p); setPicked(null); }}
                className={`rounded-lg p-1.5 text-white ${picking ? 'bg-blue-600' : 'bg-slate-900/70'}`}
                title="Position helper — click the image to read its x/y percentage"
                aria-label="Position helper"
              >
                <Crosshair className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(true)}
                className="rounded-lg bg-slate-900/70 p-1.5 text-white"
                aria-label="View full size"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {picking && (
            <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-900 dark:bg-blue-950/30">
              <span className="text-blue-800 dark:text-blue-300">
                Position helper on — click the target on the image.
              </span>
              {picked && (
                <code className="ml-2 rounded bg-white px-2 py-0.5 font-mono text-blue-900 dark:bg-slate-900 dark:text-blue-200">
                  x: {picked.x}, y: {picked.y}
                </code>
              )}
            </div>
          )}

          {hasMarkers && <Legend markers={markers} onHover={setActive} />}
        </>
      )}

      {caption && !missing && (
        <figcaption className="mt-2 text-xs text-slate-500 dark:text-slate-400">{caption}</figcaption>
      )}

      {zoom && !missing && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto bg-black/85 p-4 sm:p-8"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="fixed right-4 top-4 z-20 rounded-lg bg-white/15 p-2 text-white hover:bg-white/25"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto flex min-h-full max-w-6xl flex-col items-center justify-center gap-4">
            <div className="w-full" onClick={(e) => e.stopPropagation()}>
              <Frame imgClass="max-h-[72vh] object-contain" />
            </div>
            {hasMarkers && (
              <div className="w-full max-w-3xl pb-6" onClick={(e) => e.stopPropagation()}>
                <Legend markers={markers} onHover={setActive} dark />
              </div>
            )}
          </div>
        </div>
      )}
    </figure>
  );
};

export default AnnotatedShot;
