/**
 * EVENT SUMMARY PROMPT: the ONE file that defines what we ask the LLM and how we read its answer.
 *
 *   buildSystemPrompt(ctx)   rules for the analyst + the fixed JSON output contract
 *   buildUserContext(ctx)    the event statistics and the numbered evidence posts the model works from
 *   RETRY_MESSAGE            sent once if the first reply is not valid JSON
 *   parseLLMReport(raw, ev)  reads + validates the model's JSON (drops any post number that is not in the evidence)
 *   reportToMarkdown(r, n)   turns the JSON into the six-section markdown used by Copy and older screens
 *
 * Small event (<= 25 posts): ONE call returns the whole report as one JSON object with a fixed structure.
 * Larger events: EVERY post is read in small batches (BATCH_*), then ONE final call (REDUCER_*) writes the same JSON from the batch notes. Every sentence shown in the
 * on-screen summary and in the PDF report comes from that JSON. Numbers (counts, percentages, engagement) are
 * never taken from the model: they are computed from the database and only quoted in the text.
 * To change what the report says, edit RULES or OUTPUT_CONTRACT below. Nothing else needs to change,
 * as long as the JSON field names stay the same (the UI and the PDF read those names).
 */

/* ------------------------------------------------------------------ 1. RULES ------------------------------ */
const RULES = `You are a senior OSINT analyst writing an evidence-grounded Event Summary for executive and security leadership.

RULES:
1. Grounding: Use ONLY the provided statistics and evidence posts. Never invent people, events, dates, numbers, or sources. Quote statistics exactly; never recalculate.
2. Sentiment & Risk: Praise = Positive, News/Updates = Neutral, Criticism = Negative. Criticism is NOT a threat unless explicitly calling for violence, strikes, blockades, or unrest. Keep sentiment, risk, and misinformation distinct.
3. Citations: Cite evidence as [Post #n] using ONLY numbers present in the evidence list.
4. Tone & Style: Plain English, concise, analytical sentences. Avoid generic filler phrases. Ground all claims in evidence.
5. Never say something is absent when its count is above 0 (praise 7 means "7 praise posts", not "no praise"); if a count is 0, say none were recorded. The statistics are the truth even if a post's wording seems to disagree.
6. Avoid the phrases: "public sentiment", "dominated conversations" (unless over 80%), "no organized dissent", "proceeded smoothly", "fostering public confidence". Describe non-English posts in English.
7. Leave out anything the posts do not support.`;

/* ---------------------------------------------------------------- 2. OUTPUT CONTRACT ---------------------- */
const OUTPUT_CONTRACT = `OUTPUT: ONE JSON object only (no conversational text, no markdown code fences) with exactly these fields:
{
 "bottom_line": "2-3 sentences: core situation, tone breakdown, and priority items requiring attention",
 "key_findings": [{"headline": "short concise headline", "detail": "1-2 sentences with exact figures"}],
 "situation": "paragraph: event background, scope of posts analyzed, date range, active platforms",
 "sentiment_commentary": "paragraph: praise/news/criticism toward government, police, leaders, orgs with [Post #n] citations",
 "narratives": [{"title": "3-7 words", "discussed": "2-3 sentences: theme, kind of discussion (analysis, news, rumour, opinion, satire, notice), [Post #n] citations", "tone": "1-2 sentences on sentiment mix, using the posts' labels", "risk": "1-2 sentences or 'No risk signal.'", "posts": [1, 2]}],   // 3-7; EVERY evidence post in exactly ONE narrative
 "public_order": "paragraph: threat evaluation, agitation/protest indicators (strictly separate peaceful criticism from threats)",
 "platforms_commentary": "paragraph: platform distribution and key amplifying voices",
 "recommended_actions": [{"action": "short imperative", "detail": "1-2 actionable sentences", "posts": [1]}],
 "claims": [{"claim": "short factual claim", "posts": [1], "triage": "VERIFY or MONITOR", "note": "verification path or monitoring reason"}],
 "changes": [{"from": "earlier state", "to": "later state", "post": 1}],
 "emerging_keywords": [{"term": "#tag or phrase", "posts": [1], "why": "short reason"}],
 "source_types": {"1": "media", "2": "creator", "3": "individual"}   // EVERY post number; media = outlet/agency/think tank/official, creator = channel/page/blog, individual = personal account
}
claims: 0-8 factual assertions (not opinions). VERIFY = checkable against an official source; MONITOR = theme to watch. changes: only if a post itself states a before/after. Finish every field; shorten paragraphs rather than dropping fields. Output valid complete JSON.`;

const buildSystemPrompt = (ctx) => `${RULES}\n\nEVENT: "${ctx.event.name}"\n\n${OUTPUT_CONTRACT}`;

/* ----------------------------------------------------------------- 3. USER CONTEXT ---------------------- */
const buildUserContext = (ctx = {}) => {
  const {
    event = {}, keywordsList = [], totalMediaCount = 0, relevantPostsCount = 0, unrelatedPostsCount = 0, totalKeywordMentionsCount = 0,
    earliestPost, latestPost, platformCounts = {}, platformPercentages = {}, activeSentiment = {}, sentimentPercentages = {},
    targetBreakdown = {}, riskCounts = {}, totalEngagement = {}, indexedSnippets = [],
  } = ctx;
  const tb = (k) => targetBreakdown[k] || { total: 0, praise: 0, news: 0, criticism: 0 };
  const platStr = Object.entries(platformCounts).map(([plt, c]) => `${String(plt).toUpperCase()}:${c}(${platformPercentages[plt] || 0}%)`).join(' ') || 'all';
  const targetStr = `Gov:${tb('Government').total}(${tb('Government').praise}P/${tb('Government').news}N/${tb('Government').criticism}C) | Police:${tb('Police').total}(${tb('Police').praise}P/${tb('Police').news}N/${tb('Police').criticism}C) | Leaders:${tb('Political leader').total}(${tb('Political leader').praise}P/${tb('Political leader').news}N/${tb('Political leader').criticism}C) | Org:${tb('Organization').total}(${tb('Organization').praise}P/${tb('Organization').news}N/${tb('Organization').criticism}C) | Other:${tb('Other').total}`;

  const critHighRisk = (riskCounts.critical || 0) + (riskCounts.high || 0);
  const medRisk = riskCounts.medium || 0;
  const lowRisk = riskCounts.low || 0;

  const likes = totalEngagement.likes || 0;
  const shares = totalEngagement.shares || 0;
  const comments = totalEngagement.comments || 0;
  const views = totalEngagement.views || 0;

  const dateStart = earliestPost ? (typeof earliestPost.toLocaleDateString === 'function' ? earliestPost.toLocaleDateString() : String(earliestPost)) : 'N/A';
  const dateEnd = latestPost ? (typeof latestPost.toLocaleDateString === 'function' ? latestPost.toLocaleDateString() : String(latestPost)) : 'N/A';

  return `EVENT: ${event.name || 'Event'} | Loc: ${event.location || 'General'} | Platforms: ${(event.platforms || []).join(',') || 'all'} | Keywords: ${(keywordsList || []).join(',') || 'general'}
STATS: TotalPosts=${totalMediaCount} (Relevant=${relevantPostsCount}, Peripheral=${unrelatedPostsCount}, KeywordMentions=${totalKeywordMentionsCount}) | Dates: ${dateStart} to ${dateEnd}
PLATFORMS: ${platStr}
SENTIMENT: Praise=${activeSentiment.positive || 0}(${sentimentPercentages.positive || 0}%) News=${activeSentiment.neutral || 0}(${sentimentPercentages.neutral || 0}%) Criticism=${activeSentiment.negative || 0}(${sentimentPercentages.negative || 0}%)
TARGETS: ${targetStr}
RISK: Crit/High=${critHighRisk}, Med=${medRisk}, Low=${lowRisk} | ENGAGEMENT: Likes=${likes}, Shares=${shares}, Comments=${comments}, Views=${views}

EVIDENCE (${indexedSnippets.length} posts):
${indexedSnippets.length > 0
    ? indexedSnippets.map((s) => `${s.citationTag} [${String(s.platform || 'x').toUpperCase()}/@${s.author || 'user'}|${s.sentiment || 'neutral'}|${s.target_entity || 'Other'}|risk:${s.risk_level || 'low'}] ${s.text || ''}`).join('\n')
    : 'No text posts available.'}`.trim();
};

/* ------------------------------------------- 3b. BIG EVENTS: BATCH NOTES (every post is read) ------------- */
const BATCH_SYSTEM = `You label social-media posts for an event analyst. Each line is: number|platform|@author|sentiment|text.
Return ONLY JSON, one entry for EVERY post number given, none skipped:
{"notes":[{"n":12,"l":"2-4 word topic label","t":"m|c|i","c":"claim","s":"shift"}]}
- l: reuse the SAME label for the same topic (aim for 5-10 labels in total).
- t: m = outlet/agency/think tank/official account; c = channel/page/blog; i = personal account.
- c: ONLY if the post asserts a checkable fact (attendance, deal, incident, figure); otherwise omit the key.
- s: ONLY if the post states a before/after ("earlier -> later"); otherwise omit the key.
Use only what the post says; never invent.`;

const buildBatchUserContext = (posts) =>
  `Posts:\n${posts.map((s) => `${s.n}|${s.platform}|@${s.author}|${s.sentiment}|${String(s.text).slice(0, 180)}`).join('\n')}`;

/** Reads one batch reply. Returns { [n]: {gist, narrative, type, claim, shift} } (only for valid post numbers), or null if unusable. */
const parseBatchNotes = (raw, validNumbers) => {
  let obj;
  try { obj = extractJson(raw); } catch (e) { return null; }
  const list = Array.isArray(obj.notes) ? obj.notes : Array.isArray(obj) ? obj : [];
  const out = {};
  list.forEach((n) => {
    const num = Number(n.n);
    if (!validNumbers.has(num)) return;
    const t0 = String(n.t ?? n.type ?? '').toLowerCase();
    const type = { m: 'media', c: 'creator', i: 'individual' }[t0] || t0;
    const one = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    out[num] = {
      gist: one(n.g ?? n.gist, 140),
      narrative: one(n.l ?? n.narrative, 40),
      type: ['media', 'creator', 'individual'].includes(type) ? type : '',
      claim: one(n.c ?? n.claim, 160),
      shift: one(n.s ?? n.shift, 200),
    };
  });
  return Object.keys(out).length ? out : null;
};

/* ------------------------------------- 3c. BIG EVENTS: FINAL CALL (writes the report from the notes) ------- */
const REDUCER_CONTRACT = `You now receive statistics plus notes on ALL analysed posts grouped by topic label (TOPIC CLUSTERS), and lists of CLAIMS, SHIFTS and HASHTAGS. Write the report from them.
OUTPUT: ONE JSON object only (no text around it, no code fences) with exactly these fields:
{
 "bottom_line": "2-3 sentences: core situation, tone breakdown, what needs attention",
 "key_findings": [{"headline": "short headline", "detail": "1-2 sentences with exact figures"}],   // 4-6
 "situation": "paragraph: event background, posts analysed, date range, platforms",
 "sentiment_commentary": "paragraph: praise / news / criticism toward government, police, leaders, organisations, citing example posts [Post #n]",
 "narratives": [{"title": "3-7 words", "clusters": ["C1", "C4"], "discussed": "2-3 sentences: theme, kind of discussion (analysis, news, rumour, opinion, satire, notice), example posts [Post #n]", "tone": "1-2 sentences using the sentiment mix of its clusters", "risk": "1-2 sentences or 'No risk signal.'"}],   // 3-7; EVERY cluster id in TOPIC CLUSTERS (C1, C2, ...) must appear in exactly ONE narrative's clusters (none left out); merge clusters about the same theme
 "public_order": "paragraph: threat evaluation; separate peaceful criticism from threat indicators",
 "platforms_commentary": "paragraph: platform distribution and key voices",
 "recommended_actions": [{"action": "short imperative", "detail": "1-2 sentences", "posts": [5]}],   // 3-6
 "claims": [{"claim": "short", "posts": [5], "triage": "VERIFY or MONITOR", "note": "verification path or reason to monitor"}],   // 0-8, chosen from CLAIMS, post numbers as given
 "changes": [{"from": "earlier state", "to": "later state", "post": 8}],   // 0-6, from SHIFTS only
 "emerging_keywords": [{"term": "#tag or phrase from HASHTAGS or the notes", "why": "short reason"}]   // 5-12
}
Cite only post numbers that appear in the notes. Finish every field; shorten paragraphs rather than dropping fields.`;

const buildReducerSystemPrompt = (ctx) => `${RULES}\n\nEVENT: "${ctx.event.name}"\n\n${REDUCER_CONTRACT}`;

/** Statistics + batch-note digest. */
const buildReducerUserContext = (ctx, digest) => {
  const stats = buildUserContext({ ...ctx, indexedSnippets: [] }).split('\n\nEVIDENCE')[0];
  const clusters = digest.clusters.map((c, i) =>
    `C${i + 1} "${c.label}": ${c.posts.length} posts; praise ${c.sentiment.positive}/news ${c.sentiment.neutral}/crit ${c.sentiment.negative}; platforms ${Object.entries(c.platforms).map(([k, v]) => `${k} ${v}`).join(', ')}; examples: ${c.examples.map((e) => `[Post #${e.n}] ${e.gist}`).join(' | ')}`).join('\n');
  return `${stats}

TOPIC CLUSTERS:
${clusters}

CLAIMS:
${digest.claims.length ? digest.claims.map((c) => `- [Post #${c.n}] ${c.claim}`).join('\n') : '(none)'}

SHIFTS:
${digest.shifts.length ? digest.shifts.map((c) => `- [Post #${c.n}] ${c.shift}`).join('\n') : '(none)'}

HASHTAGS: ${digest.hashtags.length ? digest.hashtags.map((h) => `${h.tag}(${h.count})`).join(' ') : '(none)'}`.trim();
};

/* ------------------------------------------------ 3d. TOKEN ESTIMATE (script-aware) + BATCH HELPERS ------- */
// Measured on this model (Qwen3): English ~4 chars/token, Hindi ~1 char/token, Odia ~0.5 chars/token (2 tokens per character).
// Estimates lean high so a prompt never overflows the context window. Indic text is what makes long prompts explode.
const estimateTokens = (text) => {
  let t = 0;
  for (const ch of String(text || '')) {
    const c = ch.codePointAt(0);
    if (c < 0x80) t += 0.3;                       // Latin, digits, punctuation
    else if (c >= 0x0900 && c <= 0x097F) t += 1.15; // Devanagari
    else if (c >= 0x0B00 && c <= 0x0B7F) t += 2.4; // Odia
    else if (c >= 0x0980 && c <= 0x0DFF) t += 2.4; // other Indic scripts (Bengali, Telugu, Kannada...)
    else if (c > 0xFFFF) t += 2;                   // emoji etc.
    else t += 1.3;
  }
  return Math.ceil(t);
};

/** Cut text so its estimated token cost is at most maxTokens (never splits a surrogate pair). */
const truncateToTokens = (text, maxTokens) => {
  const chars = Array.from(String(text || ''));
  let t = 0;
  let out = '';
  for (const ch of chars) {
    const cost = estimateTokens(ch);
    if (t + cost > maxTokens) break;
    t += cost;
    out += ch;
  }
  return out;
};

/** Split numbered posts into batches by TOKEN budget (input) and by post count (output notes are ~45 tokens each). */
const makeBatches = (posts, { inputTokens = 3600, maxPosts = 30, perPostTextTokens = 110 } = {}) => {
  const batches = [];
  let cur = [];
  let used = 0;
  posts.forEach((s) => {
    const text = truncateToTokens(s.text, perPostTextTokens);
    const cost = estimateTokens(`${s.n}|${s.platform}|@${s.author}|${s.sentiment}|`) + estimateTokens(text) + 4;
    if (cur.length && (used + cost > inputTokens || cur.length >= maxPosts)) { batches.push(cur); cur = []; used = 0; }
    cur.push({ ...s, text });
    used += cost;
  });
  if (cur.length) batches.push(cur);
  return batches;
};

/** Turn the final-call JSON (which names topic labels) into the standard report shape, using the batch notes. */
const reducerToReport = (raw, digest, notesMap, analysed) => {
  let obj;
  try { obj = extractJson(raw); } catch (e) { return null; }
  const byLabel = new Map(digest.clusters.map((c) => [c.label.toLowerCase().trim(), c]));
  digest.clusters.forEach((c, i) => byLabel.set(`c${i + 1}`, c));   // cluster ids C1, C2, ... as well as label text
  const used = new Set();
  const narratives = (Array.isArray(obj.narratives) ? obj.narratives : []).slice(0, 7).map((n) => {
    const posts = [];
    [...(Array.isArray(n.clusters) ? n.clusters : []), ...(Array.isArray(n.labels) ? n.labels : [])].forEach((l) => {
      const c = byLabel.get(String(l).toLowerCase().trim());
      if (c && !used.has(c.label)) { used.add(c.label); posts.push(...c.posts); }
    });
    return { ...n, posts };
  });
  const left = digest.clusters.filter((c) => !used.has(c.label));
  if (left.length && narratives.length) {
    const words = (t) => new Set(String(t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
    const nWords = narratives.map((n) => words(`${n.title} ${(n.labels || []).join(' ')} ${n.discussed || ''}`));
    const otherPosts = [];
    const otherLabels = [];
    left.forEach((c) => {
      const cw = words(c.label);
      let best = -1;
      let bestScore = 0;
      nWords.forEach((nw, i) => { let sc = 0; cw.forEach((w) => { if (nw.has(w)) sc += 1; }); if (sc > bestScore) { bestScore = sc; best = i; } });
      if (best >= 0) narratives[best].posts.push(...c.posts);
      else { otherPosts.push(...c.posts); otherLabels.push(c.label); }
    });
    if (otherPosts.length) {
      if (narratives.length < 7) narratives.push({ title: 'Other topics', discussed: `Smaller topic groups: ${otherLabels.slice(0, 8).join('; ')}.`, tone: '', risk: 'No risk signal.', posts: otherPosts });
      else narratives[narratives.length - 1].posts.push(...otherPosts);
    }
  }
  const sourceTypes = {};
  Object.entries(notesMap || {}).forEach(([n, note]) => { if (note.type) sourceTypes[n] = note.type; });
  const emerging = (Array.isArray(obj.emerging_keywords) ? obj.emerging_keywords : []).map((k) => {
    const term = String(k.term || '').trim();
    const needle = term.toLowerCase();
    const posts = needle ? analysed.filter((s) => String(s.text || '').toLowerCase().includes(needle)).slice(0, 6).map((s) => Number((String(s.citationTag).match(/\d+/) || [])[0])) : [];
    return { term, posts, why: k.why };
  });
  return parseLLMReport({ ...obj, narratives, source_types: sourceTypes, emerging_keywords: emerging }, analysed);
};

const RETRY_MESSAGE = 'Not valid JSON. Reply again with ONLY the complete JSON object described in OUTPUT: no text around it, no code fences.';

/* ------------------------------------------------------------ 4. READ + VALIDATE THE ANSWER -------------- */
const extractJson = (raw) => {
  let t = String(raw || '').replace(/<(?:think|redacted_thinking)>[\s\S]*?<\/(?:think|redacted_thinking)>/gi, '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // The model may answer with an object {...} or a bare array [...]; cut from the first bracket to its matching last one.
  const start = t.search(/[[{]/);
  if (start === -1) throw new Error('no JSON in model output');
  const close = t[start] === '[' ? t.lastIndexOf(']') : t.lastIndexOf('}');
  if (close <= start) throw new Error('unterminated JSON in model output');
  return JSON.parse(t.slice(start, close + 1));
};

const postNumber = (e) => Number((String(e.citationTag || '').match(/\d+/) || [])[0]);

/** Returns the validated report, or null if the reply is unusable. Post numbers not in the evidence are dropped. */
const parseLLMReport = (raw, evidence) => {
  let obj;
  try {
    obj = raw && typeof raw === 'object' ? raw : extractJson(raw);
  } catch (err) {
    return null;
  }
  const valid = new Set((evidence || []).map(postNumber).filter(Boolean));
  const ids = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(Number).filter((n) => valid.has(n)))];
  const str = (v, max = 600) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const para = (v) => String(v || '').replace(/[ \t]+/g, ' ').trim().slice(0, 2500);

  const narratives = (Array.isArray(obj.narratives) ? obj.narratives : []).slice(0, 7).map((n) => {
    const posts = ids(n.posts);
    return { title: str(n.title, 80), discussed: str(n.discussed, 700), tone: str(n.tone, 300), risk: str(n.risk, 300), posts };
  }).filter((n) => n.title && n.posts.length);
  narratives.forEach((n, i) => { n.code = String.fromCharCode(65 + i); });

  const keyFindings = (Array.isArray(obj.key_findings) ? obj.key_findings : []).slice(0, 6)
    .map((k) => ({ headline: str(k.headline, 160), detail: str(k.detail, 400) })).filter((k) => k.headline);
  const actions = (Array.isArray(obj.recommended_actions) ? obj.recommended_actions : []).slice(0, 6)
    .map((a) => ({ action: str(a.action, 120), detail: str(a.detail, 400), posts: ids(a.posts) })).filter((a) => a.action);
  const claims = (Array.isArray(obj.claims) ? obj.claims : []).slice(0, 8).map((c) => ({
    claim: str(c.claim, 200), posts: ids(c.posts), triage: String(c.triage).toUpperCase() === 'MONITOR' ? 'MONITOR' : 'VERIFY', note: str(c.note, 300),
  })).filter((c) => c.claim && c.posts.length);
  const changes = (Array.isArray(obj.changes) ? obj.changes : []).slice(0, 6).map((c) => ({
    from: str(c.from, 200), to: str(c.to, 200), post: valid.has(Number(c.post)) ? Number(c.post) : null,
  })).filter((c) => c.from && c.to && c.post);
  const emerging = (Array.isArray(obj.emerging_keywords) ? obj.emerging_keywords : []).slice(0, 12).map((k) => ({
    term: str(k.term, 80), posts: ids(k.posts), why: str(k.why, 200),
  })).filter((c) => c.term && c.posts.length);
  const sourceTypes = {};
  Object.entries(obj.source_types || {}).forEach(([k, v]) => {
    if (valid.has(Number(k)) && ['media', 'creator', 'individual'].includes(String(v))) sourceTypes[Number(k)] = String(v);
  });
  const postNarrative = {};
  narratives.forEach((n) => n.posts.forEach((p) => { if (!postNarrative[p]) postNarrative[p] = n.code; }));

  const report = {
    bottomLine: para(obj.bottom_line),
    keyFindings,
    situation: para(obj.situation),
    sentimentCommentary: para(obj.sentiment_commentary),
    narratives,
    publicOrder: para(obj.public_order),
    platformsCommentary: para(obj.platforms_commentary),
    actions,
    claims,
    changes,
    emerging,
    sourceTypes,
    postNarrative,
  };
  // Unusable if the model returned neither a briefing nor any narrative.
  if (!report.situation && !report.narratives.length) return null;
  return report;
};

/** Six-section markdown built from the JSON (Copy button and older screens). Headings are fixed structure only. */
const reportToMarkdown = (r, eventName) => {
  const cites = (arr) => (arr && arr.length ? ` ${arr.map((n) => `[Post #${n}]`).join('')}` : '');
  const narr = r.narratives.map((n) => `- **${n.title}:** ${n.discussed}`).join('\n');
  const acts = r.actions.map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}${cites(a.posts)}`).join('\n');
  return [
    `# 📋 Event Summary: ${eventName}`,
    `### 📌 1. Situation & Event Scope\n${r.situation}`,
    `### 🌐 2. Social Commentary & Target Sentiment\n${r.sentimentCommentary}`,
    `### 📢 3. Key Narratives & Public Claims\n${narr}`,
    `### ⚠️ 4. Public Order & Threat Assessment (Separated from Criticism)\n${r.publicOrder}`,
    `### 👥 5. Active Platforms & Distribution Channels\n${r.platformsCommentary}`,
    `### 🎯 6. Recommended Operational Actions for Authorities\n${acts}`,
  ].join('\n\n');
};

module.exports = {
  buildSystemPrompt, buildUserContext, RETRY_MESSAGE, parseLLMReport, reportToMarkdown,
  BATCH_SYSTEM, buildBatchUserContext, parseBatchNotes, buildReducerSystemPrompt, buildReducerUserContext,
  estimateTokens, truncateToTokens, makeBatches, reducerToReport,
};
