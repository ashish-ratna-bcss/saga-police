import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/auth.context';
import { Keyboard, Check } from 'lucide-react';
import { KEYBOARD_LANGUAGES, getLanguage, useKeyboardLanguage } from '../../lib/keyboardLanguages';
import { cn } from '../../lib/utils';

export default function KeyboardLanguageSection() {
  const code = useKeyboardLanguage();
  const { updateKeyboardLanguage } = useAuth();
  const [saving, setSaving] = useState(false);
  const setCode = async (next) => {
    if (next === code || saving) return;
    setSaving(true);
    try {
      await updateKeyboardLanguage(next);
      toast.success(`Keyboard language set to ${getLanguage(next).label}`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save keyboard language');
    } finally {
      setSaving(false);
    }
  };
  const active = getLanguage(code);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Keyboard className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-none">Keyboard Language</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick the language for this tenant. In every search bar, type with a normal English keyboard and it is converted
              to that language as you type (e.g. "raamu" → రాము). The keyboard icon gives on-screen keys, and the English meaning is shown below.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {KEYBOARD_LANGUAGES.map((l) => {
            const selected = l.code === code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => setCode(l.code)}
                className={cn(
                  'relative rounded-lg border p-3 text-left transition-colors hover:bg-muted',
                  selected && 'border-primary bg-primary/5 ring-1 ring-primary'
                )}
              >
                {selected && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />}
                <div className="text-lg leading-tight">{l.native}</div>
                <div className="text-[11px] text-muted-foreground">{l.label}</div>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold">Preview · {active.label}</div>
          {active.rows.map((row) => (
            <div key={row.title} className="mb-1.5 flex flex-wrap gap-1">
              {row.keys.map((k) => (
                <span key={k} className="flex h-7 min-w-[1.75rem] items-center justify-center rounded border bg-background px-1.5 text-sm">
                  {row.sign ? `◌${k}` : k}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Saved to the database for this whole tenant — every user sees the same language.</p>
      </div>
    </div>
  );
}
