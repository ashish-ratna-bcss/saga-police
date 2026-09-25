/**
 * Helpers for the live help preview. They run against the DOM of a same-origin iframe that
 * shows a real app page, so markers land on the actual controls and personal details can be blurred.
 */

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const INTERACTIVE = 'button, a, [role="tab"], [role="button"], input, select, textarea, th, label, summary';

/** Text areas and UI chrome we never blur (labels, buttons, headings, table heads). */
const CHROME = 'button, a, label, th, [role="tab"], [role="button"], h1, h2, h3, h4, option, summary, legend, input, select, textarea, svg, code, kbd';

const isVisible = (el, win) => {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const cs = win.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
};

const ownText = (el) => {
  let out = '';
  for (const n of el.childNodes) if (n.nodeType === 3) out += n.nodeValue;
  return norm(out);
};

/**
 * Finds the element a help marker points to.
 * target: { sel } | { text } | { placeholder } | { label }  (text may be an array of alternatives)
 * Returns the element, or null when it is not on screen.
 */
export const findTarget = (doc, target) => {
  if (!doc || !doc.body || !target) return null;
  const win = doc.defaultView;

  if (target.sel) {
    try {
      return [...doc.querySelectorAll(target.sel)].find((e) => isVisible(e, win)) || null;
    } catch {
      return null;
    }
  }

  const wantsRaw = target.text ?? target.placeholder ?? target.label;
  const wants = [].concat(wantsRaw || []).map(norm).filter(Boolean);
  if (!wants.length) return null;

  let best = null;
  let bestScore = Infinity;
  for (const el of doc.body.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    let matchKind = 0; // 1 exact, 2 prefix
    let candidate = el;

    if (target.placeholder !== undefined) {
      const ph = norm(el.getAttribute && el.getAttribute('placeholder'));
      if (ph) matchKind = wants.some((w) => ph === w) ? 1 : wants.some((w) => w.length >= 3 && ph.startsWith(w)) ? 2 : 0;
    } else if (target.label !== undefined) {
      const lb = norm(el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title')));
      if (lb) matchKind = wants.some((w) => lb === w) ? 1 : wants.some((w) => w.length >= 3 && lb.startsWith(w)) ? 2 : 0;
    } else {
      const own = ownText(el);
      if (own) matchKind = wants.some((w) => own === w) ? 1 : wants.some((w) => w.length >= 3 && own.startsWith(w)) ? 2 : 0;
      if (!matchKind && el.matches && el.matches(INTERACTIVE)) {
        const full = norm(el.textContent);
        if (full) matchKind = wants.some((w) => full === w) ? 1 : 0;
      }
    }
    if (!matchKind) continue;
    if (!isVisible(candidate, win)) continue;

    // Point at the control that contains the text, when there is one of similar size.
    const ancestor = candidate.closest && candidate.closest(INTERACTIVE);
    if (ancestor && ancestor !== candidate && isVisible(ancestor, win)) {
      const a = ancestor.getBoundingClientRect();
      const c = candidate.getBoundingClientRect();
      if (a.width * a.height <= c.width * c.height * 6) candidate = ancestor;
    }
    const r = candidate.getBoundingClientRect();
    const score = matchKind * 1e9 + r.width * r.height;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
};

/** Long free text, @handles, emails, phone numbers, long ids and links look like personal details. */
export const looksPersonal = (text) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return false;
  if (t.length >= 60) return true;
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)) return true;
  if (/(^|\s)@[\w.]{2,}/.test(t)) return true;
  if (/\+?\d[\d\s().-]{8,}\d/.test(t)) return true;
  if (/\b\d{9,}\b/.test(t)) return true;
  if (/https?:\/\//i.test(t)) return true;
  return false;
};

const isHandleLike = (text) => /(^|\s)@[\w.]{2,}|[\w.+-]+@[\w-]+\.[\w.-]+/.test(String(text || ''));

/** A person's name usually sits right before their @handle or email, so blur that neighbour too. */
const blurNeighbourName = (el) => {
  const candidates = [el.previousElementSibling];
  // handle wrapped in its own span inside a row: look one level up as well
  if (el.parentElement && el.parentElement.children.length <= 3) {
    candidates.push(el.parentElement.previousElementSibling);
  }
  for (const c of candidates) {
    if (!c || c.hasAttribute('data-help-blur') || c.matches(CHROME) || c.querySelector('img, svg')) continue;
    const t = (c.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && t.length <= 40 && !/^\d+$/.test(t)) c.setAttribute('data-help-blur', '1');
  }
};

const EMBED_CSS = `
  html, body { overflow: hidden !important; }
  ::-webkit-scrollbar { display: none !important; }
  * { cursor: default !important; }
  img:not([data-keep-clear]), video { filter: blur(10px) !important; }
  [data-pii], [data-help-blur] { filter: blur(6px) !important; user-select: none !important; }
`;

/** Injects the embed styles and keeps personal details blurred while the page loads data. Returns a stop function. */
export const prepareEmbeddedDocument = (doc, { blur = true } = {}) => {
  if (!doc || !doc.head || !doc.body) return () => {};
  if (!doc.getElementById('help-embed-style')) {
    const style = doc.createElement('style');
    style.id = 'help-embed-style';
    style.textContent = EMBED_CSS;
    doc.head.appendChild(style);
  }
  if (!blur) return () => {};

  const win = doc.defaultView;
  let queued = false;
  const scan = () => {
    queued = false;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.hasAttribute('data-help-blur') && !parent.closest(CHROME) && looksPersonal(node.nodeValue)) {
        parent.setAttribute('data-help-blur', '1');
        if (isHandleLike(node.nodeValue)) blurNeighbourName(parent);
      }
      node = walker.nextNode();
    }
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(scan);
  };
  scan();
  const observer = new win.MutationObserver(queue);
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
};
