/**
 * The saved event summary, narrowed to the event's own location: the same posts, counts and wording rule as the
 * "location only" PDF reports, so the popup and the PDFs show the same numbers. Nothing here names a place or a tenant.
 */
const { classifyEvidence } = require('./scope');

const n0 = (v) => Number(v) || 0;
const numOf = (e, i) => Number((String(e.citationTag || '').match(/\d+/) || [i + 1])[0]);
const toneOf = (s) => {
  const x = String(s || '').toLowerCase();
  if (x.startsWith('pos') || x === 'praise') return 'positive';
  if (x.startsWith('neg') || x === 'criticism') return 'negative';
  return 'neutral';
};

const toRegionView = (summary) => {
  const { regionFilter } = require('./template');   // loaded on demand: the template is large and only needed here
  const stats = summary?.stats || {};
  const analysis = stats.structured_report || null;
  if (!analysis || !analysis.facts) return { ...summary, region_view: { applied: false, reason: 'no_facts' } };

  const evidence = (summary.evidence_traceability || []).map((e, i) => ({ ...e, n: numOf(e, i), text: String(e.text || '') }));
  const info = classifyEvidence(evidence, analysis, summary.event || {}, { strict: true });
  if (!info.reliable || !info.inEv.length) return { ...summary, region_view: { applied: false, reason: 'no_region_posts' } };

  const inNs = new Set(info.inEv.map((e) => e.n));
  const keep = (arr) => (arr || []).filter((n) => inNs.has(Number(n)));
  const authorOf = new Map(info.inEv.map((e) => [e.n, String(e.author || '').toLowerCase()]));
  const pc = (o) => ({ count: keep(o?.posts).length, posts: keep(o?.posts) });

  // Counts over the posts about the location.
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const engagement = { likes: 0, shares: 0, comments: 0, views: 0 };
  const risk = { critical: 0, high: 0, medium: 0, low: 0 };
  const platforms = {};
  info.inEv.forEach((e) => {
    sentiment[toneOf(e.sentiment)] += 1;
    engagement.likes += n0(e.likes ?? e.engagement?.likes);
    engagement.shares += n0(e.shares ?? e.engagement?.shares);
    engagement.comments += n0(e.comments ?? e.engagement?.comments);
    engagement.views += n0(e.views ?? e.engagement?.views);
    const rl = String(e.risk_level || 'low').toLowerCase();
    risk[rl in risk ? rl : 'low'] += 1;
    const p = String(e.platform || 'other').toLowerCase();
    platforms[p] = (platforms[p] || 0) + 1;
  });
  const total = info.inEv.length;
  const platformPct = Object.fromEntries(Object.entries(platforms).map(([k, v]) => [k, Math.round((100 * v) / total)]));

  // Facts narrowed to the same posts.
  const f = analysis.facts;
  const violence = pc(f.violence);
  const facts = {
    ...f,
    calls: pc(f.calls),
    violence: { ...violence, accounts: new Set(violence.posts.map((n) => authorOf.get(n) || n)).size },
    alleged: pc(f.alleged),
    detentions: pc(f.detentions),
    mobilising: pc(f.mobilising),
    callsOutside: { count: 0, posts: [] },
    violenceOutside: { count: 0, posts: [] },
    places: (f.places || []).map((p) => ({ ...p, posts: keep(p.posts) })).filter((p) => p.posts.length),
    activities: (f.activities || []).filter((a) => !a.outside).map((a) => ({ ...a, posts: keep(a.posts) })).filter((a) => a.posts.length),
    accounts: (f.accounts || []).map((a) => ({ ...a, posts: keep(a.posts) })).filter((a) => a.posts.length),
  };
  const narrowed = regionFilter(analysis, info.outsideNs, info.outsideNames);
  const structured = { ...narrowed, facts };

  return {
    ...summary,
    evidence_traceability: info.inEv,
    stats: {
      ...stats,
      total_unique_posts: total,
      total_media_count: total,
      relevant_posts_count: total,
      sentiment_counts: sentiment,
      total_engagement: engagement,
      risk_counts: risk,
      platform_counts: platforms,
      platform_percentages: platformPct,
      target_classification: {},
      structured_report: structured,
    },
    region_view: { applied: true, region: summary?.event?.location || '', inRegion: total, all: evidence.length },
  };
};

module.exports = { toRegionView };
