import { composeKey } from './keyboardLanguages';

/**
 * Phonetic transliteration: type Latin letters on a normal keyboard and get the
 * selected language's script (like Google Input Tools / Lekhini).
 *   transliterate('te', 'raamu') -> 'రాము'
 * Supported: Indic scripts, Russian, Greek, Arabic, Urdu, Persian, Hebrew,
 * Japanese (hiragana), Korean. Others return null (typed as-is).
 */

/* ───────────── Indic (Brahmic) engine — Devanagari as the pivot ───────────── */

const CONS = {
  zh: 'ऴ', kh: 'ख', gh: 'घ', chh: 'छ', ch: 'च', jh: 'झ', Th: 'ठ', Dh: 'ढ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', sh: 'श',
  k: 'क', g: 'ग', c: 'च', j: 'ज', T: 'ट', D: 'ड', N: 'ण', t: 'त', d: 'द', n: 'न', p: 'प', f: 'फ', b: 'ब', m: 'म',
  y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', S: 'ष', L: 'ळ', z: 'ज', q: 'क', x: 'क्ष', R: 'र',
};
const VOW = {
  aa: ['आ', 'ा'], ai: ['ऐ', 'ै'], au: ['औ', 'ौ'], ii: ['ई', 'ी'], ee: ['ई', 'ी'], uu: ['ऊ', 'ू'], oo: ['ऊ', 'ू'],
  a: ['अ', ''], i: ['इ', 'ि'], u: ['उ', 'ु'], e: ['ऎ', 'ॆ'], E: ['ए', 'े'], o: ['ऒ', 'ॊ'], O: ['ओ', 'ो'],
  A: ['आ', 'ा'], I: ['ई', 'ी'], U: ['ऊ', 'ू'],
};
const MARK = { M: 'ं', H: 'ः' };

function matchIn(table, buf, i, maxLen) {
  for (let n = Math.min(maxLen, buf.length - i); n >= 1; n--) {
    const seg = buf.substr(i, n);
    if (Object.prototype.hasOwnProperty.call(table, seg)) return [seg, n];
    const low = seg.toLowerCase();
    if (low !== seg && Object.prototype.hasOwnProperty.call(table, low)) return [low, n];
  }
  return null;
}

function toDevanagari(buf, dropFinalVirama) {
  const items = [];
  for (let i = 0; i < buf.length;) {
    let m = matchIn(CONS, buf, i, 3);
    if (m) { items.push({ t: 'C', ch: CONS[m[0]] }); i += m[1]; continue; }
    m = matchIn(VOW, buf, i, 2);
    if (m) { items.push({ t: 'V', v: VOW[m[0]] }); i += m[1]; continue; }
    if (MARK[buf[i]]) { items.push({ t: 'M', ch: MARK[buf[i]] }); i += 1; continue; }
    items.push({ t: 'X', ch: buf[i] });
    i += 1;
  }
  let out = '';
  let hadVowel = false;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.t === 'C') {
      const next = items[k + 1];
      if (next && next.t === 'V') { out += it.ch + next.v[1]; hadVowel = true; k += 1; }
      else if (!next && dropFinalVirama && hadVowel) out += it.ch;
      else out += `${it.ch}्`;
    } else if (it.t === 'V') { out += it.v[0]; hadVowel = true; }
    else out += it.ch;
  }
  return out;
}

const INDIC_OFFSET = { te: 0x300, kn: 0x380, ml: 0x400, bn: 0x80, gu: 0x180, pa: 0x100, or: 0x200 };
const NORTH = new Set(['hi', 'mr', 'ne', 'bn', 'gu', 'pa', 'or']);
const SHORT_TO_LONG = { 'ऎ': 'ए', 'ॆ': 'े', 'ऒ': 'ओ', 'ॊ': 'ो' };
const TAMIL = {
  क: 'க', ख: 'க', ग: 'க', घ: 'க', ङ: 'ங', च: 'ச', छ: 'ச', ज: 'ஜ', झ: 'ஜ', ञ: 'ஞ', ट: 'ட', ठ: 'ட', ड: 'ட', ढ: 'ட',
  ण: 'ண', त: 'த', थ: 'த', द: 'த', ध: 'த', न: 'ந', प: 'ப', फ: 'ப', ब: 'ப', भ: 'ப', म: 'ம', य: 'ய', र: 'ர', ल: 'ல',
  व: 'வ', श: 'ஷ', ष: 'ஷ', स: 'ஸ', ह: 'ஹ', ळ: 'ள',
};

function fromDevanagari(deva, code) {
  const toLong = code !== 'te' && code !== 'kn' && code !== 'ml' && code !== 'ta';
  let s = deva;
  if (toLong) s = s.replace(/[ऎॆऒॊ]/g, (c) => SHORT_TO_LONG[c]);
  if (code === 'hi' || code === 'mr' || code === 'ne') return s;
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 0x0900 || cp > 0x097f) { out += ch; continue; }
    if (code === 'ta' && TAMIL[ch]) { out += TAMIL[ch]; continue; }
    if (code === 'bn' && ch === 'व') { out += 'ব'; continue; }
    const off = code === 'ta' ? 0x280 : INDIC_OFFSET[code];
    out += String.fromCodePoint(cp + off);
  }
  return out;
}

/* ───────────── Simple digraph engines ───────────── */

const fold = (pairs) => Object.fromEntries(pairs.trim().split(/\s+/).map((p) => p.split(':')));

const SIMPLE = {
  ru: fold(`shch:щ sh:ш ch:ч zh:ж kh:х ts:ц yu:ю ya:я yo:ё a:а b:б v:в g:г d:д e:е z:з i:и y:й k:к l:л m:м n:н o:о p:п r:р s:с t:т u:у f:ф h:х c:ц j:ж w:в x:кс q:к`),
  el: fold(`th:θ ch:χ ps:ψ a:α b:β g:γ d:δ e:ε z:ζ h:η i:ι k:κ l:λ m:μ n:ν x:ξ o:ο p:π r:ρ s:σ t:τ y:υ f:φ w:ω c:κ j:ι v:β q:θ u:υ`),
  ar: fold(`kh:خ sh:ش gh:غ th:ث dh:ذ a:ا b:ب t:ت j:ج H:ح d:د r:ر z:ز s:س S:ص D:ض T:ط Z:ظ f:ف q:ق k:ك l:ل m:م n:ن h:ه w:و y:ي c:ك p:ب v:ف g:ج x:كس e:ي i:ي o:و u:و`),
  ur: fold(`kh:خ sh:ش gh:غ zh:ژ ch:چ th:ث dh:ذ a:ا b:ب p:پ t:ت T:ٹ j:ج H:ح d:د D:ڈ r:ر R:ڑ z:ز s:س S:ص f:ف q:ق k:ک g:گ l:ل m:م n:ن N:ں h:ہ w:و y:ی v:و c:چ x:کس e:ے i:ی o:و u:و`),
  fa: fold(`kh:خ sh:ش gh:ق zh:ژ ch:چ th:ث a:ا b:ب p:پ t:ت j:ج H:ح d:د r:ر z:ز s:س S:ص f:ف q:ق k:ک g:گ l:ل m:م n:ن h:ه w:و v:و y:ی c:چ x:کس e:ی i:ی o:و u:و`),
  he: fold(`ts:צ sh:ש ch:ח a:א b:ב v:ו w:ו g:ג d:ד h:ה z:ז x:ח t:ט y:י k:כ l:ל m:מ n:נ s:ס o:ע p:פ q:ק r:ר T:ת c:כ f:פ j:ג e:א i:י u:ו`),
};

function simple(table, buf) {
  let out = '';
  for (let i = 0; i < buf.length;) {
    const m = matchIn(table, buf, i, 4);
    if (m) { out += table[m[0]]; i += m[1]; } else { out += buf[i]; i += 1; }
  }
  return out;
}

/* ───────────── Japanese (hiragana) ───────────── */

const JA = fold(`
a:あ i:い u:う e:え o:お ka:か ki:き ku:く ke:け ko:こ sa:さ shi:し si:し su:す se:せ so:そ ta:た chi:ち ti:ち tsu:つ tu:つ te:て to:と
na:な ni:に nu:ぬ ne:ね no:の ha:は hi:ひ fu:ふ hu:ふ he:へ ho:ほ ma:ま mi:み mu:む me:め mo:も ya:や yu:ゆ yo:よ
ra:ら ri:り ru:る re:れ ro:ろ wa:わ wo:を ga:が gi:ぎ gu:ぐ ge:げ go:ご za:ざ ji:じ zi:じ zu:ず ze:ぜ zo:ぞ da:だ de:で do:ど
ba:ば bi:び bu:ぶ be:べ bo:ぼ pa:ぱ pi:ぴ pu:ぷ pe:ぺ po:ぽ kya:きゃ kyu:きゅ kyo:きょ sha:しゃ shu:しゅ sho:しょ
cha:ちゃ chu:ちゅ cho:ちょ nya:にゃ nyu:にゅ nyo:にょ hya:ひゃ hyu:ひゅ hyo:ひょ mya:みゃ myu:みゅ myo:みょ
rya:りゃ ryu:りゅ ryo:りょ gya:ぎゃ gyu:ぎゅ gyo:ぎょ ja:じゃ ju:じゅ jo:じょ bya:びゃ byu:びゅ byo:びょ pya:ぴゃ pyu:ぴゅ pyo:ぴょ -:ー
`);
const VOWELS = 'aiueo';

function japanese(buf) {
  const s = buf.toLowerCase();
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    const nx = s[i + 1];
    if (nx && c === nx && /[a-z]/.test(c) && !VOWELS.includes(c) && c !== 'n') { out += 'っ'; i += 1; continue; }
    let hit = null;
    for (let n = Math.min(3, s.length - i); n >= 1 && !hit; n--) {
      const seg = s.substr(i, n);
      if (Object.prototype.hasOwnProperty.call(JA, seg)) hit = [JA[seg], n];
    }
    if (hit) { out += hit[0]; i += hit[1]; continue; }
    if (c === 'n') {
      if (nx === 'n') { out += 'ん'; i += 1; continue; }
      if (nx && !VOWELS.includes(nx) && nx !== 'y') { out += 'ん'; i += 1; continue; }
    }
    out += buf[i];
    i += 1;
  }
  return out;
}

/* ───────────── Korean (romaja → jamo → syllables) ───────────── */

const KO_V = fold(`yae:ㅒ yeo:ㅕ wae:ㅙ ae:ㅐ ya:ㅑ yo:ㅛ yu:ㅠ ye:ㅖ eo:ㅓ eu:ㅡ wa:ㅘ wo:ㅝ we:ㅞ wi:ㅟ oe:ㅚ ui:ㅢ a:ㅏ e:ㅔ i:ㅣ o:ㅗ u:ㅜ`);
const KO_C = fold(`ng:ㅇ kk:ㄲ tt:ㄸ pp:ㅃ ss:ㅆ jj:ㅉ ch:ㅊ g:ㄱ k:ㅋ n:ㄴ d:ㄷ t:ㅌ r:ㄹ l:ㄹ m:ㅁ b:ㅂ p:ㅍ s:ㅅ j:ㅈ h:ㅎ`);

function korean(buf) {
  const s = buf.toLowerCase();
  let out = '';
  let prevConsonant = false;
  for (let i = 0; i < s.length;) {
    let m = matchIn(KO_V, s, i, 3);
    if (m) {
      if (!prevConsonant) out = composeKey('ko', out, 'ㅇ');
      out = composeKey('ko', out, KO_V[m[0]]);
      prevConsonant = false;
      i += m[1];
      continue;
    }
    m = matchIn(KO_C, s, i, 2);
    if (m) { out = composeKey('ko', out, KO_C[m[0]]); prevConsonant = true; i += m[1]; continue; }
    out += buf[i];
    prevConsonant = false;
    i += 1;
  }
  return out;
}

/* ───────────── public API ───────────── */

export const supportsTransliteration = (code) =>
  Boolean(INDIC_OFFSET[code] || code === 'ta' || code === 'hi' || code === 'mr' || code === 'ne' || SIMPLE[code] || code === 'ja' || code === 'ko');

export function transliterate(code, roman) {
  if (!supportsTransliteration(code)) return null;
  if (code === 'ja') return japanese(roman);
  if (code === 'ko') return korean(roman);
  if (SIMPLE[code]) return simple(SIMPLE[code], roman);
  return fromDevanagari(toDevanagari(roman, NORTH.has(code)), code);
}
