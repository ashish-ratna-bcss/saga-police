import {
  NEEDS_PROXY_RE,
  proxyMediaUrl,
  proxyInstagramMediaUrl,
  proxyMediaUrlAlways,
  buildInstagramMediaCandidates,
} from './mediaProxy';

// Mock BACKEND_URL via the shared import module is evaluated from @/lib/api.
// These tests lock behaviour for the three legacy variants.

describe('shared mediaProxy', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  test('proxyMediaUrl leaves non-CDN urls untouched', () => {
    expect(proxyMediaUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
  });

  test('proxyMediaUrl proxies matching CDN hosts', () => {
    const url = 'https://scontent.cdninstagram.com/v/t51.2885-15/abc.jpg';
    const result = proxyMediaUrl(url);
    expect(result).toContain('/api/media/stream?url=');
    expect(result).toContain(encodeURIComponent(url));
    expect(NEEDS_PROXY_RE.test(url)).toBe(true);
  });

  test('proxyInstagramMediaUrl matches substring hosts and ignores twitter CDN', () => {
    const ig = 'https://instagram.fabc1-1.fna.fbcdn.net/v/t51/x.jpg';
    expect(proxyInstagramMediaUrl(ig)).toContain('/api/media/stream?url=');

    const twitter = 'https://pbs.twimg.com/media/ABC.jpg';
    expect(proxyInstagramMediaUrl(twitter)).toBe(twitter);
  });

  test('buildInstagramMediaCandidates includes proxied and original', () => {
    const url = 'https://cdninstagram.com/foo.jpg';
    const candidates = buildInstagramMediaCandidates([url]);
    expect(candidates.length).toBe(2);
    expect(candidates[0]).toContain('/api/media/stream?url=');
    expect(candidates[1]).toBe(url);
  });

  test('proxyMediaUrlAlways streams external urls and preserves data uris', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'soceye.in' },
    });

    expect(proxyMediaUrlAlways('data:image/png;base64,aaa')).toBe('data:image/png;base64,aaa');
    expect(proxyMediaUrlAlways('https://cdn.example.com/a.jpg')).toContain('/api/media/stream?url=');
    expect(proxyMediaUrlAlways('https://soceye.in/static/logo.png')).toBe(
      'https://soceye.in/static/logo.png'
    );
    expect(proxyMediaUrlAlways('https://soceye.in/uploads/a.png')).toContain('/api/media/stream?url=');
  });
});
