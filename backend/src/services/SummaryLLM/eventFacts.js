/**
 * Per-post facts for the event report: WHAT is happening, WHEN it happens (not when it was posted), WHO organises it,
 * WHERE, and whether the post calls for action or reports violence. The model only reads; the code validates every
 * field against the post text and aggregates. Nothing here is tied to a tenant, language, place or event.
 */

const FACTS_SYSTEM = `You extract facts from social-media posts for an event analyst. Each line is: number|posted YYYY-MM-DD|@author|text.
Return ONLY compact JSON on ONE line (no spaces, no line breaks), one entry for EVERY post number given. Leave out any field that is empty or 0:
{"p":[{"n":12,"k":"bandh","d":"2026-10-08","o":"organiser","s":"demand or reason","w":"place","c":1,"v":0,"x":0,"a":0,"m":0,"t":"denied","r":"m","pl":[{"n":"CityName","in":"State, Country","a":1}]}]}
- k: what the post is about: bandh | rally | protest | meeting | notice | campaign | visit | violence | other. Use bandh only when the post itself says bandh, shutdown or strike; a march, sit-in, demonstration or protest at a site is protest.
- d: the date the activity takes place, as YYYY-MM-DD. Work it out from the post date ("tomorrow", "8th", "next Friday"). Leave "" if the post gives no date. NEVER use the posting date unless the post says the activity happens that day.
- o: the group or person that ORGANISES or CALLS the activity, exactly as the post names it. "" if not stated. A party that stays away from, opposes or only comments on the activity is NOT its organiser; a post that says "A has called a bandh, B stays away" has organiser A.
- s: WHY the activity is held: the demand, issue or reason the post gives, in English, at most 10 words (for example "against the arrest of a leader"). "" if the post does not say.
- w: the place where the activity happens, as the post names it. "" if not stated.
- c: 1 only if the AUTHOR of the post calls people to join, strike, block or gather (an explicit invitation or instruction to attend or take part). A news report saying someone else has called or announced a bandh, protest or rally is 0, and so is a post by a news outlet. A memorandum, petition, delegation, press meet, meeting with an official, or an announcement of dates is 0. Greetings, thanks and support messages are 0.
- v: 1 only if the post reports or threatens violence, arson, clashes or damage that is part of THIS event's own activity. Riots, attacks or damage in another country or about another story are 0. A police case or FIR alone is 0. Arrests, detentions, preventive custody, a ban or a police warning are 0 unless the post also reports clashes, stone-pelting, arson, injury or damage.
- x: 1 if the post only ALLEGES, WARNS OF or PREDICTS violence or disruption that has not been reported as happening (for example "stone-pelting may be planned", "a violence warning"). A post with v=1 has x=0.
- a: 1 if the post reports arrests, detentions, preventive custody, a ban, prohibitory orders or a police refusal of permission about this activity.
- t: status of the activity as the post reports it: announced | permitted | denied (ONLY when police or an authority refused permission, banned it or declared it unlawful; a party staying away or opposing it is NOT denied) | held (it has happened) | called_off. "" if not stated.
- m: 1 if the post (any author, including news) reports that a group is preparing, mobilising or asking its workers or the public to turn out for the activity. This is NOT the same as c: c is only for the author's own call.
- e: 0 ONLY if the post is clearly NOT about the monitored event or its subject (for example an exam guide, a travel story, a routine government camp, an advertisement that merely shares a place name). Leave e out when the post is about the event, its organisers, its demands or its effects.
- r: who posts: m = news outlet, agency or TV/YouTube news channel (judge by the account name and style); o = organisation/party account; p = politician or public figure; i = ordinary person. A post that reports what others announced or did ("X has announced…", "police said…") is written by media (m) unless the account is itself that group.
- pl: EVERY real place the post names (city, district, state, country, landmark), written as in the post. in = the state/region and country that place belongs to, in English. a = 1 only if the post says people ARE or WERE physically there (a turnout, a march under way, arrests there); 0 if the place is only mentioned or the gathering is only announced for the future. Do not list a person, party or word that is not a place.
Use only what the post says; never invent a date, organiser or place.`;

const buildFactsUserContext = (posts, event = null) =>
  `${event && event.name ? `Event being monitored: ${String(event.name).slice(0, 120)}${event.description ? ` — ${String(event.description).replace(/\s+/g, ' ').slice(0, 260)}` : ''}${event.location ? ` (location: ${String(event.location).slice(0, 80)})` : ''}\n` : ''}Posts:\n${posts.map((s) => {
    const day = s.postedAt ? new Date(s.postedAt).toISOString().slice(0, 10) : 'unknown';
    const body = String(s.englishText || s.text || '').slice(0, 220);
    return `${s.n}|posted ${day}|@${s.author}|${body}`;
  }).join('\n')}`;

const KINDS = new Set(['bandh', 'rally', 'protest', 'meeting', 'notice', 'campaign', 'visit', 'violence', 'other']);
const STATUS = new Set(['announced', 'permitted', 'denied', 'held', 'called_off']);
const ROLES = { m: 'media', o: 'organisation', p: 'figure', i: 'individual' };
const DAY = 86400000;

const fold = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

// A name is kept only if every significant word of it appears in the post (original or English version).
const supported = (value, haystacks) => {
  const words = fold(value).split(' ').filter((w) => w.length > 1);
  if (!words.length) return false;
  return haystacks.some((h) => { const f = ` ${fold(h)} `; return words.every((w) => f.includes(w)); });
};

/** Reads one reply. Returns { [n]: fact } for valid post numbers (already validated against `byNo`), or null if unusable. */
/** If the reply was cut off, keep every complete {...} entry that has a post number. */
const salvageEntries = (raw) => {
  const out = [];
  const re = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let m;
  while ((m = re.exec(String(raw || '')))) {
    try { const o = JSON.parse(m[0]); if (o && o.n !== undefined && !o.p) out.push(o); } catch (e) { /* skip a broken piece */ }
  }
  return out;
};

const parseFacts = (raw, byNo, extractJson) => {
  let obj;
  try { obj = extractJson(raw); } catch (e) { obj = null; }
  let list = obj ? (Array.isArray(obj.p) ? obj.p : Array.isArray(obj.posts) ? obj.posts : Array.isArray(obj) ? obj : []) : [];
  if (!list.length) list = salvageEntries(raw);
  const out = {};
  list.forEach((f) => {
    const n = Number(f.n);
    const post = byNo.get(n);
    if (!post) return;
    const hay = [post.text, post.englishText];
    const kind = String(f.k || '').toLowerCase();
    let date = '';
    const m = String(f.d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      const posted = post.postedAt ? new Date(post.postedAt).getTime() : NaN;
      // A real calendar date, within ~4 months of the post (older or later dates are model drift).
      if (!Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === m[0] && (Number.isNaN(posted) || Math.abs(t - posted) <= 120 * DAY)) date = m[0];
    }
    const organiser = String(f.o || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const subject = String(f.s || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    const place = String(f.w || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const postedDay = post.postedAt ? new Date(post.postedAt).toISOString().slice(0, 10) : '';
    const notYet = Boolean(date && postedDay && postedDay < date);   // a post written before the activity cannot report people already there
    const pl = (Array.isArray(f.pl) ? f.pl : []).map((x) => ({
      name: String(x?.n || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      region: String(x?.in || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      active: Number(x?.a) === 1 && !notYet,
    })).filter((x) => x.name && supported(x.name, hay)).slice(0, 6);
    out[n] = {
      places: pl,
      kind: KINDS.has(kind) ? kind : 'other',
      date,
      organiser: supported(organiser, hay) ? organiser : '',
      place: supported(place, hay) ? place : '',
      subject,
      call: Number(f.c) === 1,
      violence: Number(f.v) === 1,
      mobilising: Number(f.m) === 1,
      relevant: f.e === undefined || Number(f.e) !== 0,
      alleged: Number(f.x) === 1 && Number(f.v) !== 1,
      detention: Number(f.a) === 1,
      status: STATUS.has(String(f.t || '').toLowerCase()) ? String(f.t).toLowerCase() : '',
      role: ROLES[String(f.r || '').toLowerCase()] || '',
    };
  });
  return Object.keys(out).length ? out : null;
};

const ACTIVITY_KINDS = new Set(['bandh', 'rally', 'protest', 'meeting', 'campaign', 'visit']);

/**
 * Aggregates per-post facts into report facts. A date or organiser counts only when posts agree on it:
 * the most-supported (date, kind) pairs become key dates; the most-named organiser of each becomes its organiser.
 */
const aggregateFacts = (factsMap, byNo, regionOf = () => 'unknown') => {
  const dated = new Map();
  const organiserCounts = new Map();
  const accounts = new Map();
  const placeMap = new Map();
  const byPost = {};
  let calls = 0; let violence = 0; let callsOut = 0; let violenceOut = 0;
  const allegedPosts = []; const detentionPosts = []; const mobilisingPosts = []; const violenceAuthors = new Set();
  const callPosts = []; const violencePosts = []; const callOutPosts = []; const violenceOutPosts = [];

  Object.entries(factsMap).forEach(([nStr, f]) => {
    const n = Number(nStr);
    const post = byNo.get(n);
    byPost[n] = { places: (f.places || []).map((pl) => pl.name), kind: f.kind, date: f.date, relevant: f.relevant !== false, active: (f.places || []).filter((pl) => pl.active).map((pl) => pl.name) };
    if (f.relevant === false) return;     // a post that is not about the event adds nothing to its activities, places or counts
    const where = regionOf(n);                       // 'in', 'out' (all named places are outside the event region) or 'unknown'
    const ownCall = f.call && f.role !== 'media' && where !== 'out';   // a news report of someone else's call is not a call; calls elsewhere are counted apart
    if (f.call && f.role !== 'media' && where === 'out') { callsOut += 1; callOutPosts.push(n); }
    if (ownCall) { calls += 1; callPosts.push(n); }
    const ownViolence = f.violence && !f.detention && !f.alleged && where !== 'out';   // arrests and allegations are not confirmed violence
    if (f.violence && where === 'out') { violenceOut += 1; violenceOutPosts.push(n); }
    if (ownViolence) { violence += 1; violencePosts.push(n); violenceAuthors.add(String(post?.author || n).toLowerCase()); }
    if (f.alleged && where !== 'out') allegedPosts.push(n);
    if (f.mobilising && where !== 'out') mobilisingPosts.push(n);
    if (f.detention && where !== 'out') detentionPosts.push(n);
    (f.places || []).forEach((pl) => {
      const key = fold(pl.name);
      const e = placeMap.get(key) || { name: pl.name, region: pl.region, mentioned: 0, active: 0, posts: [] };
      e.mentioned += 1;
      if (pl.active) e.active += 1;
      if (!e.region && pl.region) e.region = pl.region;
      if (e.posts.length < 6) e.posts.push(n);
      placeMap.set(key, e);
    });
    if (post) {
      const key = String(post.author || '').toLowerCase();
      const a = accounts.get(key) || { author: post.author, platform: post.platform, roles: {}, calls: 0, violence: 0, eng: 0, posts: [] };
      if (f.role) a.roles[f.role] = (a.roles[f.role] || 0) + 1;
      if (ownCall) a.calls += 1;
      if (ownViolence) a.violence += 1;
      a.eng += Number(post.engagementScore) || 0;
      a.posts.push(n);
      accounts.set(key, a);
    }
    if (!ACTIVITY_KINDS.has(f.kind) || !f.date) return;
    const k = `${f.date}|${f.kind}`;
    const d = dated.get(k) || { date: f.date, kind: f.kind, posts: [], organisers: new Map(), places: new Map(), subjects: new Map(), statuses: new Map(), outside: 0 };
    d.posts.push(n);
    if (where === 'out') d.outside += 1;
    if (f.organiser) { const ok = fold(f.organiser); const cur = d.organisers.get(ok) || { name: f.organiser, n: 0, forms: new Map() }; cur.n += 1; cur.forms.set(f.organiser, (cur.forms.get(f.organiser) || 0) + 1); cur.name = Array.from(cur.forms.entries()).sort((a, b) => b[1] - a[1])[0][0]; d.organisers.set(ok, cur); }
    if (f.status) d.statuses.set(f.status, (d.statuses.get(f.status) || 0) + 1);
    if (f.subject) d.subjects.set(f.subject, (d.subjects.get(f.subject) || 0) + 1);
    if (f.place) d.places.set(f.place, (d.places.get(f.place) || 0) + 1);
    dated.set(k, d);
    if (f.organiser) { const ok = fold(f.organiser); const cur = organiserCounts.get(ok) || { name: f.organiser, n: 0, forms: new Map() }; cur.n += 1; cur.forms.set(f.organiser, (cur.forms.get(f.organiser) || 0) + 1); cur.name = Array.from(cur.forms.entries()).sort((a, b) => b[1] - a[1])[0][0]; organiserCounts.set(ok, cur); }
  });

  const top = (m) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const topOrg = (m) => Array.from(m.values()).sort((a, b) => b.n - a.n)[0]?.name || '';
  const activities = Array.from(dated.values())
    .map((d) => ({ date: d.date, kind: d.kind, organiser: topOrg(d.organisers), place: top(d.places), subject: top(d.subjects), statuses: Object.fromEntries(d.statuses), posts: d.posts.slice(0, 8), support: d.posts.length, outside: d.outside > 0 && d.outside === d.posts.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    activities,
    places: Array.from(placeMap.values()).sort((a, b) => b.active - a.active || b.mentioned - a.mentioned),
    organisers: Array.from(organiserCounts.values()).map((o) => ({ name: o.name, count: o.n })).sort((a, b) => b.count - a.count).slice(0, 10),
    calls: { count: calls, posts: callPosts.slice(0, 10) },
    violence: { count: violence, accounts: violenceAuthors.size, posts: violencePosts.slice(0, 10) },
    mobilising: { count: mobilisingPosts.length, posts: mobilisingPosts.slice(0, 10) },
    alleged: { count: allegedPosts.length, posts: allegedPosts.slice(0, 10) },
    detentions: { count: detentionPosts.length, posts: detentionPosts.slice(0, 10) },
    byPost,
    callsOutside: { count: callsOut, posts: callOutPosts.slice(0, 10) },
    violenceOutside: { count: violenceOut, posts: violenceOutPosts.slice(0, 10) },
    accounts: Array.from(accounts.values()).map((a) => ({
      ...a,
      role: Object.entries(a.roles).sort((x, y) => y[1] - x[1])[0]?.[0] || 'individual',
    })),
  };
};

/** Compact lines for the report prompt, every one with its post numbers. */
const factsPackText = (facts, today) => {
  if (!facts) return '';
  const day = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const when = today && d < new Date(today.toISOString().slice(0, 10)) ? 'past' : 'upcoming';
    return `${d.toISOString().slice(0, 10)} (${when})`;
  };
  const lines = [];
  facts.activities.filter((a) => !a.outside).slice(0, 10).forEach((a) => lines.push(
    `FACT ${day(a.date)} ${a.kind}${a.organiser ? ` called by ${a.organiser}` : ''}${a.place ? ` at ${a.place}` : ''}${a.subject ? ` about: ${a.subject}` : ''}${a.statuses && Object.keys(a.statuses).length ? ` [status in posts: ${Object.entries(a.statuses).map(([k, v]) => `${k} x${v}`).join(', ')}]` : ''} — ${a.support} post(s) ${a.posts.map((p) => `[Post #${p}]`).join(' ')}`));
  facts.activities.filter((a) => a.outside).slice(0, 4).forEach((a) => lines.push(
    `FACT (OUTSIDE the event region, mention only as context) ${day(a.date)} ${a.kind}${a.place ? ` at ${a.place}` : ''} — ${a.support} post(s)`));
  if (facts.calls.count) lines.push(`FACT ${facts.calls.count} post(s) call people to join or act ${facts.calls.posts.map((p) => `[Post #${p}]`).join(' ')}`);
  if (facts.callsOutside && facts.callsOutside.count) lines.push(`FACT ${facts.callsOutside.count} post(s) call for activity OUTSIDE the event region; this does not raise the risk in the event region`);
  lines.push(facts.violence.count
    ? `FACT ${facts.violence.count} post(s) mention violence or damage ${facts.violence.posts.map((p) => `[Post #${p}]`).join(' ')}`
    : 'UNKNOWN no post confirms violence or damage');
  if (facts.mobilising && facts.mobilising.count) lines.push(`FACT ${facts.mobilising.count} post(s) report that a group is mobilising people; none of them is an author's own call to act ${facts.mobilising.posts.map((p) => `[Post #${p}]`).join(' ')}`);
  if (facts.alleged && facts.alleged.count) lines.push(`FACT ${facts.alleged.count} post(s) ALLEGE or warn of violence that is not confirmed ${facts.alleged.posts.map((p) => `[Post #${p}]`).join(' ')}`);
  if (facts.detentions && facts.detentions.count) lines.push(`FACT ${facts.detentions.count} post(s) report arrests, detentions, a ban or a refusal of permission ${facts.detentions.posts.map((p) => `[Post #${p}]`).join(' ')}`);
  return lines.join('\n');
};

module.exports = {
  salvageEntries,
  fold, FACTS_SYSTEM, buildFactsUserContext, parseFacts, aggregateFacts, factsPackText };
