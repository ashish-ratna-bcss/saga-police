import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, Delete } from 'lucide-react';
import api from '../lib/api';
import { blocksLatin, composeKey, getLanguage, lookupEnglish, suggestKeywords, useKeyboardLanguage } from '../lib/keyboardLanguages';

/**
 * Adds a keyboard icon to every search/filter input in the app.
 *  - Icon opens a small popup with the keys of the tenant's selected language.
 *  - While typing, matching keywords are suggested below the input, each with
 *    its English translation (when the selected language is not English).
 * Inputs are discovered from the DOM, so new search bars get it automatically.
 * Opt out with data-no-keyboard on an input.
 */

const SEARCH_RE = /search|filter|find/i;
const SKIP_TYPES = new Set(['password', 'email', 'number', 'date', 'file', 'checkbox', 'radio', 'hidden', 'range', 'color', 'time', 'tel']);

const isSearchInput = (el) => {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.hasAttribute('data-no-keyboard') || el.hasAttribute('cmdk-input')) return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (SKIP_TYPES.has(type)) return false;
  if (el.readOnly || el.disabled) return false;
  return type === 'search' || SEARCH_RE.test(el.getAttribute('placeholder') || '');
};

/** Set a React-controlled input's value and notify React. */
function writeValue(input, value, caret) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  try {
    input.setSelectionRange(caret, caret);
  } catch { /* some input types have no selection */ }
}

function Assist({ input, lang }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState(input.value);
  const [pos, setPos] = useState(null);
  const [translation, setTranslation] = useState('');
  const [tStatus, setTStatus] = useState('idle'); // idle | loading | done | unavailable
  const wrapRef = useRef(null);
  const language = getLanguage(lang);
  const langRef = useRef(lang);
  langRef.current = lang;

  const measure = useCallback(() => {
    if (!input.isConnected || input.offsetWidth === 0 || input.offsetHeight === 0) {
      setPos(null);
      return;
    }
    setPos({
      left: input.offsetLeft,
      top: input.offsetTop,
      width: input.offsetWidth,
      height: input.offsetHeight,
    });
  }, [input]);

  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(input);
    window.addEventListener('resize', measure);
    const onFocus = () => { setFocused(true); measure(); };
    const onBlur = () => setFocused(false);
    const onInput = () => setValue(input.value);
    const strict = () =>
      blocksLatin(langRef.current) &&
      !input.hasAttribute('data-allow-any-language') &&
      !/url|link/i.test(input.getAttribute('placeholder') || '');
    const onBeforeInput = (e) => {
      if (e.isComposing || !strict() || typeof e.data !== 'string') return;
      if (/[A-Za-z]/.test(e.data)) {
        e.preventDefault();
        const clean = e.data.replace(/[A-Za-z]/g, '');
        if (clean) {
          const v = input.value;
          const s = input.selectionStart ?? v.length;
          const en = input.selectionEnd ?? v.length;
          writeValue(input, v.slice(0, s) + clean + v.slice(en), s + clean.length);
        }
      }
    };
    input.addEventListener('beforeinput', onBeforeInput);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('input', onInput);
    const prevPad = input.style.paddingRight;
    input.style.paddingRight = '2rem';
    const poll = window.setInterval(measure, 800); // layout shifts (tabs, dialogs)
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('input', onInput);
      input.removeEventListener('beforeinput', onBeforeInput);
      input.style.paddingRight = prevPad;
      window.clearInterval(poll);
    };
  }, [input, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && e.target !== input) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, input]);

  // English meaning of everything typed: instant from the keyword list, then refined by the backend LLM
  useEffect(() => {
    const text = value.trim();
    if (lang === 'en' || text.length < 1 || !(focused || open)) {
      setTranslation('');
      setTStatus('idle');
      return undefined;
    }
    const local = lookupEnglish(lang, text);
    setTranslation(local);
    setTStatus(local ? 'done' : 'loading');
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const res = await api.get('/translate/to-english', { params: { text, lang } });
        const english = String(res.data?.english || '').trim();
        if (cancelled) return;
        if (english && english.toLowerCase() !== text.toLowerCase()) {
          setTranslation(english);
          setTStatus('done');
        } else {
          setTStatus(local ? 'done' : res.data?.unavailable ? 'unavailable' : 'same');
        }
      } catch {
        if (!cancelled) setTStatus(local ? 'done' : 'unavailable');
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, lang, focused, open]);

  const insert = (key, sign) => {
    const v = input.value;
    const start = input.selectionStart ?? v.length;
    const end = input.selectionEnd ?? v.length;
    const head = composeKey(lang, v.slice(0, start), key);
    writeValue(input, head + v.slice(end), head.length);
    void sign;
  };

  const backspace = () => {
    const v = input.value;
    const start = input.selectionStart ?? v.length;
    const end = input.selectionEnd ?? v.length;
    if (start !== end) return writeValue(input, v.slice(0, start) + v.slice(end), start);
    if (start === 0) return undefined;
    const prev = Array.from(v.slice(0, start));
    prev.pop();
    const head = prev.join('');
    return writeValue(input, head + v.slice(start), head.length);
  };

  const pickSuggestion = (text) => {
    const v = input.value;
    const caret = input.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const tokenStart = Math.max(before.lastIndexOf(' ') + 1, 0);
    const next = v.slice(0, tokenStart) + text + ' ' + v.slice(caret);
    writeValue(input, next, tokenStart + text.length + 1);
  };

  if (!pos || !input.parentElement) return null;

  const lastToken = value.slice(0, input.selectionStart ?? value.length).split(/\s+/).pop();
  const suggestions = focused && !open ? suggestKeywords(lang, lastToken) : [];
  const showTranslation = lang !== 'en' && value.trim().length > 0 && tStatus !== 'idle';
  const showPanel = focused && !open && (suggestions.length > 0 || showTranslation);
  const panelTop = pos.top + pos.height + 4;
  const panelLeft = Math.max(pos.left, 0);

  return createPortal(
    <div ref={wrapRef} data-keyboard-assist onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
      <button
        type="button"
        tabIndex={-1}
        title={`${language.label} keyboard`}
        aria-label={`${language.label} keyboard`}
        onClick={() => { measure(); setOpen((o) => !o); }}
        style={{
          position: 'absolute',
          left: pos.left + pos.width - 28,
          top: pos.top + (pos.height - 22) / 2,
          width: 22,
          height: 22,
          zIndex: 5,
        }}
        className="flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Keyboard className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          style={{ position: 'absolute', left: panelLeft, top: panelTop, zIndex: 300, width: Math.min(Math.max(pos.width, 300), 380) }}
          className="rounded-md border bg-popover p-2 text-popover-foreground shadow-lg"
          dir={language.rtl ? 'rtl' : 'ltr'}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold">{language.label} <span className="font-normal text-muted-foreground">· {language.native}</span></span>
            <button type="button" onClick={backspace} className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted" aria-label="Backspace">
              <Delete className="h-3 w-3" /> Back
            </button>
          </div>
          {showTranslation && (
            <div className="mb-1.5 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              English: <span className="font-medium text-foreground">{translation || (tStatus === 'loading' ? 'translating…' : '—')}</span>
            </div>
          )}
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {language.rows.map((row) => (
              <div key={row.title}>
                <div className="mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{row.title}</div>
                <div className="flex flex-wrap gap-1">
                  {row.keys.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => insert(k, row.sign)}
                      className="h-7 min-w-[1.75rem] rounded border bg-background px-1.5 text-sm hover:bg-primary hover:text-primary-foreground"
                    >
                      {row.sign ? `◌${k}` : k}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => insert(' ')} className="h-7 w-full rounded border bg-background text-[10px] text-muted-foreground hover:bg-muted">
              space
            </button>
          </div>
        </div>
      )}

      {showPanel && (
        <ul
          style={{ position: 'absolute', left: panelLeft, top: panelTop, zIndex: 300, width: Math.max(pos.width, 220) }}
          className="overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-lg"
          dir={language.rtl ? 'rtl' : 'ltr'}
        >
          {showTranslation && (
            <li className="border-b px-3 pb-1 text-[11px] text-muted-foreground">
              English:{' '}
              {translation ? (
                <span className="font-medium text-foreground">{translation}</span>
              ) : tStatus === 'loading' ? (
                'translating…'
              ) : tStatus === 'unavailable' ? (
                'translation unavailable'
              ) : (
                'no change'
              )}
            </li>
          )}
          {suggestions.map((s) => (
            <li key={s.text}>
              <button
                type="button"
                onClick={() => pickSuggestion(s.text)}
                className="flex w-full flex-col items-start px-3 py-1 text-left hover:bg-muted"
              >
                <span className="text-sm">{s.text}</span>
                {s.english && <span className="text-[11px] text-muted-foreground">English: {s.english}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    input.parentElement
  );
}

export default function KeyboardAssist() {
  const lang = useKeyboardLanguage();
  const [inputs, setInputs] = useState([]);
  const raf = useRef(0);

  useEffect(() => {
    const scan = () => {
      raf.current = 0;
      const found = Array.from(document.querySelectorAll('input')).filter(isSearchInput);
      setInputs((prev) =>
        prev.length === found.length && prev.every((el, i) => el === found[i]) ? prev : found
      );
    };
    const schedule = () => {
      if (!raf.current) raf.current = requestAnimationFrame(scan);
    };
    scan();
    const mo = new MutationObserver((muts) => {
      // ignore our own portal churn
      if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.hasAttribute?.('data-keyboard-assist')))) return;
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return inputs.map((el) => <Assist key={keyOf(el)} input={el} lang={lang} />);
}

const ids = new WeakMap();
let nextId = 1;
function keyOf(el) {
  if (!ids.has(el)) ids.set(el, nextId++);
  return ids.get(el);
}
