import { readCatalogUrlFilters, matchPlatformSlug } from './catalogUrlFilters';

const PLATFORMS = [{ slug: 'x' }, { slug: 'youtube' }, { slug: 'facebook' }, { slug: 'instagram' }];

describe('readCatalogUrlFilters', () => {
  test('"View catalog" on a platform row asks for that platform', () => {
    expect(readCatalogUrlFilters('?platform=youtube')).toEqual({ platform: 'youtube', query: '' });
  });

  test('a handle search from the dashboard prefills the search box', () => {
    expect(readCatalogUrlFilters('?search=some_handle')).toEqual({ platform: null, query: 'some_handle' });
    expect(readCatalogUrlFilters('?search=%20spaced%20%26%20encoded%20')).toEqual({ platform: null, query: 'spaced & encoded' });
  });

  test('both together, case-insensitive platform', () => {
    expect(readCatalogUrlFilters('?platform=YouTube&search=abc')).toEqual({ platform: 'youtube', query: 'abc' });
  });

  test('nothing, "all" or blank values change nothing', () => {
    expect(readCatalogUrlFilters('')).toEqual({ platform: null, query: '' });
    expect(readCatalogUrlFilters(undefined)).toEqual({ platform: null, query: '' });
    expect(readCatalogUrlFilters('?platform=all')).toEqual({ platform: null, query: '' });
    expect(readCatalogUrlFilters('?platform=&search=')).toEqual({ platform: null, query: '' });
  });

  test('unrelated parameters are ignored', () => {
    expect(readCatalogUrlFilters('?status=active&foo=bar')).toEqual({ platform: null, query: '' });
  });
});

describe('matchPlatformSlug', () => {
  test('finds a configured platform and returns its own slug', () => {
    expect(matchPlatformSlug('youtube', PLATFORMS)).toBe('youtube');
    expect(matchPlatformSlug('YouTube', PLATFORMS)).toBe('youtube');
  });

  test('twitter and x are the same platform, either way round', () => {
    expect(matchPlatformSlug('twitter', PLATFORMS)).toBe('x');
    expect(matchPlatformSlug('x', [{ slug: 'twitter' }])).toBe('twitter');
    expect(matchPlatformSlug('fb', PLATFORMS)).toBe('facebook');
  });

  test('a platform that is not configured, or no list yet, matches nothing', () => {
    expect(matchPlatformSlug('reddit', PLATFORMS)).toBeNull();
    expect(matchPlatformSlug('youtube', [])).toBeNull();
    expect(matchPlatformSlug('youtube', undefined)).toBeNull();
    expect(matchPlatformSlug('', PLATFORMS)).toBeNull();
    expect(matchPlatformSlug(null, PLATFORMS)).toBeNull();
  });
});
