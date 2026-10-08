/**
 * Automatic checks run on every report before a person approves it. Nothing here changes the report;
 * it lists what a reviewer should look at. level "error" blocks approval until the reviewer acknowledges it.
 */
const { stockPhrases, genericAction } = require('../../../services/SummaryLLM/styleLint');

const CITE = /\[Post #(\d+)\]/g;

const runQualityChecks = ({ summary, analysis, ev = [], scope = null } = {}) => {
  const issues = [];
  const add = (level, code, message, where = '') => issues.push({ level, code, message, where });
  const nums = new Set(ev.map((e) => e.n));
  const stats = summary?.stats || {};

  if (!ev.length) add('error', 'no_evidence', 'The report has no evidence posts.');
  if (!analysis) {
    add('error', 'no_analysis', 'The written analysis is missing. Regenerate the report.');
    return { ok: false, issues };
  }
  if (!String(analysis.bottomLine || '').trim()) add('error', 'no_bottom_line', 'The bottom line is empty.', 'Bottom line');

  // 1. Every cited post must exist in the evidence list.
  const textFields = [
    ['Bottom line', analysis.bottomLine], ['Situation', analysis.situation], ['Public order', analysis.publicOrder],
    ...(analysis.actions || []).map((a, i) => [`Action ${i + 1}`, `${a.action} ${a.detail}`]),
    ...(analysis.known || []).map((k, i) => [`Known ${i + 1}`, k.text]),
    ...(analysis.issueStrands || []).map((x, i) => [`Issue ${i + 1}`, `${x.title} ${x.demand} ${x.status}`]),
  ];
  textFields.forEach(([where, text]) => {
    const bad = [...String(text || '').matchAll(CITE)].map((m) => Number(m[1])).filter((n) => !nums.has(n));
    if (bad.length) add('error', 'bad_citation', `Cites ${bad.map((n) => `[Post #${n}]`).join(', ')}, which is not in the evidence.`, where);
  });
  const listed = (arr) => (arr || []).flatMap((x) => x.posts || []);
  listed(analysis.actions).concat(listed(analysis.known), listed(analysis.issueStrands), listed(analysis.narrativesToWatch)).forEach((n) => {
    if (!nums.has(n)) add('error', 'bad_citation', `A cited post number ${n} is not in the evidence.`);
  });

  // 2. Claims need a source.
  (analysis.actions || []).forEach((a, i) => { if (!(a.posts || []).length) add('warn', 'no_citation', 'No post is cited for this action.', `Action ${i + 1}`); });
  (analysis.narrativesToWatch || []).forEach((n, i) => { if (!(n.posts || []).length) add('warn', 'no_citation', 'No post is cited for this narrative.', `Narrative ${i + 1}`); });
  (analysis.issueStrands || []).forEach((x, i) => { if (!(x.posts || []).length) add('warn', 'no_citation', 'No post is cited for this issue.', `Issue ${i + 1}`); });

  // 3. Wording: stock phrases and generic actions.
  textFields.forEach(([where, text]) => {
    const hit = stockPhrases(text);
    if (hit.length) add('warn', 'stock_phrase', `Reads like boilerplate: "${hit[0]}".`, where);
  });
  (analysis.actions || []).forEach((a, i) => {
    const why = genericAction(a);
    if (why.length) add('warn', 'generic_action', `Action is generic: ${why.join('; ')}.`, `Action ${i + 1}`);
  });
  if (!(analysis.actions || []).length) add('warn', 'no_actions', 'There are no recommended actions.');

  // 4. Numbers must agree with each other.
  const monitored = Number(stats.total_unique_posts || stats.total_media_count || 0);
  const relevant = Number(stats.relevant_posts_count || 0);
  if (relevant && monitored && relevant > monitored) add('error', 'count_mismatch', `Relevant posts (${relevant}) exceed posts monitored (${monitored}).`);
  if (relevant && ev.length > relevant) add('warn', 'count_mismatch', `The evidence lists ${ev.length} posts but only ${relevant} are counted as relevant.`);
  const sent = stats.sentiment_counts || {};
  const sentSum = ['positive', 'neutral', 'negative'].reduce((s, k) => s + Number(sent[k] || 0), 0);
  if (monitored && sentSum > monitored) add('error', 'count_mismatch', `Tone counts add up to ${sentSum}, more than the ${monitored} posts monitored.`);

  // 5. Scope: most of the evidence should be about the event's own region.
  if (scope && scope.reliable && ev.length >= 10 && scope.outEv.length / ev.length > 0.5) {
    add('warn', 'mostly_outside_region', `${scope.outEv.length} of ${ev.length} evidence posts are about places outside the event region. Check the event keywords and location.`);
  }
  if (analysis.facts && !analysis.facts.byPost) add('warn', 'no_place_data', 'Place data is missing, so posts could not be split by region.');

  return { ok: !issues.some((i) => i.level === 'error'), issues };
};

module.exports = { runQualityChecks };
