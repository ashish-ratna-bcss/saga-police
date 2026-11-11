/**
 * The planning blocks of the event brief, worked out from the counted facts only: the status of each activity, the risk
 * box, the priority actions (who, by when, escalate if), and the comparison with the previous report.
 * No model is called here and nothing is tied to a tenant, an event, a place or a language: every sentence that reaches
 * the page goes through `L` (the label function), so it can be translated, and every name comes from the facts.
 */
const { fold, splitPlaces } = require('./eventFacts');
const { DEFAULT_UNITS } = require('./eventSummary.prompt');

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const plainL = (en, vars = {}) => String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const fmtN = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0).toLocaleString('en-US');
const plural = (L, n, one, many) => L(n === 1 ? one : many, { n: fmtN(n) });
const clipText = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t; };

const isIso = (s) => ISO.test(String(s || ''));
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dayLabel = (iso) => (isIso(iso) ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : String(iso || ''));
const joinList = (arr, and = 'and') => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${and} ${arr[arr.length - 1]}`);
const refStr = (ns, max = 6) => Array.from(new Set(ns || [])).sort((a, b) => a - b).slice(0, max).map((n) => `[Post #${n}]`).join(' ');
// A sentence with its posts in brackets: "11 posts report people on site (#15 #19)."
const withRefs = (sentence, ns, max = 4) => (ns && ns.length ? `${String(sentence).replace(/\.$/, '')} (${refStr(ns, max)}).` : sentence);
const uniq = (arr) => Array.from(new Set(arr));

/** "6, 7 and 9 Nov" for a list of ISO dates in one month; "30 Oct and 2 Nov" across months. */
const dateList = (isos, and = 'and') => {
  const groups = [];
  uniq((isos || []).filter(isIso)).sort().forEach((d) => {
    const m = d.slice(0, 7);
    let g = groups.find((x) => x.m === m);
    if (!g) { g = { m, days: [] }; groups.push(g); }
    g.days.push(Number(d.slice(8, 10)));
  });
  return joinList(groups.map((g) => `${joinList(g.days, and)} ${MONTHS[Number(g.m.slice(5, 7)) - 1]}`), and);
};

const activityPlaces = (a) => (Array.isArray(a?.places) && a.places.length ? a.places : splitPlaces(a?.place));
const isCalledOff = (a) => {
  const st = a?.statuses || {};
  const off = Number(st.called_off || 0);
  const rest = Object.entries(st).filter(([k]) => k !== 'called_off').reduce((t, [, n]) => t + Number(n || 0), 0);
  return off > 0 && off >= rest;
};

/** The outcome the posts report most often; a refusal counts only when several posts, or most of them, say so. */
const dominantStatus = (a) => {
  const st = a?.statuses || {};
  const total = Object.values(st).reduce((x, y) => x + Number(y || 0), 0);
  const solid = (k, n) => k !== 'denied' || n >= 3 || n * 2 >= total;
  return Object.entries(st).filter(([k, n]) => k !== 'announced' && solid(k, n)).sort((x, y) => y[1] - x[1]).map(([k]) => k)[0] || '';
};

/**
 * Confirmed: two or more news outlets report it as held. Reported: it appears in posts, with no official source.
 * Not verified: the date has passed and no post says whether it took place. The number of posts is never read as turnout.
 */
const activityStatus = (a, todayIso) => {
  const past = Boolean(todayIso && a.date && a.date < todayIso);
  const out = dominantStatus(a);
  if (!past) return 'Reported';
  if (out === 'held') return Number(a.confirmedBy || 0) >= 2 ? 'Confirmed' : 'Reported';
  return out ? 'Reported' : 'Not verified';
};

const splitActivities = (acts, todayIso) => {
  const inRegion = (acts || []).filter((a) => !a.outside);
  const byDate = (x, y) => String(x.date).localeCompare(String(y.date));
  return {
    upcoming: inRegion.filter((a) => (!todayIso || a.date >= todayIso) && !isCalledOff(a)).sort(byDate),
    past: inRegion.filter((a) => todayIso && a.date < todayIso).sort(byDate),
  };
};

const LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const levelIndex = (level) => (/^low to medium$/i.test(level) ? 0.5 : LEVELS.findIndex((x) => x.toLowerCase() === String(level || '').toLowerCase()));
const nextLevel = (level) => { const i = levelIndex(level); return i < 0 || i >= 3 ? '' : LEVELS[Math.floor(i) + 1]; };
const lowerLevel = (level) => { const i = levelIndex(level); return i < 1 ? '' : LEVELS[Math.ceil(i) - 1]; };

/** Enhanced until the last activity still to come (within 45 days), else until the next one; baseline when nothing is coming and the level is low. */
const surveillanceOf = ({ level, upcoming, todayIso }) => {
  const dates = (upcoming || []).map((a) => a.date).filter(isIso).sort();
  if (dates.length) {
    const near = todayIso ? dates.filter((d) => d <= addDays(todayIso, 45)) : dates;
    return { mode: 'enhanced', until: near.length ? near[near.length - 1] : dates[0] };
  }
  return { mode: levelIndex(level) >= 1 ? 'enhanced' : 'baseline', until: '' };
};

/** A deadline before the target date and never before today. */
const deadlineBefore = (todayIso, targetIso, lead) => {
  if (!todayIso) return '';
  if (!isIso(targetIso) || targetIso <= todayIso) return todayIso;
  const d = addDays(targetIso, -Math.max(1, lead));
  return d < todayIso ? todayIso : d;
};

/* ------------------------------------------------------------------ RISK BOX ------------------------------------- */
/**
 * Everything the first-page risk box says, as plain sentences with [Post #n] tags.
 * Counts and post numbers are passed in (they come from the same lists the rest of the report uses), so the box can never disagree with them.
 */
const buildRiskBox = ({ L = plainL, level, todayIso, upcoming = [], and = 'and', c = {}, refs = {}, highPosts = [], detentionDetails = [] }) => {
  const surveillance = surveillanceOf({ level, upcoming, todayIso });
  const because = [];

  upcoming.slice(0, 2).forEach((a) => {
    const places = activityPlaces(a);
    const where = places.length ? ` ${L(places.length > 1 ? 'across {places}' : 'in {places}', { places: joinList(places, and) })}` : '';
    const vars = { kind: L(a.kind || 'activity'), organiser: a.organiser, date: dayLabel(a.date), where };
    const line = a.organiser ? L('A {kind} is called by {organiser} for {date}{where}.', vars) : L('A {kind} is planned for {date}{where}.', vars);
    because.push(withRefs(line, a.posts, 4));
  });

  if (c.onSite || c.mobilising) {
    const parts = [];
    if (c.onSite) parts.push(withRefs(plural(L, c.onSite, '{n} post reports people on site.', '{n} posts report people on site.'), refs.onSite, 4));
    if (c.mobilising) parts.push(withRefs(plural(L, c.mobilising, '{n} post reports a group mobilising.', '{n} posts report a group mobilising.'), refs.mobilising, 3));
    because.push(parts.join(' '));
  }

  if (c.high || c.medium) {
    const parts = [];
    if (c.high) {
      const where = highPosts.slice(0, 3).map((h) => `${refStr([h.n])}${h.place ? `, ${h.place}` : ''}`).join('; ');
      parts.push(`${plural(L, c.high, '{n} post is rated high risk', '{n} posts are rated high risk')}${where ? ` (${where})` : ''}${c.medium ? ',' : '.'}`);
    }
    if (c.medium) {
      parts.push(c.high
        ? plural(L, c.medium, 'and {n} more is rated medium risk.', 'and {n} more are rated medium risk.')
        : plural(L, c.medium, '{n} post is rated medium risk.', '{n} posts are rated medium risk.'));
    }
    because.push(parts.join(' '));
  }

  if (c.detentions) {
    const det = detentionDetails.slice(0, 2).map((d) => {
      const what = [d.who, d.place].filter(Boolean).join(', ') || (d.text ? `“${clipText(d.text, 90)}”` : '');
      return `(${what ? `${what} ` : ''}${refStr([d.n])})`;
    }).join(' ');
    because.push(`${plural(L, c.detentions, '{n} post reports arrests or detentions; these are not violence.', '{n} posts report arrests or detentions; these are not violence.')}${det ? ` ${det}` : ''}`);
  }

  if (c.violence) {
    because.push(withRefs(plural(L, c.violence, '{n} post mentions violence or damage.', '{n} posts mention violence or damage.'), refs.violence, 4));
  } else if (c.haveFacts) {
    because.push(L('No post confirms violence or damage.'));
  }
  if (c.alleged) {
    because.push(withRefs(plural(L, c.alleged, '{n} post alleges or warns of violence; this is not confirmed.', '{n} posts allege or warn of violence; this is not confirmed.'), refs.alleged, 4));
  }
  if (c.haveFacts && !c.calls && !upcoming.length) because.push(L('No post calls for a bandh, blockade or gathering.'));
  because.push(L('Criticism of leaders or authorities is negative tone, not a risk signal.'));

  const kind = upcoming[0] ? L(upcoming[0].kind || 'activity') : '';
  const until = upcoming[0] ? dayLabel(surveillance.until || upcoming[0].date) : '';
  let rise = null; let fall = null;
  const up = nextLevel(level); const down = lowerLevel(level);
  if (up === 'Medium') {
    rise = { level: up, items: [
      L('a post calls people to join a bandh, rally or blockade'),
      L('posts report a group mobilising or people on site'),
      L('a post mentions violence or damage linked to the event'),
    ] };
  } else if (up === 'High') {
    rise = { level: up, items: [
      upcoming.length ? L('posts call for a blockade or forced shutdown on or before {date}', { date: until }) : L('posts call for a blockade or forced shutdown'),
      upcoming.length ? L('protests or the {kind} look coordinated across districts or cities', { kind }) : L('protests look coordinated across districts or cities'),
      L('violence or damage is reported'),
      upcoming.length ? L('protesters are detained at {kind} locations', { kind }) : L('protesters are detained at protest sites'),
    ] };
  } else if (up === 'Critical') {
    rise = { level: up, items: [L('violence or damage is confirmed at more than one place')] };
  }
  if (down === 'Low') {
    fall = { level: down, items: upcoming.length
      ? [L('the {kind} is withdrawn or postponed', { kind }), L('on-site mobilisation stops and no new calls to act appear')]
      : [L('on-site mobilisation stops and no new calls to act appear')] };
  } else if (down) {
    fall = { level: down, items: [L('reports of violence are not confirmed, and no new calls to act appear')] };
  }

  const defs = [
    [
      c.calls ? `${plural(L, c.calls, 'Calls to act: {n} post.', 'Calls to act: {n} posts.')}${refs.calls && refs.calls.length ? ` ${refStr(refs.calls, 3)}` : ''}` : L('Calls to act: none.'),
      c.mobilising ? `${plural(L, c.mobilising, 'Mobilising: {n} post.', 'Mobilising: {n} posts.')}${refs.mobilising && refs.mobilising.length ? ` ${refStr(refs.mobilising, 4)}` : ''}` : L('Mobilising: none.'),
    ].join('  ·  '),
    L('A call to act asks people to take part. Mobilising is a post reporting people gathering.'),
  ];
  return { surveillance, because, rise, fall, defs };
};

/* ------------------------------------------------------------------ TIMELINE ------------------------------------- */
/** One row per activity in the region, oldest first: what, where, who called it, its status and what the posts say happened. */
const buildTimeline = ({ L = plainL, acts = [], todayIso, and = 'and', max = 8 }) => (acts || []).filter((a) => !a.outside).slice().sort((x, y) => String(x.date).localeCompare(String(y.date))).slice(0, max).map((a) => {
  const status = activityStatus(a, todayIso);
  const out = dominantStatus(a);
  const past = Boolean(todayIso && a.date < todayIso);
  const outcomeText = { held: 'Took place', called_off: 'Called off', denied: 'Permission refused or declared unlawful', permitted: 'Permission granted' };
  const outcome = out ? L(outcomeText[out] || out) : (past ? L('No outcome reported') : L('Not yet held'));
  const places = activityPlaces(a);
  const support = Number(a.support) || (a.posts || []).length;
  let note;
  if (status === 'Confirmed') note = L('reported as held by {n} news outlets', { n: fmtN(a.confirmedBy) });
  else if (status === 'Not verified') note = L('no post reports the outcome');
  else note = `${plural(L, support, '{n} post', '{n} posts')}; ${L('no official source')}`;
  return {
    date: a.date, dateLabel: dayLabel(a.date), kind: L(a.kind || 'activity'), kindKey: a.kind, organiser: a.organiser || '', places, placeText: joinList(places, and) || a.place || '',
    status, statusLabel: L(status), outcome: `${outcome}${out === 'held' ? `; ${L('turnout not verified')}` : ''}`, note,
    posts: a.posts || [], carried: Boolean(a.carried), subject: a.subject || '', upcoming: !past,
  };
});

/* ------------------------------------------------------------------ ACTIONS -------------------------------------- */
const unitFor = (units, re, fallback) => (units || []).find((u) => re.test(u)) || fallback;
const guessTheme = (text) => {
  const t = String(text || '');
  if (/\b(verify|check|confirm|establish)\b[^.]{0,60}\b(took place|happened|outcome|turnout|arrests?|past|held)\b/i.test(t)) return 'v';
  if (/\b(traffic|essential services|public transport)\b/i.test(t)) return 'b';
  if (/\b(cyber|osint|digital|social media|online)\b/i.test(t)) return 'e';
  if (/\b(fact[- ]?check|rumou?rs?|misinformation|claims?|narratives?)\b/i.test(t)) return 'f';
  if (/\b(deploy\w*|bandobast|readiness|prepar\w*)\b/i.test(t)) return 'a';
  if (/\b(official (position|statement)|holding line)\b/i.test(t)) return 'j';
  if (/\b(liaison|outreach|organisers?|community|leaders)\b/i.test(t)) return 'c';
  return '';
};

/**
 * The actions the facts call for, each with a lead unit, a deadline, an "escalate if" trigger and the posts behind it.
 * Dates are relative to the report date: readiness 3 days before an activity, traffic 2 days before, checks 2 days from now.
 */
const deriveActions = ({ L = plainL, todayIso, units = [], and = 'and', upcoming = [], past = [], detentionPosts = [], platforms = [], total = 0, priorityAccounts = [], retainedAccounts = [], narratives = [], callPosts = [], level = 'Low' }) => {
  const u = (units && units.length ? units : DEFAULT_UNITS);
  const district = unitFor(u, /district|\bsho\b|\bsp\b|superintendent|range/i, L('District police'));
  const intel = unitFor(u, /intel/i, '');
  const traffic = unitFor(u, /traffic/i, L('Traffic police'));
  const cyber = unitFor(u, /cyber|osint/i, L('Cyber unit'));
  const pro = unitFor(u, /fact|\bpro\b|media|public relations|press/i, L('Public relations and fact-check unit'));
  const out = [];
  const lastUpcoming = upcoming.length ? upcoming[upcoming.length - 1].date : '';

  upcoming.slice(0, 2).forEach((a) => {
    const places = activityPlaces(a);
    const kind = L(a.kind || 'activity');
    const date = dayLabel(a.date);
    out.push({
      key: 'readiness', theme: 'a', derived: true,
      title: L('{date} {kind} readiness', { date, kind }),
      owner: district,
      doText: places.length
        ? L('Prepare a plan for {places}: deployment at key public places, markets and highways, and quick-response teams.', { places: joinList(places, and) })
        : L('Prepare a plan for the {kind}: deployment at key public places, markets and highways, and quick-response teams.', { kind }),
      escalate: places.length > 1
        ? L('a blockade or forced-shutdown call appears, or posts show coordination across places')
        : L('a blockade or forced-shutdown call appears, or the gathering spreads to other places'),
      by: deadlineBefore(todayIso, a.date, 3), posts: (a.posts || []).slice(0, 8),
    });
  });

  const pastDates = past.map((a) => a.date);
  if (pastDates.length || detentionPosts.length) {
    const both = pastDates.length && detentionPosts.length;
    out.push({
      key: 'verify', theme: 'v', derived: true,
      title: both ? L('Verify past events and the arrest report') : pastDates.length ? L('Verify past events') : L('Verify the arrest report'),
      owner: intel ? `${district} ${L('and')} ${intel}` : district,
      doText: pastDates.length
        ? L('Confirm what took place on {dates}: turnout, disruptions, and who was arrested or detained and where.', { dates: dateList(pastDates, and) })
        : L('Confirm who was arrested or detained, where and why, using the posts listed.'),
      escalate: L('a detention at a protest site is confirmed, or a disruption is found that the posts do not report'),
      by: todayIso ? addDays(todayIso, 2) : '',
      posts: uniq([...past.flatMap((a) => a.posts || []), ...detentionPosts]).slice(0, 8),
    });
  }

  const watching = upcoming.length || levelIndex(level) >= 1 || priorityAccounts.length;
  if (watching && platforms.length) {
    const top = platforms.slice(0, 2);
    const sum = top.reduce((t, p) => t + p.n, 0);
    const calc = top.length > 1 ? `${top.map((p) => `${p.name} ${fmtN(p.n)}`).join(' + ')} = ${fmtN(sum)}` : fmtN(sum);
    const acct = priorityAccounts.slice(0, 3).map((a) => `@${a.name} (${a.platform})`);
    const parts = [L('Watch {names} ({calc} of {total} posts) for blockade or gathering calls and for misinformation, and report daily.', { names: joinList(top.map((p) => p.name), and), calc, total: fmtN(total) })];
    if (acct.length) parts.push(L(acct.length === 1 ? 'Priority account: {names}.' : 'Priority accounts: {names}.', { names: joinList(acct, and) }));
    if (retainedAccounts.length) parts.push(L('Also keep watching accounts flagged in the previous report: {names}.', { names: joinList(retainedAccounts.slice(0, 3).map((n) => `@${n}`), and) }));
    out.push({
      key: 'digital', theme: 'e', derived: true,
      title: upcoming.length ? L('Digital monitoring until {date}', { date: dayLabel(lastUpcoming) }) : L('Digital monitoring'),
      owner: cyber, doText: parts.join(' '),
      escalate: priorityAccounts.length ? L('incitement or coordinated posting by a priority account') : L('incitement or coordinated posting appears'),
      by: 'daily', byUntil: lastUpcoming,
      posts: uniq([...priorityAccounts.flatMap((a) => (a.posts || []).slice(0, 4)), ...callPosts]).slice(0, 8),
    });
  }

  upcoming.filter((a) => ['bandh', 'rally', 'protest'].includes(a.kind)).slice(0, 2).forEach((a) => {
    const places = activityPlaces(a);
    out.push({
      key: 'traffic', theme: 'b', derived: true,
      title: L('Traffic and essential services on {date}', { date: dayLabel(a.date) }),
      owner: traffic,
      doText: places.length
        ? L('Keep public transport, emergency access and essential services running in {places}, with diversions agreed in advance.', { places: joinList(places, and) })
        : L('Keep public transport, emergency access and essential services running, with diversions agreed in advance.'),
      escalate: L('critical services are disrupted at any location'),
      by: deadlineBefore(todayIso, a.date, 2), posts: (a.posts || []).slice(0, 8),
    });
  });

  if (narratives.length) {
    const claims = narratives.slice(0, 3).map((n) => `“${clipText(n.text, 80)}”${n.posts && n.posts.length ? ` ${refStr(n.posts, 3)}` : ''}`).join('; ');
    out.push({
      key: 'factcheck', theme: 'f', derived: true,
      title: narratives.length === 1 ? L('Verify the claim in circulation') : L('Verify the claims in circulation'),
      owner: pro,
      doText: L('Check {claims} against official records, give the PRO a factual line, and follow responsible-reporting norms when media share it.', { claims }),
      escalate: L('the claim is picked up by news pages or by an account that calls for action'),
      by: todayIso ? addDays(todayIso, 2) : '', posts: uniq(narratives.slice(0, 3).flatMap((n) => n.posts || [])).slice(0, 8),
    });
  }
  return out;
};

const ORDER = { readiness: 0, verify: 1, j: 2, digital: 3, traffic: 4, c: 5, factcheck: 6, d: 7, g: 8, h: 9, i: 10 };
const rankOf = (a) => (a.derived ? ORDER[a.key] : (ORDER[a.theme] ?? 11));

/** Reads a model-written action ("Title — Lead unit" + detail ending "Escalate if ...") into the same shape as a derived one. */
const readModelAction = (a, { todayIso, lastUpcoming }) => {
  const parts = String(a.action || '').split(/\s+[—–]\s+/);
  const m = String(a.detail || '').match(/\s*(Escalate if[^]*?)$/i);
  const doText = (m ? String(a.detail).slice(0, m.index) : String(a.detail || '')).trim();
  const theme = /^[a-j]$/.test(a.theme || '') ? a.theme : guessTheme(`${parts[0]} ${doText}`);
  let by = isIso(a.by) && (!todayIso || a.by >= todayIso) ? a.by : '';
  if (!by && todayIso) {
    if (theme === 'c' && lastUpcoming) by = deadlineBefore(todayIso, lastUpcoming, 3);
    else if (theme === 'j' || !lastUpcoming) by = addDays(todayIso, 3);
    else by = deadlineBefore(todayIso, lastUpcoming, 2) < addDays(todayIso, 3) ? deadlineBefore(todayIso, lastUpcoming, 2) : addDays(todayIso, 3);
  }
  return {
    key: theme || 'other', theme, derived: false, title: parts[0].trim(), owner: parts.slice(1).join(' — ').trim(),
    doText, escalate: m ? m[1].replace(/^Escalate if\s*/i, '').replace(/[.\s]+$/, '') : '', by, posts: a.posts || [],
  };
};

const similarTitle = (a, b) => {
  const words = (t) => new Set(String(t || '').toLowerCase().split(/[—–-]/)[0].split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return false;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit += 1; });
  return hit / Math.min(A.size, B.size) >= 0.5;
};

/**
 * One ordered list: the derived actions first, then the model's actions for themes the derived ones do not cover.
 * Each item keeps the old `action` / `detail` fields too, so the slides and older readers still work.
 */
const planActions = ({ derived = [], model = [], todayIso, lastUpcoming = '', cap = 10 }) => {
  const covered = new Set(derived.map((a) => a.theme));
  const read = (model || []).map((a) => readModelAction(a, { todayIso, lastUpcoming }));
  const kept = [];
  read.forEach((a) => {
    if (!a.title || !a.doText) return;
    if (a.theme && covered.has(a.theme)) return;                       // the facts already give this action, with exact dates and posts
    if ([...derived, ...kept].some((x) => similarTitle(x.title, a.title))) return;
    kept.push(a);
  });
  return [...derived, ...kept].map((a, i) => ({ a, i })).sort((x, y) => rankOf(x.a) - rankOf(y.a) || x.i - y.i).slice(0, cap).map(({ a }) => ({
    ...a,
    action: a.owner ? `${a.title} — ${a.owner}` : a.title,
    detail: `${a.doText}${a.escalate ? ` Escalate if ${a.escalate}.` : ''}`,
  }));
};

/* ------------------------------------------------------------------ HISTORY -------------------------------------- */
const placesOverlap = (a, b) => {
  const A = new Set(activityPlaces(a).map(fold));
  return activityPlaces(b).some((p) => A.has(fold(p)));
};
/** The same real activity in two runs: same day and either the same kind or a shared place. */
const sameActivity = (a, b) => Boolean(a && b && a.date === b.date && (a.kind === b.kind || placesOverlap(a, b)));

const stableKey = (e) => String(e?.id ?? e?.url ?? '');

/**
 * What the next report needs from this one (kept inside the saved stats when the report is generated again):
 * date, post count, level, the activities with stable references to their posts, the flagged accounts and the claims.
 * Post numbers change between runs, so posts are kept by id and url, never by number.
 */
const snapshotFromRow = (row, levelOf) => {
  const stats = row?.stats;
  const sr = stats?.structured_report;
  if (!stats || !sr) return null;
  const f = sr.facts || null;
  const ev = Array.isArray(row.evidence_traceability) ? row.evidence_traceability : [];
  const byN = new Map(ev.map((e) => [Number((String(e.citationTag || '').match(/\d+/) || [])[0]), e]));
  const refsOf = (nums, extra = []) => {
    const seen = new Set();
    return [...(nums || []).map((n) => byN.get(Number(n))).filter(Boolean).map((e) => ({ id: e.id, url: e.url || null })), ...extra]
      .filter((r) => { const k = stableKey(r); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  };
  const generated = row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at;
  return {
    v: 1,
    generated_at: generated || null,
    timeframe: stats.timeframe || 'full',
    posts: Number(stats.total_unique_posts || stats.total_media_count || 0),
    level: f ? levelOf({ facts: f, stats }) : '',
    activities: (f?.activities || []).filter((a) => !a.outside).slice(0, 12).map((a) => ({
      date: a.date, kind: a.kind, organiser: a.organiser || '', place: a.place || '', places: activityPlaces(a), subject: a.subject || '',
      statuses: a.statuses || {}, confirmedBy: Number(a.confirmedBy || 0), support: Number(a.support || (a.posts || []).length),
      refs: refsOf(a.posts, a.carriedRefs || []),
    })),
    accounts: (f?.accounts || []).filter((a) => (a.calls || 0) > 0 || (a.violence || 0) > 0).slice(0, 10)
      .map((a) => ({ author: a.author, platform: a.platform, calls: a.calls || 0, violence: a.violence || 0 })),
    narratives: (sr.narrativesToWatch || []).slice(0, 5).map((n) => String(n.narrative || '').slice(0, 200)).filter(Boolean),
  };
};

/**
 * Activities the previous report found and this run did not are brought back (marked `carried`), so a past event is not
 * lost just because the latest posts no longer mention it. Their posts are matched to this run's numbers by id or url.
 */
const restoreActivities = (current, prev, idToNo, { timeframe = 'full' } = {}) => {
  const cur = Array.isArray(current) ? current : [];
  if (!prev || !Array.isArray(prev.activities) || (prev.timeframe || 'full') !== (timeframe || 'full')) return cur;
  const out = cur.slice();
  prev.activities.forEach((pa) => {
    if (!pa.date || out.some((a) => sameActivity(a, pa))) return;
    const posts = uniq((pa.refs || []).map((r) => idToNo.get(String(r.id)) ?? idToNo.get(String(r.url))).filter((n) => n != null)).slice(0, 8);
    out.push({
      date: pa.date, kind: pa.kind, organiser: pa.organiser || '', place: pa.place || '', places: pa.places || [], subject: pa.subject || '',
      statuses: pa.statuses || {}, confirmedBy: pa.confirmedBy || 0, posts, support: pa.support || posts.length, outside: false,
      carried: true, carriedRefs: pa.refs || [],
    });
  });
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

/* ------------------------------------------------------------------ CHANGE LOG ----------------------------------- */
const activityName = (a, L) => `${dayLabel(a.date)} ${L(a.kind || 'activity')}${activityPlaces(a).length ? ` ${L('at')} ${activityPlaces(a).slice(0, 3).join(', ')}` : ''}`;

/** What changed since the previous report, as short sentences. Empty when there is no earlier report to compare with. */
const buildChangeLog = ({ L = plainL, prev, cur, prevDate, curDate, and = 'and' }) => {
  if (!prev || !cur) return [];
  const lines = [];
  const delta = cur.posts - prev.posts;
  const change = delta > 0 ? L('{n} more', { n: fmtN(delta) }) : delta < 0 ? L('{n} fewer', { n: fmtN(-delta) }) : L('unchanged');
  lines.push(L('Previous report: {date}, {n} posts. This report: {date2}, {m} posts ({change}).', { date: prevDate, n: fmtN(prev.posts), date2: curDate, m: fmtN(cur.posts), change }));
  if (prev.level && cur.level) {
    lines.push(prev.level === cur.level ? L('Risk assessment unchanged: {a}.', { a: L(cur.level) }) : L('Risk assessment changed from {a} to {b}.', { a: L(prev.level), b: L(cur.level) }));
  }
  const now = (cur.activities || []).filter((a) => !a.outside);
  const before = prev.activities || [];
  const restored = now.filter((a) => a.carried);
  const added = now.filter((a) => !a.carried && !before.some((p) => sameActivity(a, p)));
  const removed = before.filter((p) => !now.some((a) => sameActivity(a, p)));
  const names = (list) => joinList(list.slice(0, 4).map((a) => activityName(a, L)), and);
  if (restored.length) lines.push(L('Restored from the previous report (not found in the latest posts): {list}.', { list: names(restored) }));
  if (added.length) lines.push(L('New since the previous report: {list}.', { list: names(added) }));
  if (removed.length) lines.push(L('Removed since the previous report: {list}.', { list: names(removed) }));
  if (!restored.length && !added.length && !removed.length) lines.push(L('No event was added, restored or removed.'));
  now.filter((a) => !a.carried).forEach((a) => {
    const p = before.find((x) => sameActivity(a, x));
    if (p && (p.organiser || a.organiser) && fold(p.organiser) !== fold(a.organiser) && lines.length < 12) {
      lines.push(L('Organiser of the {date} {kind} changed from {a} to {b}.', { date: dayLabel(a.date), kind: L(a.kind || 'activity'), a: p.organiser || L('not stated'), b: a.organiser || L('not stated') }));
    }
  });
  const placeSet = (acts) => new Map(acts.flatMap((a) => activityPlaces(a)).map((p) => [fold(p), p]));
  const A = placeSet(before); const B = placeSet(now.filter((a) => !a.carried));
  const newPlaces = Array.from(B.entries()).filter(([k]) => !A.has(k)).map(([, v]) => v).slice(0, 5);
  const goneRaw = Array.from(A.entries()).filter(([k]) => !B.has(k)).map(([, v]) => v);
  const gone = goneRaw.filter((p) => !restored.some((r) => activityPlaces(r).some((x) => fold(x) === fold(p)))).slice(0, 5);
  if (newPlaces.length) lines.push(L('Places newly named: {list}.', { list: joinList(newPlaces, and) }));
  if (gone.length) lines.push(L('Places no longer named: {list}.', { list: joinList(gone, and) }));
  const seen = new Set((cur.accounts || []).map((a) => fold(a)));
  const missing = (prev.accounts || []).filter((a) => !seen.has(fold(a.author))).slice(0, 4).map((a) => `@${a.author}`);
  if (missing.length) lines.push(L('Accounts flagged in the previous report and not seen in this run (kept on the watch list): {list}.', { list: joinList(missing, and) }));
  const claims = (cur.narratives || []).slice(0, 2);
  if (claims.length) lines.push(L('Not verified (no official source in the posts): {list}.', { list: joinList(claims.map((c) => `“${clipText(c, 60)}”`), and) }));
  const words = (t) => new Set(fold(t).split(' ').filter((w) => w.length >= 4));
  const gonePrev = (prev.narratives || []).filter((p) => !(cur.narratives || []).some((c) => { const A2 = words(p); const B2 = words(c); let h = 0; A2.forEach((w) => { if (B2.has(w)) h += 1; }); return A2.size && h / Math.min(A2.size, B2.size || 1) >= 0.5; })).slice(0, 3);
  if (gonePrev.length) lines.push(L('Claims in the previous report that no post repeats now: {list}.', { list: joinList(gonePrev.map((c) => `“${clipText(c, 60)}”`), and) }));
  return lines.slice(0, 10);
};

module.exports = {
  DEFAULT_UNITS, plainL, dayLabel, dateList, joinList, addDays, deadlineBefore, activityPlaces, isCalledOff, dominantStatus, activityStatus,
  splitActivities, nextLevel, lowerLevel, surveillanceOf, buildRiskBox, buildTimeline, deriveActions, planActions, guessTheme,
  sameActivity, snapshotFromRow, restoreActivities, buildChangeLog,
};
