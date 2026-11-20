import { entityLabel, prettyType, normalizeResult } from './osintShape';

// Shape copied from a real OSINT API investigation (email target, holehe + public_web), with the
// address replaced by an example.com one.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT = 'feb4200d-1559-41f7-9272-eea0626f53e6';
const REPLIT = 'b0f78140-993c-438f-a72c-23ded35d61ae';
const TWITTER = '3c041ce1-2555-408c-ac78-8f0a0f544b8c';

const investigation = {
  id: '4a5df2b2-2cef-45a0-b72c-1c1ede44fae9',
  input_identifier: 'analyst@example.com',
  identifier_type: 'EMAIL',
  normalized_identifier: 'analyst@example.com',
  status: 'partial',
  jobs: [
    { id: 'j1', source_name: 'holehe', status: 'completed', error: null, result_count: 2 },
    { id: 'j2', source_name: 'public_web', status: 'unavailable', error: 'public_web is not available (dependency missing or unreachable)', result_count: 0 },
  ],
  entities: [
    { id: ROOT, entity_type: 'Email', value: 'analyst@example.com', normalized_value: 'analyst@example.com', confidence: 1 },
    { id: REPLIT, entity_type: 'SocialProfile', value: 'replit.com', normalized_value: 'replit.com', confidence: 0.4 },
    { id: TWITTER, entity_type: 'SocialProfile', value: 'twitter.com', normalized_value: 'twitter.com', confidence: 0.4 },
  ],
  relationships: [
    { id: 'r1', source_entity_id: ROOT, target_entity_id: REPLIT, relationship_type: 'HAS_PROFILE', confidence: 0.4 },
    { id: 'r2', source_entity_id: ROOT, target_entity_id: TWITTER, relationship_type: 'HAS_PROFILE', confidence: 0.4 },
  ],
  evidence: [
    { id: 'e1', entity_id: REPLIT, source_name: 'holehe', source_type: 'public_association', raw_value: 'replit.com', normalized_value: 'replit.com', entity_type: 'SocialProfile', source_url: 'https://replit.com', confidence: 0.55 },
    { id: 'e2', entity_id: TWITTER, source_name: 'holehe', raw_value: 'twitter.com', entity_type: 'SocialProfile', source_url: 'javascript:alert(1)', confidence: 0.55 },
  ],
};

describe('osintShape', () => {
  test('entities are named by their value, never by their UUID', () => {
    const { entities } = normalizeResult(investigation);
    expect(entities.map((e) => e.label)).toEqual(['analyst@example.com', 'replit.com', 'twitter.com']);
    entities.forEach((e) => expect(UUID.test(e.label)).toBe(false));
    expect(entities[1].type).toBe('social profile');
  });

  test('relationships resolve entity ids to readable names and a readable type', () => {
    const { relationships } = normalizeResult(investigation);
    expect(relationships).toEqual([
      { source: 'analyst@example.com', target: 'replit.com', type: 'has profile', confidence: 0.4 },
      { source: 'analyst@example.com', target: 'twitter.com', type: 'has profile', confidence: 0.4 },
    ]);
  });

  test('an unknown id is shown as-is rather than dropped', () => {
    const { relationships } = normalizeResult({
      entities: [],
      relationships: [{ source_entity_id: 'gone-1', target_entity_id: 'gone-2', relationship_type: 'KNOWS' }],
    });
    expect(relationships[0]).toMatchObject({ source: 'gone-1', target: 'gone-2', type: 'knows' });
  });

  test('evidence names the source that found it, and only keeps http(s) links', () => {
    const { evidence } = normalizeResult(investigation);
    expect(evidence[0]).toMatchObject({ source: 'holehe', finding: 'social profile: replit.com', url: 'https://replit.com' });
    expect(evidence[1].url).toBeNull(); // javascript: URL from external data is dropped
  });

  test('sources list every source tried, including the unavailable one with its reason', () => {
    const { sources } = normalizeResult(investigation);
    expect(sources).toEqual([
      { name: 'holehe', status: 'completed', error: null, count: 2 },
      { name: 'public_web', status: 'unavailable', error: 'public_web is not available (dependency missing or unreachable)', count: 0 },
    ]);
  });

  test('older payloads that used name/source/target/type still render', () => {
    const { entities, relationships } = normalizeResult({
      entities: [{ name: 'alice' }, 'bob'],
      relationships: [{ source: 'alice', target: 'bob', type: 'KNOWS' }],
    });
    expect(entities.map((e) => e.label)).toEqual(['alice', 'bob']);
    expect(relationships[0]).toMatchObject({ source: 'alice', target: 'bob', type: 'knows' });
  });

  test('empty or missing result does not throw', () => {
    expect(normalizeResult(null)).toEqual({ entities: [], relationships: [], evidence: [], sources: [] });
    expect(normalizeResult({})).toEqual({ entities: [], relationships: [], evidence: [], sources: [] });
  });

  test('entityLabel and prettyType edge cases', () => {
    expect(entityLabel('plain')).toBe('plain');
    expect(entityLabel({ id: 'only-id' })).toBe('only-id');
    expect(entityLabel(null)).toBe('');
    expect(prettyType('HAS_PROFILE')).toBe('has profile');
    expect(prettyType('SocialProfile')).toBe('social profile');
    expect(prettyType(undefined)).toBe('');
  });
});
