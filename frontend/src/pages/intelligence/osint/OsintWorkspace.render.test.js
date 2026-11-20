/**
 * @jest-environment node
 *
 * Renders the real OsintWorkspace with a stored investigation and checks what the analyst would see.
 * Uses the server renderer (no DOM needed); the workspace reads its history from localStorage.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('../../../api', () => ({ osintApi: {} }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../../components/ui/button', () => ({ Button: ({ children }) => <button>{children}</button> }));
jest.mock('../../../components/ui/input', () => ({ Input: () => <input /> }));
jest.mock('../../../components/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }));
jest.mock('../../../components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => null,
}));

const ROOT = 'feb4200d-1559-41f7-9272-eea0626f53e6';
const REPLIT = 'b0f78140-993c-438f-a72c-23ded35d61ae';
const TWITTER = '3c041ce1-2555-408c-ac78-8f0a0f544b8c';
const RUN_ID = '4a5df2b2-2cef-45a0-b72c-1c1ede44fae9';

const storedRun = {
  id: RUN_ID,
  kind: 'general',
  group: 'investigation',
  target: 'analyst@example.com',
  status: 'partial',
  progress: 100,
  ts: Date.now(),
  result: {
    normalized_identifier: 'analyst@example.com',
    status: 'partial',
    jobs: [
      { source_name: 'holehe', status: 'completed', error: null, result_count: 2 },
      { source_name: 'public_web', status: 'unavailable', error: 'public_web is not available (dependency missing or unreachable)', result_count: 0 },
    ],
    entities: [
      { id: ROOT, entity_type: 'Email', value: 'analyst@example.com' },
      { id: REPLIT, entity_type: 'SocialProfile', value: 'replit.com' },
      { id: TWITTER, entity_type: 'SocialProfile', value: 'twitter.com' },
    ],
    relationships: [
      { source_entity_id: ROOT, target_entity_id: REPLIT, relationship_type: 'HAS_PROFILE' },
      { source_entity_id: ROOT, target_entity_id: TWITTER, relationship_type: 'HAS_PROFILE' },
    ],
    evidence: [],
  },
};

describe('OsintWorkspace report', () => {
  let html;
  beforeAll(() => {
    const store = { osint_runs_v2: JSON.stringify([storedRun]) };
    global.localStorage = { getItem: (k) => store[k] ?? null, setItem: () => {}, removeItem: () => {} };
    const OsintWorkspace = require('./OsintWorkspace').default;
    html = renderToStaticMarkup(<OsintWorkspace />);
  });

  test('graph nodes are the real names, not UUIDs', () => {
    expect(html).toContain('replit.com');
    expect(html).toContain('twitter.com');
    expect(html).not.toContain(ROOT);
    expect(html).not.toContain(REPLIT);
    expect(html).not.toContain(TWITTER);
  });

  test('the investigated email is the centre once, not duplicated as a second node', () => {
    // The first <svg> on the page is the search icon, so find the graph by its label.
    const start = html.indexOf('aria-label="Relationship graph"');
    const svg = html.slice(start, html.indexOf('</svg>', start));
    expect(start).toBeGreaterThan(-1);
    expect(svg.match(/analyst@example\.com/g)).toHaveLength(1);
  });

  test('edges carry the readable relationship name', () => {
    expect(html).toContain('has profile');
  });

  test('overview lists the sources searched, with the unavailable one flagged', () => {
    expect(html).toContain('Sources searched');
    // Names are lower-case in the markup; the "capitalize" class title-cases them on screen.
    expect(html).toContain('>holehe<');
    expect(html).toContain('2 results');
    expect(html).toContain('>public web<');
    expect(html).toContain('>unavailable<');
    // Hovering the unavailable source explains why.
    expect(html).toContain('public_web is not available (dependency missing or unreachable)');
  });

  test('a partial run is counted as done and has a Sources tab', () => {
    expect(html).toMatch(/>1<\/span> done/);
    expect(html).toContain('>Sources<');
  });
});
