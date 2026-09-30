import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { ShieldAlert } from 'lucide-react';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

/**
 * Risk Levels: one bar from 0 to 100 with two handles. Drag them, or type the numbers.
 * Everything below `medium` is Low, from `medium` up to just under `high` is Medium, `high` and above is High.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const toInt = (raw) => {
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits === '' ? 0 : parseInt(digits, 10);
};

const TONES = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-600' },
  red: { dot: 'bg-red-500', text: 'text-red-600' },
};

const LevelRow = ({ tone, title, range, children }) => (
  <div className="flex flex-1 items-center gap-3 px-3.5 py-3">
    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TONES[tone].dot)} />
    <div className="min-w-0 flex-1">
      <p className={cn('text-sm font-semibold leading-none', TONES[tone].text)}>{title}</p>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">Scores {range}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const bandOf = (score, med, hi) => (score >= hi ? 'High' : score >= med ? 'Medium' : 'Low');

export default function RiskLevelsCard({ medium, high, onChange }) {
  const [testScore, setTestScore] = React.useState('55');
  const med = toInt(medium);
  const hi = toInt(high);
  const invalid = med < 1 || hi > 100 || med >= hi;
  // The slider always shows a sensible position, even while a typed value is temporarily invalid.
  const shownMed = clamp(med, 1, 98);
  const shownHigh = clamp(hi, shownMed + 1, 99);
  const lowPct = shownMed;
  const medPct = shownHigh - shownMed;
  const highPct = 100 - shownHigh;

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-4 w-4 text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-none">Risk levels</h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Every post gets a score from 0 to 100. Drag the handles to choose where Medium and High begin.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="px-2 pt-1">
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full">
              <div className="bg-emerald-500 transition-[width] duration-150" style={{ width: `${lowPct}%` }} />
              <div className="bg-amber-500 transition-[width] duration-150" style={{ width: `${medPct}%` }} />
              <div className="bg-red-500 transition-[width] duration-150" style={{ width: `${highPct}%` }} />
            </div>
            <SliderPrimitive.Root
              className="absolute inset-0 flex touch-none select-none items-center"
              min={1}
              max={99}
              step={1}
              minStepsBetweenThumbs={1}
              value={[shownMed, shownHigh]}
              onValueChange={([m, h]) => onChange({ medium: m, high: h })}
              aria-label="Risk level boundaries"
            >
              <SliderPrimitive.Track className="relative h-3 w-full grow rounded-full bg-transparent" />
              <SliderPrimitive.Thumb
                aria-label="Medium starts at"
                className="block h-5 w-5 rounded-full border-2 border-amber-500 bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <SliderPrimitive.Thumb
                aria-label="High starts at"
                className="block h-5 w-5 rounded-full border-2 border-red-500 bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </SliderPrimitive.Root>
          </div>
          <div className="relative mt-1 h-4 text-[10px] tabular-nums text-muted-foreground">
            <span className="absolute left-0">0</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${shownMed}%` }}>{shownMed}</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${shownHigh}%` }}>{shownHigh}</span>
            <span className="absolute right-0">100</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          <LevelRow tone="red" title="High" range={`${hi} to 100`}>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Starts at
              <Input
                type="text"
                inputMode="numeric"
                aria-label="High starts at"
                value={hi}
                onChange={(e) => onChange({ medium, high: toInt(e.target.value) })}
                className={cn('h-8 w-20 text-center text-xs font-medium tabular-nums', invalid && 'border-red-500')}
              />
            </label>
          </LevelRow>
          <LevelRow tone="amber" title="Medium" range={`${med} to ${Math.max(med, hi - 1)}`}>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Starts at
              <Input
                type="text"
                inputMode="numeric"
                aria-label="Medium starts at"
                value={med}
                onChange={(e) => onChange({ medium: toInt(e.target.value), high })}
                className={cn('h-8 w-20 text-center text-xs font-medium tabular-nums', invalid && 'border-red-500')}
              />
            </label>
          </LevelRow>
          <LevelRow tone="green" title="Low" range={`0 to ${Math.max(0, med - 1)}`}>
            <span className="text-[11px] text-muted-foreground">Automatic</span>
          </LevelRow>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3.5 py-2.5 text-xs">
          <span className="text-muted-foreground">Try a score</span>
          <Input
            type="text"
            inputMode="numeric"
            aria-label="Try a score"
            value={testScore}
            onChange={(e) => setTestScore(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            className="h-7 w-16 text-center text-xs tabular-nums"
          />
          <span className="text-muted-foreground">is</span>
          {invalid || testScore === '' ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            (() => {
              const band = bandOf(toInt(testScore), med, hi);
              const tone = band === 'High' ? 'red' : band === 'Medium' ? 'amber' : 'green';
              return <span className={cn('rounded-full px-2 py-0.5 font-semibold', TONES[tone].text, 'bg-background border border-border')}>{band}</span>;
            })()
          )}
        </div>

        {invalid && (
          <p className="text-[11px] font-medium text-red-600" role="alert">
            Medium must start at 1 or more, and below High. High can be at most 100.
          </p>
        )}
      </div>
    </section>
  );
}

export const riskLevelsValid = (medium, high) => {
  const med = toInt(medium);
  const hi = toInt(high);
  return med >= 1 && hi <= 100 && med < hi;
};
