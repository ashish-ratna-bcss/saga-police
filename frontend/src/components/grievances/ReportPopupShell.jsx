import React from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const THEMES = {
  suggestion: {
    accent: 'border-t-violet-500',
    chip: 'bg-violet-100 text-violet-900',
    activeStep: 'bg-violet-600 text-white',
    idleStep: 'bg-muted text-muted-foreground',
    primaryBtn: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  criticism: {
    accent: 'border-t-rose-500',
    chip: 'bg-rose-100 text-rose-900',
    activeStep: 'bg-rose-600 text-white',
    idleStep: 'bg-muted text-muted-foreground',
    primaryBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  grievance: {
    accent: 'border-t-amber-500',
    chip: 'bg-amber-100 text-amber-900',
    activeStep: 'bg-amber-600 text-white',
    idleStep: 'bg-muted text-muted-foreground',
    primaryBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
};

/**
 * Clearer chrome for G / S / C report windows.
 * Portaled to document.body so AppLayout overflow cannot hide it.
 */
export const ReportPopupShell = ({
  theme = 'suggestion',
  title,
  subtitle,
  uniqueCode,
  steps = [],
  activeStep,
  onClose,
  onHeaderMouseDown,
  children,
  footer,
  style,
  popupRef,
}) => {
  const t = THEMES[theme] || THEMES.suggestion;

  const node = (
    <>
      <div className="fixed inset-0 bg-black/40 z-[9998]" onClick={onClose} />
      <div
        ref={popupRef}
        className={cn(
          'fixed z-[9999] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-border border-t-4 flex flex-col overflow-hidden',
          t.accent
        )}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border bg-card cursor-move shrink-0"
          onMouseDown={onHeaderMouseDown}
        >
          <div className="min-w-0 flex items-start gap-2">
            <GripHorizontal className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                {uniqueCode ? (
                  <span className={cn('px-2 py-0.5 rounded text-xs font-mono font-semibold', t.chip)}>
                    {uniqueCode}
                  </span>
                ) : null}
              </div>
              {subtitle ? (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {steps.length > 0 && (
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap shrink-0">
            {steps.map((step, idx) => {
              const active = step.id === activeStep;
              return (
                <div key={step.id} className="flex items-center gap-2">
                  {idx > 0 && <span className="text-muted-foreground/50 text-xs">→</span>}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
                      active ? t.activeStep : t.idleStep
                    )}
                  >
                    <span className="tabular-nums opacity-80">{idx + 1}</span>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

        {footer ? (
          <div className="shrink-0 px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
};

export const ReportPrimaryButton = ({ theme = 'suggestion', className, ...props }) => {
  const t = THEMES[theme] || THEMES.suggestion;
  return <Button className={cn(t.primaryBtn, 'gap-2', className)} {...props} />;
};

export default ReportPopupShell;
