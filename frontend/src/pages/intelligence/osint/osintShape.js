/**
 * Turns an OSINT investigation payload into display-ready names.
 *
 * The OSINT API identifies things by UUID and carries the readable text elsewhere:
 *   entities      { id, entity_type, value, normalized_value, confidence }
 *   relationships { source_entity_id, target_entity_id, relationship_type, confidence }
 *   evidence      { source_name, source_url, entity_type, raw_value, confidence }
 *   jobs          { source_name, status, error, result_count }
 *
 * The UI used to read `name` / `source` / `target` / `type`, which this API never sends, so it
 * fell back to showing raw UUIDs. Older field names are still accepted as a fallback.
 */

/** Readable text for an entity (or a bare string). Never prefers the UUID unless nothing else exists. */
export const entityLabel = (e) => {
  if (typeof e === 'string') return e;
  return String(e?.value ?? e?.normalized_value ?? e?.name ?? e?.label ?? e?.id ?? '');
};

/** "HAS_PROFILE" -> "has profile", "SocialProfile" -> "social profile". */
export const prettyType = (t) =>
  String(t ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

export const normalizeResult = (d) => {
  const entities = (d?.entities || []).map((e) => ({
    id: e?.id,
    label: entityLabel(e),
    type: prettyType(e?.entity_type ?? e?.type),
    confidence: e?.confidence,
  }));

  const labelById = new Map(entities.filter((e) => e.id != null).map((e) => [String(e.id), e.label]));
  const resolve = (ref) => (ref == null ? '' : labelById.get(String(ref)) || String(ref));

  const relationships = (d?.relationships || []).map((r) => ({
    source: resolve(r?.source_entity_id ?? r?.source),
    target: resolve(r?.target_entity_id ?? r?.target),
    type: prettyType(r?.relationship_type ?? r?.type),
    confidence: r?.confidence,
  }));

  const evidence = (d?.evidence || []).map((ev) => ({
    source: ev?.source_name || 'analysis engine',
    finding:
      ev?.description ||
      [prettyType(ev?.entity_type), ev?.raw_value ?? ev?.normalized_value].filter(Boolean).join(': '),
    url: isHttpUrl(ev?.source_url) ? ev.source_url : null,
    confidence: ev?.confidence,
  }));

  // One row per source the investigation tried, including ones that were unavailable.
  const sources = (d?.jobs || []).map((j) => ({
    name: j?.source_name ?? j?.source ?? 'unknown',
    status: j?.status || 'unknown',
    error: j?.error || null,
    count: j?.result_count ?? 0,
  }));

  return { entities, relationships, evidence, sources };
};
