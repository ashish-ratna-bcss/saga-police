/**
 * PROFILE BEHAVIOUR REPORT (Tools → Profile Report): what we ask the model and how we read its answer.
 *
 *   buildSystemPrompt()        the analyst's rules and the fixed JSON output contract
 *   buildUserContext(...)      the computed facts and the numbered evidence posts [P1]..[Pn]
 *   parseBehaviorReport(...)   reads and checks the reply: unknown fields dropped, labels normalised,
 *                              citations to posts that were not given are removed
 *   fallbackReport(...)        a report written from the facts alone, when the model cannot be used
 *   reportToMarkdown(...)      plain text for Copy
 *
 * Numbers and the attention level are decided in code (behaviorFacts.js). The model writes the reading of them.
 */
const { extractJson } = require('../../../services/SummaryLLM/eventSummary.prompt');

const ACCOUNT_TYPES = ['Individual', 'News or media', 'Political or party account', 'Government or official', 'Organisation or group', 'Community or fan page', 'Unclear'];
const EVIDENCE_LEVELS = ['Observed', 'Likely', 'Unclear'];
const SHARES = ['Main', 'Frequent', 'Occasional'];
const ATTITUDES = ['Supportive', 'Critical', 'Hostile', 'Neutral', 'Mixed'];
const SEVERITIES = ['High', 'Medium', 'Low'];
const LEVELS = ['High', 'Medium', 'Low'];

const RULES = `You are a senior police OSINT analyst. You write a short, evidence-based behaviour profile of ONE subject (a person or organisation, on one or more social media accounts) from the posts those accounts published. The reader is an officer who must decide, quickly and fairly, whether this account needs closer watching.

RULES
1. Evidence only. Use ONLY the FACTS block and the numbered posts. Never invent people, events, places, dates, numbers, links or motives. If the posts do not show something, leave it out.
2. Numbers come from FACTS. Quote them exactly; never calculate new totals or percentages.
3. Cite. Every trait, theme, target, risk indicator and change lists the post numbers that show it in its "posts" array (numbers from the evidence list only). In free text you may write [P3].
4. Describe behaviour, not the person's mind. Write what the account does ("posts mostly about...", "repeatedly criticises..."). Do not guess private life, health, mental state, income, or hidden intentions.
5. Protected traits. Never infer or label religion, caste, ethnicity, gender identity, sexual orientation or health. Mention a community only when a post itself targets or names it, and then report what the post says.
6. Politics. Report stated positions on named issues, parties, leaders or institutions ("criticises the state government over jobs"). Do not label the person as extremist, anti-national or similar.
7. Criticism is not a threat. Negative or angry posts about government, police or leaders are lawful criticism. A risk indicator needs an EXPLICIT signal in a post: a call to violence; a threat to a person or group; hate or incitement against a community; a call for a bandh, blockade, gherao or unlawful gathering; sharing someone's private details; or an unverified claim presented as fact that could cause panic or unrest. Name the post. If there is no such post, "risk_indicators" is an empty list.
8. Evidence strength for each trait: "Observed" = shown directly in 2 or more posts; "Likely" = shown in one post or only indirectly; "Unclear" = posts point both ways.
9. The ATTENTION LEVEL is given in FACTS and is final. Explain it in "attention_reason" with the risk counts and the posts behind it; do not raise or lower it.
10. Few posts. If FACTS show fewer than 10 posts read, or most posts are not analysed, say so in "limitations" and keep every judgement cautious.
11. Language. Write in plain English, short sentences, the way an analyst briefs a senior officer. Give the meaning of non-English posts in English; do not copy long passages. No filler, no moral judgement, no repeated points across sections.
12. Each fact appears once, in the section where it belongs.
13. Several accounts. A profile can combine accounts on different platforms that the user grouped as one person or organisation. Treat them as one subject, say which platform a pattern comes from, and use "platform_differences" for how the accounts differ. Do not claim the accounts are the same person beyond what the user grouped.
14. Images. "Image text" on a post is text read from its picture. It is part of what the account published: use it as evidence and cite the post.
15. Large histories. FACTS cover every collected post; the numbered posts are a selection chosen to show the highest-risk, most-engaged, most recent and a spread over time. Never imply the numbered posts are all the posts.
16. Traits versus themes. A trait is a habit of the account, taken from FACTS and from the form of the posts: how often and when it posts (bursts, long silences, evenings), what format it uses (picture quotes, memes, its own photos, text only), whether it writes captions, replies, tags or shares other people's posts, whether it calls on people to act. A theme is what the posts are ABOUT. Never describe the same point as both: a subject is a theme, never a trait, and a trait must say something about behaviour that no theme already says.
17. Plain wording. Say "Attention is Low", never the label in capitals. Do not say whether anything is legal or illegal, and do not name offences; describe what the posts say and do.
18. No filler. If the posts show no real change over time, leave "changes_over_time" empty. Leave any list empty rather than padding it, and never copy the wording of the examples in the output contract.
19. Shares. When FACTS say a platform does not publish share counts, a share figure of 0 for it means "not shown". Never write that the posts were not shared or reposted; describe reach by likes and comments.
20. Pictures. "Picture" on a post describes what its photo shows, and the PICTURES line in FACTS covers all posts, not only the numbered ones. Read each post as its caption, the text printed on its picture and what the picture shows, together: say when a picture adds to, contradicts or goes beyond the caption. Use pictures as evidence and cite the post, but say only what the descriptions say: never name a person in a photo and never guess a place or an affiliation from how someone looks. Do not describe pictures you were not given a description for. "Seen in the picture" lists what the picture description flagged (a weapon, a crowd, a flag or slogan with its words); a picture alone is not proof of intent: report what it shows and cite the post, and raise a risk indicator only when the picture and the caption together show a threat, an incitement or a call to action.
21. Region. When FACTS give a REGION, "regional_link" says whether the posts show any connection to it (place names, local language, local hashtags, named officials, events or institutions). If no post does, write exactly: "No link to <REGION> found in the posts read." Never guess nationality, residence or location from names, posting hours or the language used. With no REGION line, "regional_link" is an empty string.
22. Watch points. Each one names something specific to look for in future posts (a place, an official, a hashtag, a symbol, an object, a kind of call to action) and says what finding it would change in this assessment. Never write a general instruction to keep watching or to look for an increase.
23. How posts are meant. "Meaning" and "tone" on a post come from a close reading of its caption, picture and writing together, and the sentiment counts already take them into account. Use them: a joke, a meme, a quote or a greeting is not the account's own anger or hostility, and do not treat it as one. Describe a joke as a joke. A joke that makes light of someone hurt or in trouble may be insensitive: call it dark humour and nothing more, and cite the post.`;

const OUTPUT_CONTRACT = `OUTPUT: ONE JSON object only. No markdown, no code fences, no text before or after. Use exactly these fields:
{
 "bottom_line": "2-3 sentences: what kind of account this appears to be, what it mostly posts about, its usual tone, and whether anything needs attention",
 "account_type": "one of: ${ACCOUNT_TYPES.join(' / ')}",
 "account_type_basis": "one sentence: what in the posts shows this",
 "attention_reason": "1-2 sentences explaining the ATTENTION LEVEL given in FACTS, citing posts",
 "regional_link": "one sentence, see rule 21; an empty string when FACTS give no REGION",
 "behaviour_traits": [{"trait": "2-5 words, a habit of the account (see rule 16), not a subject", "evidence_level": "Observed / Likely / Unclear", "detail": "1-2 sentences saying how the account behaves and showing it with numbers from FACTS where there are any", "posts": [1, 2]}],
 "themes": [{"theme": "2-6 words", "share": "Main / Frequent / Occasional", "detail": "1-2 sentences on what the account says about it", "posts": [1]}],
 "tone": "2-3 sentences: usual tone and emotional pattern (for example calm, sarcastic, angry, celebratory, alarmist), using the sentiment counts from FACTS",
 "targets": [{"target": "a person, party, institution or group the posts name", "attitude": "Supportive / Critical / Hostile / Neutral / Mixed", "detail": "one sentence", "posts": [1]}],
 "communication_style": "2-3 sentences: languages, original versus shared posts, media and links, hashtags and mentions, calls to action, how it addresses its audience",
 "posting_pattern": "2-3 sentences reading the rhythm in FACTS (busy hours and days, night posting, bursts and long silences from ACTIVITY OVER TIME)",
 "platform_differences": "1-2 sentences on how the accounts differ by platform (tone, topics, reach, activity), using BY PLATFORM in FACTS; empty string when there is one platform",
 "influence": "1-2 sentences: reach and response from FACTS and which posts drew the most response",
 "risk_indicators": [{"indicator": "short label", "severity": "High / Medium / Low", "detail": "what the post says and why it matters", "posts": [1]}],
 "changes_over_time": [{"from": "what the account did or said earlier", "to": "what it does or says later", "posts": [1, 9]}],   // only a real shift shown by the posts; otherwise []
 "notable_posts": [{"post": 1, "why": "one line"}],
 "watch_points": ["one concrete thing to keep watching and what would change the assessment, see rule 22"],
 "limitations": ["one thing these posts cannot show"]
}
Sizes: behaviour_traits 3-6, themes 2-6, targets 0-6, risk_indicators 0-5, changes_over_time 0-3, notable_posts 3-6, watch_points 2-4, limitations 1-3.`;

const buildSystemPrompt = () => `${RULES}\n\n${OUTPUT_CONTRACT}`;

const RETRY_MESSAGE = 'Your reply was not one valid JSON object with the fields asked for. Reply again with ONLY that JSON object: no text around it, no code fences, every string closed.';

/* --------------------------------------------------------------------- context ------------------------------ */

const list = (items, fmt, empty = 'none') => (items && items.length ? items.map(fmt).join(', ') : empty);
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** The FACTS block: computed numbers only, each on its own line so the model can quote them. */
const factsText = (facts, evidence = [], region = '') => {
  const tagged = (pred) => evidence.filter(pred).map((e) => `P${e.n}`);
  const c = facts.coverage;
  const cad = facts.cadence;
  const con = facts.content;
  const eng = facts.engagement;
  const s = facts.sentiment;
  const st = facts.stance;
  const r = facts.risk;
  const tl = cad.timeline;
  const noShare = (eng.no_share_platforms || []).join(', ');
  const lines = [
    `PROFILE: ${facts.profile.name}`,
    ...(region ? [`REGION: ${region} (the area this report is for; see rule 21)`] : []),
    `ACCOUNTS: ${list(facts.profile.accounts || [], (a) => `${a.platform_name} ${a.handle} (${a.posts} posts)`, `${facts.profile.handle} on ${facts.profile.platform_name}`)}`,
    `TODAY: ${facts.today} (times are ${facts.timezone})`,
    `POSTS: ${c.total_posts} collected, from ${c.first_post || 'unknown'} to ${c.last_post || 'unknown'} (${c.span_days} days); ${c.analysed} carry AI analysis${c.no_text ? `, ${c.no_text} have no caption and nothing readable in the picture (not analysed)` : ''}${c.waiting ? `, ${c.waiting} still waiting to be analysed` : ''}`,
    ...((facts.by_platform || []).length > 1
      ? [`BY PLATFORM: ${facts.by_platform.map((p) => `${p.platform}: ${p.posts} posts, ${p.negative_share}% negative of ${p.analysed} analysed, ${p.high_risk} serious-risk, average engagement ${p.avg_engagement}, ${p.first_post || '?'} to ${p.last_post || '?'}`).join(' | ')}`]
      : []),
    `RHYTHM: ${cad.rate ? `${cad.rate.value} posts a ${cad.rate.unit}` : `${cad.posts_per_day} posts a day`} (${c.total_posts} posts over ${c.span_label || `${c.span_days} days`}); active on ${cad.active_days} days; busiest hours ${cad.busiest_hours ? `${hh(cad.busiest_hours.from)}-${hh(cad.busiest_hours.to)} (${cad.busiest_hours.posts} posts)` : 'unknown'}; busiest day ${cad.busiest_day ? `${cad.busiest_day.day} (${cad.busiest_day.posts} posts)` : 'unknown'}; ${cad.night_posts} posts between 00:00 and 05:00; longest silence ${cad.longest_gap ? `${cad.longest_gap.days} days (${cad.longest_gap.from} to ${cad.longest_gap.to})` : `${cad.longest_gap_days} days`}`,
    ...(tl ? [`ACTIVITY OVER TIME: posts in ${tl.active} of ${tl.buckets.length} ${tl.unit}s${tl.peak ? `; busiest ${tl.peak.label} (${tl.peak.posts} posts)` : ''}${tl.active <= 24 ? `; by ${tl.unit}: ${tl.buckets.filter((b) => b.posts > 0).map((b) => `${b.label} ${b.posts}`).join(', ')}` : ''}`] : []),
    `CONTENT: ${con.original} original, ${con.shared} shared from others, ${con.replies} replies; ${con.with_media} with photos or video (${con.with_image_text || 0} with text read from the image); ${con.captioned != null ? `${con.captioned} have a caption of their own and ${con.no_caption} have none (the picture is the whole post); ` : ''}${con.with_links} with links; average length ${con.avg_length} characters`,
    ...(con.pictures && con.pictures.with_pictures
      ? [`PICTURES: ${con.pictures.described} of ${con.pictures.with_pictures} posts with photos or video have a description of what the picture shows${(con.pictures.terms || []).length ? `; words that recur in those descriptions, with the number of pictures each appears in: ${con.pictures.terms.map((x) => `${x.term} ${x.count}`).join(', ')}` : ''}${(con.pictures.signals || []).length ? `; flagged in pictures (flags, symbols, weapons, crowds ...), with the number of pictures: ${con.pictures.signals.map((x) => `${x.term} ${x.count}`).join(', ')}` : ''}`]
      : []),
    ...((con.tones || []).length
      ? [`HOW THE POSTS ARE MEANT (from a close reading of each post's caption, picture and writing together; ${con.read_in_context || 0} of ${c.read} posts read): ${con.tones.map((x) => `${x.term} ${x.count}`).join(', ')}`]
      : []),
    `LANGUAGES: ${list(con.languages, (x) => `${x.language} ${x.count}`)}`,
    `TOP HASHTAGS: ${list(con.hashtags, (x) => `${x.tag} (${x.count})`)}`,
    `TOP MENTIONS: ${list(con.mentions, (x) => `${x.handle} (${x.count})`)}`,
    `ENGAGEMENT: ${eng.total.likes} likes, ${eng.shares_reported === false ? '' : `${eng.total.shares} shares${noShare ? ` (not counted for ${noShare}, which does not publish them)` : ''}, `}${eng.total.comments} comments, ${eng.total.views} views in total; average score ${eng.avg_score} a post (median ${eng.median_score}); most engaged: ${list(tagged((e) => e.reasons.includes('top_engagement')).slice(0, 5), (x) => x)}`,
    `SENTIMENT (analysed posts): ${s.positive} positive, ${s.neutral} neutral, ${s.negative} negative`,
    `STANCE: ${st.support} support, ${st.oppose} oppose, ${st.neutral} neutral, ${st.unknown} not given`,
    `RISK (analysed posts): ${r.critical} critical, ${r.high} high, ${r.medium} medium, ${r.low} low; highest score ${r.max_score}/100; serious-risk posts in evidence: ${list(tagged((e) => e.risk_level === 'critical' || e.risk_level === 'high'), (x) => x)}`,
    `ATTENTION LEVEL (decided from risk counts, final): ${facts.attention_level}`,
    `CATEGORIES: ${list(facts.categories, (x) => `${x.name} ${x.count}`)}`,
    `SIGNALS: ${list(facts.signals, (x) => `${x.name} ${x.count}`)}`,
    `WATCH-LIST KEYWORDS MATCHED: ${list(facts.keywords, (x) => `${x.term} (${x.count})`)}`,
    `POSTS WITH LEGAL-SECTION FLAGS: ${facts.legal_flag_posts}`,
  ];
  if (facts.trend) {
    const t = facts.trend;
    lines.push(`TREND: earlier ${t.earlier.from} to ${t.earlier.to}: ${t.earlier.posts} posts, ${t.earlier.negative_share}% negative, ${t.earlier.high_risk} serious-risk; later ${t.later.from} to ${t.later.to}: ${t.later.posts} posts, ${t.later.negative_share}% negative, ${t.later.high_risk} serious-risk. Negativity ${t.negativity}; risk ${t.risk}.`);
  } else {
    lines.push('TREND: too few dated posts to compare earlier and later.');
  }
  return lines.join('\n');
};

const clip = (text, maxChars) => {
  const chars = Array.from(String(text || '').replace(/\s+/g, ' ').trim());
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : chars.join('');
};

const evidenceLine = (e, maxChars) => {
  const kind = e.shared ? 'shared' : e.reply ? 'reply' : 'original';
  const head = [
    `[P${e.n}]`,
    e.day ? `${e.day}${e.hour != null ? ` ${String(e.hour).padStart(2, '0')}h` : ''}` : 'undated',
    e.platform || 'unknown',
    kind,
    e.sentiment ? e.sentiment.toUpperCase() : 'NOT ANALYSED',
    e.tone ? `tone ${e.tone}` : null,
    e.risk_level ? `risk ${e.risk_level} (${e.risk_score})` : null,
    e.stance && e.stance !== 'unknown' ? `stance ${e.stance}` : null,
    `${e.engagement.likes} likes${e.shares_reported === false ? '' : ` ${e.engagement.shares} shares`} ${e.engagement.comments} comments`,
  ].filter(Boolean).join(' · ');
  const body = [`Text: ${clip(e.text, maxChars) || '(no caption)'}`];
  if (e.english) body.push(`English: ${clip(e.english, maxChars)}`);
  if (e.image_text) body.push(`Image text: ${clip(e.image_text, Math.round(maxChars * 0.8))}`);
  if (e.scene) body.push(`Picture: ${clip(e.scene, Math.round(maxChars * 0.7))}`);
  if ((e.picture_signals || []).length) body.push(`Seen in the picture: ${e.picture_signals.join('; ')}`);
  if (e.meaning) body.push(`Meaning: ${clip(e.meaning, Math.round(maxChars * 0.9))}`);
  return `${head}\n${body.join('\n')}`;
};

const buildUserContext = ({ facts, evidence, maxChars = 280, region = '' }) => [
  'FACTS',
  factsText(facts, evidence, region),
  '',
  `EVIDENCE POSTS (oldest first; ${evidence.length} chosen from ${facts.coverage.read} collected; numbers P1-P${evidence.length} are the only valid citations)`,
  ...evidence.map((e) => evidenceLine(e, maxChars)),
  '',
  'Write the behaviour profile JSON now.',
].join('\n');

/* ----------------------------------------------------------------------- parsing ------------------------------ */

const str = (v, max = 700) => {
  if (v == null) return '';
  const s = String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Case-insensitive match to an allowed label; first-word match as a fallback ("High risk" -> "High"). */
const oneOf = (v, allowed, fallback) => {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return fallback;
  const exact = allowed.find((a) => a.toLowerCase() === s);
  if (exact) return exact;
  const starts = allowed.find((a) => s.startsWith(a.toLowerCase()) || a.toLowerCase().startsWith(s));
  return starts || fallback;
};

const postsOf = (v, maxN, cap = 8) => {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  const out = [];
  for (const x of arr) {
    const n = Number(String(x).replace(/[^\d]/g, ''));
    if (Number.isInteger(n) && n >= 1 && n <= maxN && !out.includes(n)) out.push(n);
    if (out.length >= cap) break;
  }
  return out;
};

/** Inline citations: [Post #3], [P 3], (P3) -> [P3]; numbers outside the evidence are removed. */
const cleanCites = (text, maxN) => String(text || '')
  .replace(/[[(]\s*(?:post\s*#?|p)\s*(\d+)\s*[\])]/gi, (m, d) => (Number(d) >= 1 && Number(d) <= maxN ? `[P${Number(d)}]` : ''))
  // "the most engaged posts are P1, P3 and P7": a bare number is still a citation
  .replace(/(?<!\[)\bP(\d{1,3})\b(?!\])/g, (m, d) => (Number(d) >= 1 && Number(d) <= maxN ? `[P${Number(d)}]` : ''))
  .replace(/\s+([.,;:])/g, '$1')
  .replace(/\s{2,}/g, ' ')
  .trim();

const words = (t) => new Set(String(t || '').toLowerCase().replace(/\[p\d+\]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
/** Share of words two texts have in common (0 to 1). */
const overlap = (a, b) => {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  x.forEach((w) => { if (y.has(w)) common += 1; });
  return common / Math.min(x.size, y.size);
};
/** Words that mean "nothing yet": the model copying the contract's example instead of saying something. */
const PLACEHOLDER = /^(earlier|later|before|after|then|now)( (pattern|state|behaviour|activity|period))?\.?$/i;
/** A watch point that only says "keep watching for more": it names nothing to look for and what it would change. */
const VAGUE_WATCH = /\b(?:any|an|a)\s+(?:increase|rise|growth|change)\s+in\b|\bgrowing influence\b|\bnew hashtags?\b|^(?:keep|continue)\s+(?:to\s+)?(?:watching|monitoring)\b/i;

const listOf = (v, mapFn, max) => (Array.isArray(v) ? v.map(mapFn).filter(Boolean).slice(0, max) : []);

/**
 * Read and check the model's JSON. Throws when there is no usable report (no bottom line),
 * so the caller can ask once more or fall back.
 */
const parseBehaviorReport = (rawText, { maxN, attentionLevel = 'Low' } = {}) => {
  const obj = extractJson(rawText);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('reply is not a JSON object');
  const t = (v, max) => cleanCites(str(v, max), maxN);
  const report = {
    bottom_line: t(obj.bottom_line, 900),
    account_type: oneOf(obj.account_type, ACCOUNT_TYPES, 'Unclear'),
    account_type_basis: t(obj.account_type_basis, 400),
    attention_level: attentionLevel,
    attention_reason: t(obj.attention_reason, 600),
    regional_link: t(obj.regional_link, 300),
    behaviour_traits: listOf(obj.behaviour_traits, (x) => (x && str(x.trait) ? {
      trait: str(x.trait, 80),
      evidence_level: oneOf(x.evidence_level, EVIDENCE_LEVELS, 'Likely'),
      detail: t(x.detail, 500),
      posts: postsOf(x.posts, maxN),
    } : null), 6),
    themes: listOf(obj.themes, (x) => (x && str(x.theme) ? {
      theme: str(x.theme, 80),
      share: oneOf(x.share, SHARES, 'Occasional'),
      detail: t(x.detail, 500),
      posts: postsOf(x.posts, maxN),
    } : null), 6),
    tone: t(obj.tone, 900),
    targets: listOf(obj.targets, (x) => (x && str(x.target) ? {
      target: str(x.target, 90),
      attitude: oneOf(x.attitude, ATTITUDES, 'Mixed'),
      detail: t(x.detail, 400),
      posts: postsOf(x.posts, maxN),
    } : null), 6),
    communication_style: t(obj.communication_style, 900),
    posting_pattern: t(obj.posting_pattern, 700),
    platform_differences: t(obj.platform_differences, 600),
    influence: t(obj.influence, 500),
    // A risk indicator without a post behind it is an opinion, not evidence: it is dropped.
    risk_indicators: listOf(obj.risk_indicators, (x) => {
      if (!x || !str(x.indicator)) return null;
      const posts = postsOf(x.posts, maxN);
      return posts.length ? { indicator: str(x.indicator, 90), severity: oneOf(x.severity, SEVERITIES, 'Medium'), detail: t(x.detail, 500), posts } : null;
    }, 5),
    changes_over_time: listOf(obj.changes_over_time, (x) => (x && (str(x.from) || str(x.to)) ? {
      from: t(x.from, 300), to: t(x.to, 300), posts: postsOf(x.posts, maxN),
    } : null), 3),
    notable_posts: listOf(obj.notable_posts, (x) => {
      const n = postsOf(x && (x.post ?? x.posts), maxN, 1)[0];
      return n ? { post: n, why: t(x.why, 240) } : null;
    }, 6),
    watch_points: listOf(obj.watch_points, (x) => { const w = t(x, 240); return w && !VAGUE_WATCH.test(w) ? w : null; }, 4),
    limitations: listOf(obj.limitations, (x) => t(x, 240) || null, 3),
  };
  // A change needs two different, real sides; a trait that only restates a theme is the same point twice.
  report.changes_over_time = report.changes_over_time.filter((c) => c.from && c.to && !PLACEHOLDER.test(c.from) && !PLACEHOLDER.test(c.to) && overlap(c.from, c.to) < 0.95);
  report.behaviour_traits = report.behaviour_traits.filter((t, i, all) =>
    !report.themes.some((th) => overlap(t.detail, th.detail) >= 0.7 && t.detail.length > 20)
    && !all.slice(0, i).some((u) => overlap(t.detail, u.detail) >= 0.85 && t.detail.length > 20));
  if (!report.bottom_line) throw new Error('reply has no bottom_line');
  return report;
};

/* ---------------------------------------------------------------------- fallback ------------------------------ */

const hourRange = (b) => (b ? `${hh(b.from)}-${hh(b.to)}` : null);

/** A plain report from the facts alone. Used when the model is down or its replies cannot be read. */
const fallbackReport = (facts, evidence = []) => {
  const s = facts.sentiment;
  const r = facts.risk;
  const c = facts.coverage;
  const analysedN = s.positive + s.neutral + s.negative;
  const mainTone = analysedN === 0 ? 'not analysed yet'
    : s.negative >= s.positive && s.negative >= s.neutral ? 'mostly negative'
      : s.positive >= s.neutral ? 'mostly positive' : 'mostly neutral';
  const serious = evidence.filter((e) => e.risk_level === 'critical' || e.risk_level === 'high');
  const top = [...evidence].sort((a, b) => b.engagement.score - a.engagement.score).slice(0, 3);
  return {
    bottom_line: `${facts.profile.name} published ${c.read.toLocaleString('en-IN')} posts between ${c.first_post || 'unknown'} and ${c.last_post || 'unknown'}. The tone is ${mainTone} (${s.positive} positive, ${s.neutral} neutral, ${s.negative} negative)${r.critical + r.high > 0 ? `, and ${r.critical + r.high} posts carry a serious risk score` : ''}.`,
    account_type: 'Unclear',
    account_type_basis: 'Not assessed: the AI model was not available.',
    attention_level: facts.attention_level,
    attention_reason: `Risk counts: ${r.critical} critical, ${r.high} high, ${r.medium} medium, ${r.low} low.`,
    regional_link: '',
    behaviour_traits: [],
    themes: facts.categories.slice(0, 5).map((x) => ({ theme: x.name, share: x.count >= c.analysed / 3 ? 'Main' : 'Occasional', detail: `${x.count} posts in this category.`, posts: [] })),
    tone: `${s.positive} positive, ${s.neutral} neutral and ${s.negative} negative posts among the ${analysedN} analysed.`,
    targets: [],
    communication_style: `${facts.content.original} original posts, ${facts.content.shared} shared and ${facts.content.replies} replies; ${facts.content.with_media} with photos or video and ${facts.content.with_links} with links.`,
    posting_pattern: `${facts.cadence.posts_per_day} posts a day on average${facts.cadence.busiest_hours ? `, busiest between ${hourRange(facts.cadence.busiest_hours)}` : ''}${facts.cadence.busiest_day ? ` and on ${facts.cadence.busiest_day.day}` : ''}.`,
    platform_differences: (facts.by_platform || []).length > 1
      ? facts.by_platform.map((p) => `${p.platform}: ${p.posts} posts, ${p.negative_share}% negative`).join('; ') + '.'
      : '',
    influence: facts.engagement.shares_reported === false
      ? `${facts.engagement.total.likes} likes and ${facts.engagement.total.comments} comments in total.`
      : `${facts.engagement.total.likes} likes, ${facts.engagement.total.shares} shares and ${facts.engagement.total.comments} comments in total.`,
    risk_indicators: serious.slice(0, 5).map((e) => ({
      indicator: e.category || 'Serious risk score',
      severity: e.risk_level === 'critical' ? 'High' : 'Medium',
      detail: e.summary ? str(e.summary, 300) : `Risk score ${e.risk_score}/100.`,
      posts: [e.n],
    })),
    changes_over_time: [],
    notable_posts: [...serious.slice(0, 3), ...top].filter((e, i, a) => a.findIndex((x) => x.n === e.n) === i).slice(0, 5)
      .map((e) => ({ post: e.n, why: e.risk_level === 'critical' || e.risk_level === 'high' ? `Risk ${e.risk_level} (${e.risk_score}).` : `Most engaged (score ${e.engagement.score}).` })),
    watch_points: facts.content.hashtags.slice(0, 3).map((h) => `${h.tag} (${h.count} posts)`),
    limitations: ['The AI model was not available, so this report lists the computed statistics only. Regenerate later for the full behaviour analysis.'],
  };
};

/* ------------------------------------------------------------------------- copy ------------------------------- */

const cites = (posts) => (posts && posts.length ? ` [${posts.map((n) => `P${n}`).join(', ')}]` : '');

const reportToMarkdown = (report, facts) => {
  if (!report) return '';
  const out = [];
  out.push(`# Behaviour report: ${facts?.profile?.name || 'Profile'}`);
  if (facts) out.push(`${facts.profile.platform_name} · ${facts.coverage.read} posts, ${facts.coverage.first_post || '?'} to ${facts.coverage.last_post || '?'}`);
  out.push('', `**Attention: ${report.attention_level}.** ${report.attention_reason}`, '', report.bottom_line);
  out.push('', `**Account type:** ${report.account_type}. ${report.account_type_basis}`);
  if (report.regional_link) out.push('', `**Regional link:** ${report.regional_link}`);
  const sec = (title, items, fmt) => { if (items && items.length) { out.push('', `## ${title}`); items.forEach((x) => out.push(`- ${fmt(x)}`)); } };
  const para = (title, text) => { if (text) out.push('', `## ${title}`, text); };
  sec('Behaviour traits', report.behaviour_traits, (x) => `**${x.trait}** (${x.evidence_level}): ${x.detail}${cites(x.posts)}`);
  sec('Themes', report.themes, (x) => `**${x.theme}** (${x.share}): ${x.detail}${cites(x.posts)}`);
  para('Tone', report.tone);
  sec('Who the posts are about', report.targets, (x) => `**${x.target}** (${x.attitude}): ${x.detail}${cites(x.posts)}`);
  para('Communication style', report.communication_style);
  para('Posting pattern', report.posting_pattern);
  para('Platform differences', report.platform_differences);
  para('Reach', report.influence);
  sec('Risk indicators', report.risk_indicators, (x) => `**${x.indicator}** (${x.severity}): ${x.detail}${cites(x.posts)}`);
  sec('Changes over time', report.changes_over_time, (x) => `${x.from} → ${x.to}${cites(x.posts)}`);
  sec('Notable posts', report.notable_posts, (x) => `P${x.post}: ${x.why}`);
  sec('Watch points', report.watch_points, (x) => x);
  sec('Limitations', [...(report.limitations || []), ...((facts && facts.coverage && facts.coverage.notes) || [])], (x) => x);
  return out.join('\n');
};

module.exports = {
  ACCOUNT_TYPES,
  EVIDENCE_LEVELS,
  LEVELS,
  buildSystemPrompt,
  buildUserContext,
  factsText,
  RETRY_MESSAGE,
  parseBehaviorReport,
  fallbackReport,
  reportToMarkdown,
  cleanCites,
};
