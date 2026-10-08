/**
 * Review state of a generated report: draft or approved, who prepared and approved it, the reviewer's edits and a history.
 * It is stored with the saved summary (stats.review), so it needs no extra table. Pure functions only; no database here.
 */
const normalizeReview = (r, fallback = {}) => ({
  status: r && r.status === 'approved' ? 'approved' : 'draft',
  version: Number(r && r.version) > 0 ? Number(r.version) : 1,
  edits: r && r.edits && typeof r.edits === 'object' && !Array.isArray(r.edits) ? r.edits : {},
  preparedBy: (r && r.preparedBy) || fallback.preparedBy || '',
  preparedAt: (r && r.preparedAt) || fallback.preparedAt || null,
  reviewedBy: (r && r.reviewedBy) || '',
  approvedBy: (r && r.approvedBy) || '',
  approvedAt: (r && r.approvedAt) || null,
  acknowledged: Array.isArray(r && r.acknowledged) ? r.acknowledged.map(String).slice(0, 30) : [],
  history: Array.isArray(r && r.history) ? r.history.slice(-50) : [],
});

/**
 * The review that goes with a newly generated report. A new generation is always a new draft, because the text changed;
 * the old version's edits are dropped, but the history keeps a line saying what was replaced.
 */
const freshReview = (prev, { preparedBy = '', preparedAt = null } = {}) => {
  const p = prev ? normalizeReview(prev) : null;
  const history = p
    ? [...p.history, { at: new Date().toISOString(), by: preparedBy || 'system', event: 'regenerated', note: p.status === 'approved' ? `Replaced approved version ${p.version}` : `Replaced draft version ${p.version}` }]
    : [];
  return normalizeReview({ status: 'draft', version: p ? p.version + 1 : 1, edits: {}, preparedBy, preparedAt, history });
};

module.exports = { normalizeReview, freshReview };
