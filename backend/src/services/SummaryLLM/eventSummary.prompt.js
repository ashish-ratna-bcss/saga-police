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
 * To change what the report says, edit rulesFor() or OUTPUT_CONTRACT below. Nothing else needs to change,
 * as long as the JSON field names stay the same (the UI and the PDF read those names).
 */

/* ------------------------------------------------------------------ 1. RULES ------------------------------ */
// Who the brief is for and which units can act come from the force profile (headquarters); these are the defaults.
const DEFAULT_UNITS = ['District Police / SHO', 'Traffic Police', 'Cyber Cell', 'PRO / Fact-Check Cell'];
const audienceOf = (ctx) => (ctx && ctx.headquarters && ctx.headquarters.head
  ? `the ${ctx.headquarters.head}, ${ctx.headquarters.force}, and senior leadership`
  : 'senior police leadership');
const unitsOf = (ctx) => ((ctx && ctx.headquarters && ctx.headquarters.units && ctx.headquarters.units.length) ? ctx.headquarters.units : DEFAULT_UNITS).join(', ');
const rulesFor = (ctx) => `You are a senior Police Cyber Intelligence & OSINT Analyst writing an evidence-grounded Intelligence Brief for ${audienceOf(ctx)}.

RULES:
1. Grounding: Use ONLY the provided statistics and evidence posts. Never invent people, events, dates, numbers, or sources. Quote statistics exactly; never recalculate.
2. Sentiment & Risk: Use ONLY Positive / Neutral / Negative (map Praise→Positive, News/Updates→Neutral, Criticism→Negative). Never use the word "Unknown" as a tone. Criticism is NOT a threat unless explicitly calling for violence, strikes, blockades, or unrest. Keep sentiment and risk distinct.
3. Citations: Cite evidence as [Post #n] using ONLY numbers present in the evidence list.
4. Voice: write the way a careful officer briefs a senior authority in person. Short, direct sentences in plain words. Say what happened first, then what it means. Examples of the voice: "Most posts are neutral." "Several accounts are calling for a bandh on 8 October." "Activity is mainly in Bhubaneswar." "The posts do not show any violence." Do NOT open sentences with "The analysis indicates", "The data suggests", "It is observed", "It appears that", "There appears to be", "discourse landscape", "digital ecosystem", "in conclusion". No stacked hedges ("may potentially indicate"). One idea per sentence, at most about 25 words.
4a. Separate what is known from what is not: say plainly what is CONFIRMED by the posts, what is only CLAIMED by an account, what is your ASSESSMENT, and what is NOT KNOWN. If the posts do not say something (who organised it, how many people, whether there was violence), say "The posts do not say" instead of guessing. A news outlet reporting that someone else called a bandh is a report, not a call by the outlet.
4b. The CONFIRMED FACTS list in the input (dates, organisers, places) is computed from the posts. Use those dates, organisers and places exactly. Never use the date a post was published as the date of an event.
5. Never say something is absent when its count is above 0 (praise 7 means "7 praise posts", not "no praise"); if a count is 0, say none were recorded. The statistics are the truth even if a post's wording seems to disagree.
6. Describe non-English posts in English. Do not copy long phrases from posts; give the meaning. Do not repeat the same sentence shape in a row.
7. This brief is for ${audienceOf(ctx)}. Answer, from the posts only: what activity is being organised; where people or representatives were present; which specific places are named; how the volume and tone sit; which accounts carry the criticism; which named leaders or representatives appear; and which accounts amplify it.
8. Places: name a place only if a post names it. Say where an activity happens, and keep that apart from places that are only mentioned in talk. A place in another state or country is "outside the event region": mention it once, do not treat it as activity in the event region. Never invent a place.
9. Public order: a bandh, blockade, highway block, gherao, rally, or protest named in a post is a fact. Do not write that there is no unrest or no blockade when the evidence says otherwise. Keep peaceful criticism separate from those calls.
10. Leave out anything the posts do not support.
11. Recommended Actions: 4-6 core actions a police unit can carry out today (a second step adds further measures). Each action names, in this order: WHO acts (a unit, e.g. ${unitsOf(ctx)}), WHAT exactly they do, WHERE or on WHICH account, hashtag or claim, WHY (the fact from the posts that justifies it), and the TRIGGER that would require escalation ("Escalate if ..."). Never write "monitor the situation", "verify claims" or "monitor social media" alone. Do not add the same advice twice. Cite [Post #n].
11a. Do not repeat the same conclusion in several sections. State a fact once where it belongs; other sections may point to it in a few words. The bottom line is 2-3 sentences: what is happening, where, who is behind it, how serious it is, and the one thing to do.
11b. Tone is not risk. Negative or critical posts are criticism. Risk comes only from calls to act (bandh, blockade, rally), violence or damage, or threats. Never describe negative tone as "critical" or as a threat. A high-risk post does not make its author a priority account.
11c. Name only the platforms listed in the statistics; never mention a platform that has no posts. Describe tone with the exact Positive / Neutral / Negative counts: if most posts are neutral, say so, and do not call the discussion "mostly critical" unless negative posts are more than half. Do not write sentences like "Posts [Post #1] and [Post #2] mention this"; write the point once and put the citations at the end of the sentence.
11d. For every claim you list, say what the posts show for it and what is not established (for example "Posts 4 and 9 say it; no post confirms it").
13. What the issue is: if the posts carry several stories that overlap (for example a state-wide bandh, a student demand and a national movement), list each as a separate strand: who the posts say is behind it, what they ask for or do, and where it stands now. Say plainly which strand is not organised in the event region and only matters if it spills into it. One strand only: leave the list empty. "known" holds only what the posts confirm; "not_known" holds open questions the posts cannot answer (who is organising, how many people, whether anything happened on the ground). Never fill a gap with a guess.
12. Relevance & Storylines: Leave out posts that are not about the event. If the posts mix different stories, keep them apart and say which one each fact belongs to; say whether people were on the ground or only posting about it.`;

/* ---------------------------------------------------------------- 2. OUTPUT CONTRACT ---------------------- */
const OUTPUT_CONTRACT = `OUTPUT: ONE JSON object only (no conversational text, no markdown code fences) with exactly these fields:
{
 "threat_level": "Low / Low to medium / Medium / High / Critical",
 "threat_desc": "1-2 sentences: threat rating rationale, high/medium risk post count, violence call check",
 "bottom_line": "2-3 sentences: core situation, tone breakdown, and priority items requiring attention",
 "key_dates": [{"date": "exact date or timing (e.g., '30 Sept (past)' or '8 Oct (upcoming)')", "type": "past or upcoming", "event": "concise description of bandh, rally, or event", "posts": [1]}],
 "narratives_to_watch": [{"narrative": "viral rumor, claim, or sensitive angle to monitor/debunk", "source_accounts": "key accounts or platforms pushing this", "risk_note": "operational risk or recommended counter-action", "posts": [1]}],
 "key_findings": [{"headline": "short concise headline", "detail": "1-2 sentences with exact figures"}],
 "situation": "paragraph: event background, scope of posts analyzed, date range, active platforms",
 "issue_strands": [{"title": "3-6 words", "who": "group or person the posts name as behind it", "demand": "what they ask for or do, as the posts say", "status": "where it stands now, e.g. under way today / planned for a date / small protests", "posts": [1]}],   // 0-4 separate stories that overlap in these posts; empty if there is one story
 "issue_link": "one sentence on what connects the strands, or empty",
 "known": [{"text": "one fact the posts confirm", "posts": [1]}],   // 3-5
 "not_known": ["one open question the posts do not answer"],   // 2-4
 "sentiment_commentary": "paragraph: praise/news/criticism toward government, police, leaders, orgs with [Post #n] citations",
 "narratives": [{"title": "3-7 words", "discussed": "2-3 sentences: theme, kind of discussion (analysis, news, rumour, opinion, satire, notice), [Post #n] citations", "tone": "1-2 sentences on sentiment mix, using the posts' labels", "risk": "1-2 sentences or 'No risk signal.'", "posts": [1, 2]}],   // 3-7; EVERY evidence post in exactly ONE narrative
 "public_order": "paragraph: threat evaluation, agitation/protest indicators (strictly separate peaceful criticism from threats)",
 "platforms_commentary": "paragraph: platform distribution and key amplifying voices",
 "recommended_actions": [{"action": "Tactical Action & Lead Unit (e.g., 'Ground Bandobast at [Specific Location] — [Lead Unit]', 'Fact-Check & Rebuttal on [Claim] — [Lead Unit]', 'Digital Surveillance of [Hashtag/Handle] — [Lead Unit]')", "detail": "2-3 sentences: what exactly the unit does, where or on which account/hashtag/claim, why (the fact), and one sentence starting 'Escalate if' that names the trigger", "posts": [1]}],
 "claims": [{"claim": "short factual claim", "posts": [1], "triage": "VERIFY or MONITOR", "note": "what the posts show for it and what is not established, then how to verify"}],
 "changes": [{"from": "earlier state", "to": "later state", "post": 1}],
 "emerging_keywords": [{"term": "#tag or phrase", "posts": [1], "why": "short reason"}],
 "activities": [{"what": "campaign, meeting, protest, bandh, rally, or programme named in posts", "where": "specific place in the post, or empty", "when": "date in the post, or empty", "posts": [1]}],
 "presence": [{"who": "account or person the post says was present", "place": "specific place in the post", "posts": [1]}],
 "geography": [{"place": "specific place, not only the state", "note": "what the posts say happened there", "posts": [1]}],
 "leaders": [{"name": "person named in a post", "role": "how the post describes them", "posts": [1]}],
 "amplifiers": [{"account": "page or handle", "why": "how they amplify", "posts": [1]}],
 "high_monitoring_profiles": [{"platform": "x / youtube / facebook / telegram / reddit", "account": "channel or handle name", "priority": "High Watch or Active Monitor", "why_monitor": "concrete surveillance rationale: reach, critical narrative, repeat broadcast, or mobilization role", "posts": [1]}],
 "source_types": {"1": "media", "2": "creator", "3": "individual"}   // EVERY post number; media = outlet/agency/think tank/official, creator = channel/page/blog, individual = personal account
}
claims: 0-8 factual assertions (not opinions). VERIFY = checkable against an official source; MONITOR = theme to watch. changes: only if a post itself states a before/after. Finish every field; shorten paragraphs rather than dropping fields. Output valid complete JSON.`;

const languageLine = (ctx) => (ctx.reportLanguage && !/^english$/i.test(ctx.reportLanguage)
  ? `LANGUAGE: Write every sentence of the report in ${ctx.reportLanguage}, in the same plain voice. Keep names, hashtags, handles and [Post #n] tags exactly as they are. JSON field names stay in English.`
  : '');

const buildSystemPrompt = (ctx) => `${rulesFor(ctx)}\n\n${languageLine(ctx)}\n\n${ctx.addresseeLine || ''}\n\nEVENT: "${ctx.event.name}"\n\n${OUTPUT_CONTRACT}`;

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

  return `${ctx.addresseeLine || ''}
EVENT: ${event.name || 'Event'} | Loc: ${event.location || 'General'} | Platforms: ${(event.platforms || []).join(',') || 'all'} | Keywords: ${(keywordsList || []).join(',') || 'general'}
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
 "issue_strands": [{"title": "3-6 words", "who": "group or person the notes name as behind it", "demand": "what they ask for or do", "status": "where it stands now", "posts": [5]}],   // 0-4 separate overlapping stories; empty if one story
 "issue_link": "one sentence on what connects the strands, or empty",
 "known": [{"text": "one fact the notes confirm", "posts": [5]}],   // 3-5
 "not_known": ["one open question the notes do not answer"],   // 2-4
 "sentiment_commentary": "paragraph: praise / news / criticism toward government, police, leaders, organisations, citing example posts [Post #n]",
 "narratives": [{"title": "3-7 words", "clusters": ["C1", "C4"], "discussed": "2-3 sentences: theme, kind of discussion (analysis, news, rumour, opinion, satire, notice), example posts [Post #n]", "tone": "1-2 sentences using the sentiment mix of its clusters", "risk": "1-2 sentences or 'No risk signal.'"}],   // 3-7; EVERY cluster id in TOPIC CLUSTERS (C1, C2, ...) must appear in exactly ONE narrative's clusters (none left out); merge clusters about the same theme
 "public_order": "paragraph: threat evaluation; separate peaceful criticism from threat indicators",
 "platforms_commentary": "paragraph: platform distribution and key voices",
 "recommended_actions": [{"action": "Tactical Action & Lead Unit (e.g., 'Ground Bandobast at [Specific Venue] — [Lead Unit]', 'Fact-Check on [Claim] — [Lead Unit]', 'Digital Surveillance — [Lead Unit]')", "detail": "2-3 concrete operational sentences naming exact locations, handles, hashtags, or claims from the notes with tactical steps", "posts": [5]}],   // 3-6
 "claims": [{"claim": "short", "posts": [5], "triage": "VERIFY or MONITOR", "note": "verification path or reason to monitor"}],   // 0-8, chosen from CLAIMS, post numbers as given
 "changes": [{"from": "earlier state", "to": "later state", "post": 8}],   // 0-6, from SHIFTS only
 "emerging_keywords": [{"term": "#tag or phrase from HASHTAGS or the notes", "why": "short reason"}],
 "activities": [{"what": "campaign, meeting, protest, bandh, rally, or programme", "where": "specific place or empty", "when": "date or empty", "posts": [5]}],
 "presence": [{"who": "who the note says was present", "place": "specific place", "posts": [5]}],
 "geography": [{"place": "specific place from the notes, not only the state", "note": "what happened there", "posts": [5]}],
 "leaders": [{"name": "person named in the notes", "role": "how they are described", "posts": [5]}],
 "amplifiers": [{"account": "page or handle", "why": "how they amplify", "posts": [5]}]
}
Cite only post numbers that appear in the notes. Finish every field; shorten paragraphs rather than dropping fields.`;

const buildReducerSystemPrompt = (ctx) => `${rulesFor(ctx)}\n\n${languageLine(ctx)}\n\n${ctx.addresseeLine || ''}\n\nEVENT: "${ctx.event.name}"\n\n${REDUCER_CONTRACT}`;

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
  const actions = (Array.isArray(obj.recommended_actions) ? obj.recommended_actions : []).slice(0, 10)
    .map((a) => ({ action: str(a.action, 200), detail: str(a.detail, 800), posts: ids(a.posts) })).filter((a) => a.action);
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

  const briefRows = (arr, map) => (Array.isArray(arr) ? arr : []).slice(0, 8).map(map).filter(Boolean);
  const activities = briefRows(obj.activities, (a) => {
    const posts = ids(a.posts);
    const what = str(a.what, 180);
    if (!what) return null;
    return { what, where: str(a.where, 120), when: str(a.when, 80), posts };
  });
  const presence = briefRows(obj.presence, (a) => {
    const posts = ids(a.posts);
    const who = str(a.who, 120);
    if (!who) return null;
    return { who, place: str(a.place, 120), posts };
  });
  const geography = briefRows(obj.geography, (a) => {
    const posts = ids(a.posts);
    const place = str(a.place, 120);
    if (!place || !posts.length) return null;
    return { place, note: str(a.note, 240), posts };
  });
  const leaders = briefRows(obj.leaders, (a) => {
    const posts = ids(a.posts);
    const name = str(a.name, 120);
    if (!name) return null;
    return { name, role: str(a.role, 160), posts };
  });
  const amplifiers = briefRows(obj.amplifiers, (a) => {
    const posts = ids(a.posts);
    const account = str(a.account, 80);
    if (!account) return null;
    return { account, why: str(a.why, 200), posts };
  });

  const keyDates = briefRows(obj.key_dates, (k) => {
    const posts = ids(k.posts);
    const date = str(k.date, 80);
    const event = str(k.event || k.what, 300);
    if (!date && !event) return null;
    return { date, type: str(k.type, 20), event, posts };
  });

  const narrativesToWatch = briefRows(obj.narratives_to_watch, (n) => {
    const posts = ids(n.posts);
    const narrative = str(n.narrative, 220);
    if (!narrative) return null;
    return {
      narrative,
      sourceAccounts: str(n.source_accounts || n.sourceAccounts, 160),
      riskNote: str(n.risk_note || n.riskNote, 320),
      posts,
    };
  });

  const highMonitoringProfiles = briefRows(obj.high_monitoring_profiles, (p) => {
    const posts = ids(p.posts);
    const account = str(p.account, 80);
    if (!account) return null;
    return {
      platform: str(p.platform, 30),
      account,
      priority: str(p.priority, 40) || 'High Watch',
      whyMonitor: str(p.why_monitor || p.whyMonitor || p.why, 280),
      posts,
    };
  });

  const issueStrands = briefRows(obj.issue_strands, (x) => {
    const title = str(x.title, 80);
    if (!title) return null;
    return { title, who: str(x.who, 160), demand: str(x.demand, 300), status: str(x.status, 160), posts: ids(x.posts) };
  }).slice(0, 4);
  const known = briefRows(obj.known, (x) => {
    const text = str(typeof x === 'string' ? x : x?.text, 260);
    if (!text) return null;
    return { text, posts: ids(x?.posts) };
  }).slice(0, 6);
  const notKnown = (Array.isArray(obj.not_known) ? obj.not_known : []).slice(0, 5)
    .map((x) => str(typeof x === 'string' ? x : x?.text, 220)).filter(Boolean);

  const report = {
    threatLevel: str(obj.threat_level, 80),
    threatDesc: str(obj.threat_desc, 300),
    bottomLine: para(obj.bottom_line),
    issueStrands,
    issueLink: str(obj.issue_link, 300),
    known,
    notKnown,
    keyDates,
    narrativesToWatch,
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
    activities,
    presence,
    geography,
    leaders,
    amplifiers,
    highMonitoringProfiles,
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

/* ----------------------------------------------- MORE RECOMMENDED ACTIONS (second, small call) ------------------- */
const ACTION_THEMES = `Cover each of these where the facts give a reason, one action per theme, and skip a theme when nothing supports it:
 a) Ground deployment: for each planned or reported activity INSIDE the event region, name the date, the place and the unit.
 b) Traffic, essential services and public transport on the days named.
 c) Liaison with the organisers or local leaders named (who to contact, to agree route, timing and peaceful conduct).
 d) Legal and permissions: permission status, notices, prohibitory orders, records to keep, only where the facts show a need.
 e) Cyber / OSINT: the named accounts, hashtags and claims to track, and what to capture as evidence.
 f) Fact-check and public messaging: the named claim or rumour, who answers it, through which channel.
 g) Intelligence sharing with neighbouring districts or other units about activity elsewhere that may reach the region.
 h) Contingency: reserve force, quick-reaction team and escalation steps, each tied to a trigger.
 i) Review after the event: what to collect and report back.`;

const buildActionsSystem = (ctx) => `You advise ${audienceOf(ctx)} on what to do next. Using ONLY the facts given, write 6 to 10 recommended actions.
${ACTION_THEMES}
Each action has: WHO acts (choose from: ${unitsOf(ctx)}), WHAT exactly they do, WHERE or on WHICH account, hashtag or claim, WHY (the fact that justifies it), and one sentence that starts "Escalate if" and names the trigger.
Rules: use only dates, places, accounts, organisers and claims that appear in the facts; never invent any. Some actions are ALREADY LISTED: write actions ONLY for themes they do not already cover, and at most ONE action per theme. If a theme is already covered, skip it. No generic advice such as "monitor the situation". Plain, direct sentences. Cite the post numbers given with the facts, as numbers in "posts".
Return ONLY JSON on one line: {"actions":[{"theme":"b","action":"Short title — Lead unit","detail":"2-3 sentences ending with the Escalate if sentence","posts":[12]}]} where theme is the letter a-i of the theme above.`;

const buildActionsContext = ({ report, facts, event, today, existing }) => {
  const L = [];
  L.push(`EVENT: ${event?.name || ''} | REGION: ${event?.location || ''} | TODAY: ${today}`);
  if (report?.bottomLine) L.push(`SITUATION: ${report.bottomLine}`);
  if (report?.publicOrder) L.push(`PUBLIC ORDER: ${report.publicOrder}`);
  const acts = (facts?.activities || []).filter((a) => !a.outside).slice(0, 8);
  if (acts.length) L.push('ACTIVITIES IN THE REGION:\n' + acts.map((a) => `- ${a.date} ${a.kind}${a.organiser ? ` called by ${a.organiser}` : ''}${a.place ? ` at ${a.place}` : ''} (posts ${a.posts.join(',')})`).join('\n'));
  const elsewhere = (facts?.activities || []).filter((a) => a.outside).slice(0, 4);
  if (elsewhere.length) L.push('ACTIVITY OUTSIDE THE REGION (context only):\n' + elsewhere.map((a) => `- ${a.date} ${a.kind}${a.place ? ` at ${a.place}` : ''}`).join('\n'));
  const places = (facts?.places || []).filter((p) => p.region && p.active).slice(0, 8);
  if (places.length) L.push('PLACES WHERE PEOPLE ARE REPORTED: ' + places.map((p) => `${p.name} (${p.region})`).join('; '));
  const people = (facts?.accounts || []).filter((a) => (a.calls || 0) > 0 || (a.violence || 0) > 0).slice(0, 8);
  if (people.length) L.push('ACCOUNTS THAT CALL FOR ACTION: ' + people.map((a) => `@${a.author} (${a.platform}, ${a.calls || 0} calls, posts ${a.posts.slice(0, 3).join(',')})`).join('; '));
  const claims = (report?.claims || []).slice(0, 5);
  if (claims.length) L.push('CLAIMS: ' + claims.map((c) => `${c.claim} [${c.triage}] (posts ${c.posts.join(',')})`).join('; '));
  if (report?.narrativesToWatch?.length) L.push('NARRATIVES TO WATCH: ' + report.narrativesToWatch.slice(0, 4).map((n) => `${n.narrative} (posts ${n.posts.join(',')})`).join('; '));
  if (facts) L.push(`COUNTS: ${facts.calls?.count || 0} posts call for action in the region, ${facts.violence?.count || 0} mention violence in the region, ${facts.callsOutside?.count || 0} call for action outside it.`);
  if (existing?.length) L.push('ALREADY LISTED (their themes are covered; do not repeat):\n' + existing.map((a) => `- ${a.action}: ${String(a.detail || '').slice(0, 140)}`).join('\n'));
  return L.join('\n');
};

/** Reads the extra actions: valid post numbers only, no empty rows. */
const parseMoreActions = (raw, validNumbers) => {
  let obj;
  try { obj = extractJson(raw); } catch (e) { return []; }
  const list = Array.isArray(obj?.actions) ? obj.actions : Array.isArray(obj) ? obj : [];
  const one = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return list.map((a) => ({
    theme: one(a.theme, 1).toLowerCase(),
    action: one(a.action, 200),
    detail: one(a.detail, 800),
    posts: (Array.isArray(a.posts) ? a.posts : []).map(Number).filter((n) => validNumbers.has(n)).slice(0, 8),
  })).filter((a) => a.action && a.detail.length > 30);
};

/** Core actions first, then new ones that are not near-copies of a listed one and that add a new theme; at most `cap`. */
const mergeActions = (core, extra, cap = 10) => {
  const words = (t) => new Set(String(t || '').toLowerCase().split(/[—–-]/)[0].split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
  const similar = (a, b) => {
    const A = words(a); const B = words(b);
    if (!A.size || !B.size) return false;
    let hit = 0; A.forEach((w) => { if (B.has(w)) hit += 1; });
    return hit / Math.min(A.size, B.size) >= 0.5;
  };
  const out = [...(core || [])];
  const themes = new Set();
  (extra || []).forEach((a) => {
    if (out.length >= cap || !a.action) return;
    if (out.some((x) => similar(x.action, a.action))) return;
    if (a.theme && themes.has(a.theme)) return;      // one action per theme
    if (a.theme) themes.add(a.theme);
    out.push(a);
  });
  return out;
};

/* ------------------------------------------------ CLOSING SUMMARY (plain words, last section) ------------------- */
const buildClosingSystem = (ctx) => `You are briefing ${audienceOf(ctx)} in person. Write the closing summary of this report in natural, plain language, as one person speaking to another.
${languageLine(ctx || {})}
Length: 6 to 9 short sentences in one or two paragraphs. No lists, no headings, no bullet points, no post numbers, no jargon.
Say, in this order: what is happening and where; who is behind it; how serious it is and the real reason for that level; what is planned next, with dates; what is not known yet; and the one or two most important things for the police to do.
${ctx && ctx.level ? `The risk level is "${ctx.level}". Say it with exactly that word, followed by the real reason from the facts. ` : ''}Say what the police SHOULD do; never say what the police are already doing, planning or monitoring. Put a date and a place together only as the facts do; an activity outside the region is not in the region.
Use at most three numbers. Use only the facts given; never invent a name, place, date or number. Do not start sentences with "The analysis indicates", "The data suggests" or similar. Do not call criticism a threat.
Return only the text of the summary.`;

/** The public order risk level, by the same rule as the report: violence, then calls to act or high-risk posts, else low. */
const closingLevel = ({ facts, stats }) => {
  const risk = stats?.risk_counts || stats?.risk || {};
  const highRisk = Number(risk.critical || 0) + Number(risk.high || 0);
  if (Number(facts?.violence?.count || 0) > 1) return 'High';
  return (Number(facts?.violence?.count || 0) > 0 || Number(facts?.calls?.count || 0) > 0 || highRisk > 0) ? 'Medium' : 'Low';
};

/** Checks a draft against the facts (English drafts): the right level, no invented police activity. Returns '' when fine, else the reason. */
const checkClosing = (text, level, reportLanguage) => {
  if (reportLanguage && !/^english$/i.test(reportLanguage)) return '';
  const t = String(text || '');
  if (!new RegExp(`\\b${level}\\b`, 'i').test(t)) return `it must state the risk level "${level}"`;
  if (level !== 'Low' && /\b(risk|seriousness|level|threat)\b[^.]{0,40}\blow\b|\blow[- ]risk\b/i.test(t)) return `it calls the risk low but the level is ${level}`;
  if (/\bpolice\b[^.]{0,50}\b(are|have|has|is)\b[^.]{0,40}\b(monitoring|planned|plans|prepared|deployed|already|will)\b/i.test(t) || /\b(police|authorities|administration)\b[^.]{0,30}\b(plan|plans|planned|intend|intends)\s+to\b/i.test(t) || /already recommended/i.test(t)) return 'it says what the police are already doing, which the facts do not say';
  return '';
};

const buildClosingContext = ({ report, facts, event, stats }) => {
  const risk = stats?.risk_counts || stats?.risk || {};
  const highRisk = Number(risk.critical || 0) + Number(risk.high || 0);
  const calls = Number(facts?.calls?.count || 0);
  const violence = Number(facts?.violence?.count || 0);
  const level = closingLevel({ facts, stats });
  const sent = stats?.sentiment_counts || {};
  const tot = Math.max(1, Number(sent.positive || 0) + Number(sent.neutral || 0) + Number(sent.negative || 0));
  const L = [];
  L.push(`EVENT: ${event?.name || ''} | REGION: ${event?.location || ''}`);
  L.push(`RISK LEVEL: ${level}. Posts calling for action in the region: ${calls}. Posts mentioning violence in the region: ${violence}. Posts rated high risk: ${highRisk}. Negative tone: ${Math.round((100 * Number(sent.negative || 0)) / tot)}% (criticism, not a threat).`);
  if (report?.bottomLine) L.push(`BOTTOM LINE: ${report.bottomLine}`);
  if (report?.situation) L.push(`SITUATION: ${report.situation}`);
  if (report?.publicOrder) L.push(`PUBLIC ORDER: ${report.publicOrder}`);
  const acts = (facts?.activities || []).filter((a) => !a.outside).slice(0, 6);
  if (acts.length) L.push('PLANNED OR REPORTED ACTIVITY IN THE REGION:\n' + acts.map((a) => `- ${a.date} ${a.kind}${a.organiser ? ` called by ${a.organiser}` : ''}${a.place ? ` at ${a.place}` : ''}`).join('\n'));
  const lead = (facts?.accounts || []).filter((a) => (a.calls || 0) > 0).slice(0, 4);
  if (lead.length) L.push('ACCOUNTS CALLING FOR ACTION: ' + lead.map((a) => `@${a.author}`).join(', '));
  if (report?.known?.length) L.push('KNOWN: ' + report.known.slice(0, 4).map((k) => (typeof k === 'string' ? k : k.text || k.fact || '')).filter(Boolean).join(' | '));
  if (report?.notKnown?.length) L.push('NOT KNOWN: ' + report.notKnown.slice(0, 4).map((k) => (typeof k === 'string' ? k : k.text || k.fact || '')).filter(Boolean).join(' | '));
  if (report?.actions?.length) L.push('ACTIONS ALREADY RECOMMENDED: ' + report.actions.slice(0, 6).map((a) => a.action).join(' | '));
  return L.join('\n');
};

/** Cleans the model's reply into plain paragraphs; returns '' when it is unusable. */
const parseClosing = (raw) => {
  let t = String(raw || '').replace(/```[a-z]*\n?|```/gi, '').trim();
  if (/^\s*[{[]/.test(t)) { try { const o = extractJson(t); t = String(o.summary || o.text || o.closing || ''); } catch (e) { return ''; } }
  t = t.replace(/\[Post #\d+\]/g, '').replace(/^["“]|["”]$/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^[-*•]\s+/gm, '').trim();
  if (t.length < 120 || t.length > 2200) return '';
  return t;
};

module.exports = {
  buildClosingSystem, buildClosingContext, parseClosing, closingLevel, checkClosing,
  buildActionsSystem, buildActionsContext, parseMoreActions, mergeActions,
  buildSystemPrompt, buildUserContext, RETRY_MESSAGE, parseLLMReport, reportToMarkdown,
  BATCH_SYSTEM, buildBatchUserContext, parseBatchNotes, buildReducerSystemPrompt, buildReducerUserContext,
  estimateTokens, truncateToTokens, makeBatches, reducerToReport, extractJson,
};
