import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard } from 'lucide-react';
import api from '../lib/api';
import { supportsTransliteration, transliterate } from '../lib/transliterate';
import { getLanguage, lookupEnglish, suggestKeywords, useKeyboardLanguage } from '../lib/keyboardLanguages';

/**
 * Optional "type in my language" switch for search and keyword boxes.
 *
 *  - It appears only on the pages listed in PAGES, and only when the tenant's language is not English.
 *  - The icon is RED while it is off: typing is plain English, exactly as before.
 *  - Click it to turn it ON (green, showing the language). Letters typed on a normal keyboard are then
 *    converted into that language as you type, with suggestions and the English meaning shown below.
 *  - Click again to switch back to English. It starts off every time.
 * Inputs are discovered from the DOM. Opt out with data-no-keyboard on an input.
 */

// Where the switch is offered. `all` = every search/keyword box on the page; otherwise only boxes marked data-keyboard.
const PAGES = [
  { prefix: '/alerts', all: true },
  { prefix: '/events', all: true },
  { prefix: '/analysis-tools/news', all: true },
  { prefix: '/analysis-tools/epaper', all: true },
  { prefix: '/settings', all: false },
];

const pageRule = () => {
  const path = typeof window === 'undefined' ? '' : window.location.pathname;
  return PAGES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`)) || null;
};

const SEARCH_RE = /search|filter|find|keyword|query/i;
const SKIP_TYPES = new Set(['password', 'email', 'number', 'date', 'file', 'checkbox', 'radio', 'hidden', 'range', 'color', 'time', 'tel']);

const isSearchInput = (el, rule) => {
  if (!rule || !(el instanceof HTMLInputElement)) return false;
  if (el.hasAttribute('data-no-keyboard') || el.hasAttribute('cmdk-input')) return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (SKIP_TYPES.has(type)) return false;
  if (el.readOnly || el.disabled) return false;
  if (el.hasAttribute('data-keyboard')) return true;
  if (!rule.all) return false;
  if (type === 'search' || el.getAttribute('role') === 'searchbox' || el.inputMode === 'search') return true;
  if (el.enterKeyHint === 'search' || el.closest('[role="search"], form[role="search"]')) return true;
  return [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('name'), el.id]
    .some((v) => SEARCH_RE.test(v || ''));
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
  const [on, setOn] = useState(false); // off by default: plain English
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState(input.value);
  const [pos, setPos] = useState(null);
  const [fpos, setFpos] = useState(null);
  const [translation, setTranslation] = useState('');
  const [tStatus, setTStatus] = useState('idle'); // idle | loading | done | unavailable
  const floatRef = useRef(null);
  const language = getLanguage(lang);
  const langRef = useRef(lang);
  langRef.current = lang;
  const onRef = useRef(false);
  onRef.current = on;
  const resetRef = useRef(() => {});

  const measure = useCallback(() => {
    if (!input.isConnected || input.offsetWidth === 0 || input.offsetHeight === 0) {
      setPos(null);
      return;
    }
    // Controls overlaid on the right of the input (e.g. a "Search" button): keep the switch left of them.
    let inset = 0;
    const parent = input.parentElement;
    if (parent) {
      const ir = input.getBoundingClientRect();
      let limit = ir.right;
      Array.from(parent.children).forEach((el) => {
        if (el === input || el.hasAttribute('data-keyboard-assist')) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.left > ir.left + ir.width / 2 && r.left < limit
          && r.top < ir.bottom && r.bottom > ir.top) limit = r.left;
      });
      inset = Math.max(0, Math.round(ir.right - limit));
    }
    // The suggestions live outside the input's (possibly overflow:hidden) container, so position them in viewport terms.
    if (floatRef.current) {
      const origin = floatRef.current.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      setFpos({ left: ir.left - origin.left, top: ir.bottom - origin.top + 4 });
    }
    setPos({ left: input.offsetLeft, top: input.offsetTop, width: input.offsetWidth, height: input.offsetHeight, inset });
  }, [input]);

  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(input);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const onFocus = () => { setFocused(true); measure(); };
    const onBlur = () => setFocused(false);
    const onInput = () => setValue(input.value);
    // Phonetic typing (only while the switch is ON): Latin letters become the selected script.
    // st tracks the Latin letters of the word being typed and where its output sits.
    const st = { buf: '', start: 0, outLen: 0, expected: null, caret: -1 };
    const reset = () => { st.buf = ''; st.expected = null; };
    resetRef.current = reset;
    const apply = (v, start, removeLen, out) => {
      const next = v.slice(0, start) + out + v.slice(start + removeLen);
      writeValue(input, next, start + out.length);
      st.start = start;
      st.outLen = out.length;
      st.expected = next;
      st.caret = start + out.length;
    };
    const onBeforeInput = (e) => {
      const code = langRef.current;
      if (!onRef.current || e.isComposing || !supportsTransliteration(code) || input.hasAttribute('data-allow-any-language')
        || ((ph) => /url|link/i.test(ph) && !/search|filter|find/i.test(ph))(input.getAttribute('placeholder') || '')) { reset(); return; }
      const v = input.value;
      const s = input.selectionStart ?? v.length;
      const en = input.selectionEnd ?? v.length;
      const continuing = st.buf && v === st.expected && s === en && s === st.caret;
      if (e.inputType === 'insertText' && typeof e.data === 'string' && /^[A-Za-z]$/.test(e.data)) {
        if (!continuing && /^(@|#?https?|www\.)/i.test(v.slice(0, s).split(/\s/).pop())) { reset(); return; }
        e.preventDefault();
        if (!continuing) { st.buf = ''; st.outLen = en - s; st.start = s; }
        st.buf += e.data;
        apply(v, st.start, continuing ? st.outLen : en - s, transliterate(code, st.buf));
      } else if (e.inputType === 'deleteContentBackward' && continuing) {
        e.preventDefault();
        st.buf = st.buf.slice(0, -1);
        const out = st.buf ? transliterate(code, st.buf) : '';
        const len = st.outLen;
        apply(v, st.start, len, out);
        if (!st.buf) reset();
      } else {
        reset();
      }
    };
    input.addEventListener('beforeinput', onBeforeInput);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('input', onInput);
    const poll = window.setInterval(measure, 800); // layout shifts (tabs, dialogs)
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('input', onInput);
      input.removeEventListener('beforeinput', onBeforeInput);
      window.clearInterval(poll);
    };
  }, [input, measure]);

  // Leave room for the switch inside the box; restore the original padding when it goes away.
  useEffect(() => {
    if (lang === 'en') return undefined;
    const prev = input.style.paddingRight;
    input.style.paddingRight = on ? '6.5rem' : '2.25rem';
    return () => { input.style.paddingRight = prev; };
  }, [input, on, lang]);

  // Turning the switch off forgets any half-typed word.
  useEffect(() => { if (!on) resetRef.current(); }, [on]);

  // English meaning of everything typed (only while the switch is ON)
  useEffect(() => {
    const text = value.trim();
    if (!on || lang === 'en' || text.length < 1 || !focused) {
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
  }, [value, lang, focused, on]);

  const pickSuggestion = (text) => {
    const v = input.value;
    const caret = input.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const tokenStart = Math.max(before.lastIndexOf(' ') + 1, 0);
    const next = v.slice(0, tokenStart) + text + ' ' + v.slice(caret);
    writeValue(input, next, tokenStart + text.length + 1);
  };

  const toggle = () => {
    setOn((v) => !v);
    input.focus();
  };

  if (lang === 'en' || !pos || !input.parentElement) return null;

  const lastToken = value.slice(0, input.selectionStart ?? value.length).split(/\s+/).pop();
  const suggestions = on && focused ? suggestKeywords(lang, lastToken) : [];
  const showTranslation = on && value.trim().length > 0 && (tStatus === 'loading' || (tStatus === 'done' && Boolean(translation)));
  const showPanel = on && focused && (suggestions.length > 0 || showTranslation);
  const host = input.closest('[role="dialog"]') || document.body;
  const stopBlur = (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); };

  return (
    <>
      {createPortal(
        <div data-keyboard-assist onMouseDown={stopBlur}>
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={on}
            title={on
              ? `Typing in ${language.label}. Click to go back to English.`
              : `Keyboard off: typing in English. Click to type in ${language.label}.`}
            aria-label={on ? `Typing in ${language.label}` : `Turn on ${language.label} typing`}
            onClick={toggle}
            style={{
              position: 'absolute',
              left: pos.left + pos.width - 6 - (pos.inset || 0),
              top: pos.top + (pos.height - 22) / 2,
              height: 22,
              transform: 'translateX(-100%)',
              zIndex: 5,
            }}
            className={`flex items-center gap-1 rounded px-1.5 text-[10px] font-semibold ${
              on
                ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40 dark:text-emerald-400'
                : 'text-red-500 hover:bg-red-500/10'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            {on && <span className="max-w-[4.5rem] truncate">{language.native}</span>}
          </button>
        </div>,
        input.parentElement
      )}
      {createPortal(
        <div
          ref={floatRef}
          data-keyboard-assist
          onMouseDown={stopBlur}
          style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, zIndex: 2147483000 }}
        >
          {showPanel && fpos && (
            <ul
              style={{ position: 'absolute', left: fpos.left, top: fpos.top, width: Math.max(pos.width, 220) }}
              className="overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-lg"
              dir={language.rtl ? 'rtl' : 'ltr'}
            >
              {showTranslation && (
                <li className="border-b px-3 pb-1 text-[11px] text-muted-foreground">
                  English:{' '}
                  {translation ? <span className="font-medium text-foreground">{translation}</span> : 'translating…'}
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
        host
      )}
    </>
  );
}

export default function KeyboardAssist() {
  const lang = useKeyboardLanguage();
  const [inputs, setInputs] = useState([]);
  const raf = useRef(0);

  useEffect(() => {
    const scan = () => {
      raf.current = 0;
      const rule = pageRule();
      const found = rule ? Array.from(document.querySelectorAll('input')).filter((el) => isSearchInput(el, rule)) : [];
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
    window.addEventListener('popstate', schedule);
    return () => {
      mo.disconnect();
      window.removeEventListener('popstate', schedule);
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
