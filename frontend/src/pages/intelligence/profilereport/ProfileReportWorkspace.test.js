/**
 * Tools → Profile Report: the screen. Profile list with progress, the report button's lock, background refresh,
 * posts with filters, and delete.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = { list: jest.fn(), get: jest.fn(), posts: jest.fn(), refresh: jest.fn(), retry: jest.fn(), remove: jest.fn() };
const mockPlatformsApi = { listPlatforms: jest.fn() };
jest.mock('../../../api/profileReport.api', () => ({ profileReportApi: mockApi }));
jest.mock('../../../api/socialProfiles.api', () => ({ socialProfilesApi: mockPlatformsApi }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('./AddProfileDialog', () => ({ __esModule: true, default: ({ open, subject }) => (open ? <div data-add-dialog>{subject ? `editing ${subject.display_name}` : 'adding'}</div> : null) }));
jest.mock('./ProfileReportDialog', () => ({ __esModule: true, default: ({ open, profile }) => (open ? <div data-report-dialog>{`report for ${profile?.display_name}`}</div> : null) }));
jest.mock('../../../components/ui/button', () => ({ Button: ({ children, onClick, disabled, type, title, className, ...rest }) => <button type={type || 'button'} onClick={onClick} disabled={disabled} title={title} className={className} aria-label={rest['aria-label']}>{children}</button> }));
jest.mock('../../../components/ui/input', () => ({ Input: ({ value, onChange, placeholder, ...rest }) => <input value={value ?? ''} onChange={onChange || (() => {})} placeholder={placeholder} aria-label={rest['aria-label']} /> }));
jest.mock('../../../components/ui/progress', () => ({ Progress: ({ value }) => <div data-progress={value} /> }));
jest.mock('../../../components/ui/select', () => {
  const ReactLib = require('react');
  return {
    Select: ({ value, onValueChange, children }) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
    SelectContent: ({ children }) => <>{children}</>,
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
    SelectTrigger: () => null,
    SelectValue: () => null,
    __ReactLib: ReactLib,
  };
});
jest.mock('../../../components/ui/alert-dialog', () => {
  const Closed = ({ open, children }) => (open ? <div data-confirm>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    AlertDialog: Closed, AlertDialogContent: Pass, AlertDialogHeader: Pass, AlertDialogFooter: Pass, AlertDialogTitle: Pass, AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }) => <button type="button">{children}</button>,
    AlertDialogAction: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
  };
});

const acc = (id, platform, handle, extra = {}) => ({ id, platform, handle, is_draft: false, fetch_status: 'done', posts_fetched: 100, fetch_pages: 3, fetch_error: null, ...extra });
const subject = (id, name, extra = {}) => ({
  id, display_name: name, notes: null, status: 'active', accounts: [acc(id * 10, 'x', name.toLowerCase())],
  posts: 100, analysed: 60, skipped: 5, failed: 0, waiting: 35, collecting: 0, report: null, ...extra,
});
const POSTS = {
  total: 2, page: 1, limit: 30, total_pages: 1,
  posts: [
    { id: '2', platform: 'x', url: 'https://x.com/a/status/2', text: 'second post text', kind: 'original', media_urls: [], engagement: { likes: 12 }, posted_at: '2026-11-02T10:00:00Z', analysis_status: 'done', analysis: { sentiment: 'neutral', sentiment_api: 'negative', tone: 'dark humour', meaning: 'Joke: the caption blames someone for not answering while the picture shows a crashed bike.', risk_level: 'high', risk_score: 80, stance: 'oppose', category: 'protest', matched_keywords: ['bandh'], english_text: null }, image_text: 'RALLY 10am', image_description: 'A crowd with flags at a rally.', image_signals: ['crowd or protest', 'Flag with a sun'] },
    { id: '1', platform: 'x', url: null, text: 'first post text', kind: 'shared', media_urls: [], engagement: {}, posted_at: '2026-11-01T10:00:00Z', analysis_status: 'pending', analysis: null, image_text: null },
  ],
};

const flush = async (n = 8) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Profile Report workspace', () => {
  let container;
  let root;
  const text = () => container.textContent;
  const button = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(name));

  const render = async (subjects) => {
    mockApi.list.mockResolvedValue({ data: { subjects, supported_platforms: ['x', 'facebook'] } });
    const Workspace = require('./ProfileReportWorkspace').default;
    root = createRoot(container);
    await act(async () => { root.render(<Workspace />); });
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(400); }); await flush(); }
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPlatformsApi.listPlatforms.mockResolvedValue({ data: [{ slug: 'x', name: 'X' }, { slug: 'facebook', name: 'Facebook' }, { slug: 'reddit', name: 'Reddit' }] });
    mockApi.posts.mockResolvedValue({ data: POSTS });
    mockApi.remove.mockResolvedValue({ data: { ok: true } });
    mockApi.refresh.mockResolvedValue({ data: {} });
    mockApi.retry.mockResolvedValue({ data: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  test('with nothing saved it explains the tool and offers Add profile', async () => {
    await render([]);
    expect(text()).toContain('Study a profile in full');
    expect(text()).toContain('Every post is collected once');
    expect(button('Add profile').disabled).toBe(false);
    await act(async () => { button('Add profile').click(); });
    expect(container.querySelector('[data-add-dialog]').textContent).toBe('adding');
  });

  test('the list shows each profile\'s accounts, counts and what it is doing', async () => {
    await render([
      subject(1, 'Alpha'),
      subject(2, 'Bravo', { collecting: 1, accounts: [acc(20, 'x', 'bravo', { fetch_status: 'running', posts_fetched: 1240 })], waiting: 0, analysed: 0, posts: 1240 }),
      subject(3, 'Charlie', { waiting: 0, analysed: 95, skipped: 5, report: { generated_at: new Date().toISOString(), attention_level: 'High' } }),
    ]);
    const t = text();
    ['Alpha', 'Bravo', 'Charlie'].forEach((n) => expect(t).toContain(n));
    expect(t).toContain('X alpha');
    expect(t).toContain('60 analysed · 35 waiting');   // the card agrees with the figures (5 posts without text are skipped, not analysed)
    expect(t).toContain('Analysing posts');
    expect(t).toContain('Collecting posts');
    expect(t).toContain('Ready');
    expect(t).toContain('1,240');
    expect(t).toContain('High');
  });

  test('Reddit cannot be offered: only platforms with a timeline are passed to the dialog', async () => {
    await render([subject(1, 'Alpha')]);
    // supported list from the server is [x, facebook]; the Add button is enabled because at least one is collectable
    expect(button('Add profile').disabled).toBe(false);
  });

  test('the selected profile shows its progress, and its posts with their analysis', async () => {
    await render([subject(1, 'Alpha')]);
    expect(mockApi.posts).toHaveBeenCalledWith(1, expect.objectContaining({ page: 1, limit: 30 }));
    const t = text();
    expect(t).toContain('Posts collected');
    expect(t).toContain('65 of 100 posts analysed');   // 60 analysed + 5 without text
    expect(t).toContain('second post text');
    expect(t).toContain('risk high · 80');
    expect(t).toContain('bandh');
    expect(t).toContain('Image text');
    expect(t).toContain('RALLY 10am');
    expect(t).toContain('Picture');
    expect(t).toContain('A crowd with flags at a rally.');   // what the picture shows, apart from the words printed on it
    // how the post is meant: its tone, what it means, and that the sentiment was read in context
    expect(container.querySelector('[data-tone]').textContent).toBe('dark humour');
    expect(container.querySelectorAll('[data-tone]').length).toBe(1);   // the post that has not been read has no tone
    expect(container.querySelector('[data-meaning]').textContent).toContain('Reading');
    expect(container.querySelector('[data-meaning]').textContent).toContain('Joke: the caption blames someone for not answering');
    expect(container.querySelector('span[title^="The classifier said negative"]').textContent).toBe('neutral');
    expect(container.querySelectorAll('[data-picture-seen]').length).toBe(1);   // only the post with something flagged
    expect(container.querySelector('[data-picture-seen]').textContent).toContain('Seen in the picture');
    expect(container.querySelector('[data-picture-seen]').textContent).toContain('Flag with a sun');
    expect(t).toContain('Waiting for analysis');
    expect(t).toContain('shared');
    expect(t).toContain('Showing 1–2 of 2 posts');
  });

  test('Generate Report is locked until a post is analysed, then unlocked; a saved report reads View Report', async () => {
    await render([subject(1, 'Alpha', { analysed: 0, waiting: 100 })]);
    expect(button('Generate Report').disabled).toBe(true);
    expect(text()).toContain('still being analysed');
    await act(async () => { root.unmount(); });
    container.remove();

    container = document.createElement('div');
    document.body.appendChild(container);
    await render([subject(1, 'Alpha', { report: { generated_at: new Date().toISOString(), attention_level: 'Low' } })]);
    expect(button('View Report').disabled).toBe(false);
    await act(async () => { button('View Report').click(); });
    expect(container.querySelector('[data-report-dialog]').textContent).toBe('report for Alpha');
  });

  test('the report button looks like the event page\'s View Report: purple with a sparkle, and a green tick once a report exists', async () => {
    await render([subject(1, 'Alpha')]);
    const before = button('Generate Report');
    expect(before.className).toMatch(/border-purple-200/);
    expect(before.className).toMatch(/bg-purple-50/);
    expect(before.className).toMatch(/text-purple-700/);
    expect(before.querySelector('[data-report-ready]')).toBeNull();   // nothing to tick yet
    await act(async () => { root.unmount(); });
    container.remove();

    container = document.createElement('div');
    document.body.appendChild(container);
    await render([subject(1, 'Alpha', { report: { generated_at: new Date().toISOString(), attention_level: 'Low' } })]);
    const after = button('View Report');
    expect(after.className).toMatch(/border-purple-200/);
    expect(after.className).toMatch(/\brelative\b/);   // the tick sits on the corner
    expect(after.querySelector('[data-report-ready]')).toBeTruthy();
    expect(after.title).toBe('Report already generated: click to view');
  });

  describe('video posts: the video is brought in and shown, nothing is analysed for it', () => {
    const IG_VIDEO = 'https://scontent-bom1-1.cdninstagram.com/o1/v/t16/f2/m86/abc123.mp4?efg=eyJ2&oe=69999999';
    const videoPosts = (posts) => ({ total: posts.length, page: 1, limit: 30, total_pages: 1, posts });
    const base = { kind: 'original', engagement: { likes: 4, comments: 1 }, posted_at: '2019-05-23T09:00:00Z', analysis: null, image_text: null };
    const instagramVideo = { ...base, id: '10', platform: 'instagram', url: 'https://www.instagram.com/p/AbC/', text: '', media_type: 'reel', media_urls: [IG_VIDEO], analysis_status: 'skipped' };
    const loadWith = async (posts) => {
      mockApi.posts.mockResolvedValue({ data: videoPosts(posts) });
      await render([subject(1, 'Alpha')]);
    };

    test('a video post with no caption plays in the card, labelled Video post, with its original link', async () => {
      await loadWith([instagramVideo]);
      const v = container.querySelector('video[data-post-video]');
      expect(v).toBeTruthy();
      expect(v.getAttribute('src')).toBe(`${IG_VIDEO}#t=0.1`);   // first frame instead of a black box
      expect(v.hasAttribute('controls')).toBe(true);
      expect(v.getAttribute('preload')).toBe('metadata');        // nothing is downloaded until someone plays it
      expect(v.hasAttribute('autoplay')).toBe(false);
      expect(v.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(container.querySelector('[data-video-chip]').textContent).toBe('Video post');
      expect(text()).toContain('(no caption)');
      expect(text()).toContain('No text to analyse');            // the analysis did not change: only a caption is analysed
      expect(container.querySelector('article img')).toBeNull(); // no thumbnail beside a card that has its own player
      expect([...container.querySelectorAll('a')].some((a) => a.href === 'https://www.instagram.com/p/AbC/')).toBe(true);
    });

    test('a video with a caption shows the caption and the video', async () => {
      await loadWith([{ ...instagramVideo, id: '11', text: 'Rally highlights', analysis_status: 'done', analysis: { sentiment: 'positive', risk_level: 'low', risk_score: 3 } }]);
      expect(text()).toContain('Rally highlights');
      expect(container.querySelector('video[data-post-video]')).toBeTruthy();
      expect(text()).not.toContain('(no caption)');
    });

    test('if the platform\'s link no longer works the card says so and points to the original, instead of a broken box', async () => {
      await loadWith([instagramVideo]);
      await act(async () => { container.querySelector('video[data-post-video]').dispatchEvent(new Event('error')); });
      expect(container.querySelector('video[data-post-video]')).toBeNull();
      const note = container.querySelector('[data-video-unavailable]');
      expect(note.textContent).toContain('The video could not be loaded here');
      expect(note.querySelector('a').href).toBe('https://www.instagram.com/p/AbC/');
      expect(note.querySelector('a').textContent).toBe('Open the original');
    });

    test('a stream link (.m3u8) is handed to the player as it is', async () => {
      await loadWith([{ ...instagramVideo, id: '12', platform: 'x', url: 'https://x.com/a/status/12', media_type: 'video', media_urls: ['https://video.twimg.com/amplify_video/1/pl/abc.m3u8?tag=14'] }]);
      expect(container.querySelector('video[data-post-video]').getAttribute('src')).toBe('https://video.twimg.com/amplify_video/1/pl/abc.m3u8?tag=14');
    });

    test('YouTube: the thumbnail with a play button, and the player only opens when asked', async () => {
      await loadWith([{ ...base, id: '13', platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', text: 'A speech', media_type: 'video', media_urls: ['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'], analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 1 } }]);
      expect(container.querySelector('iframe')).toBeNull();      // a page of posts does not open a page of players
      const play = container.querySelector('[data-post-video-play]');
      expect(play).toBeTruthy();
      expect(play.querySelector('img').getAttribute('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
      await act(async () => { play.click(); });
      const frame = container.querySelector('iframe[data-post-video]');
      expect(frame.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
      expect(container.querySelector('[data-post-video-play]')).toBeNull();
    });

    test('a video the platform gave no file for keeps its picture, marked as a video, with the original link to watch it', async () => {
      await loadWith([{ ...base, id: '14', platform: 'facebook', url: 'https://www.facebook.com/watch/?v=1', text: 'Live from the venue', media_type: 'video', media_urls: ['https://scontent.xx.fbcdn.net/v/t15/cover.jpg'], analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 1 } }]);
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.querySelector('[data-video-chip]').textContent).toBe('Video post');
      expect(container.querySelector('article img').getAttribute('src')).toBe('https://scontent.xx.fbcdn.net/v/t15/cover.jpg');
      expect([...container.querySelectorAll('a')].some((a) => a.href === 'https://www.facebook.com/watch/?v=1')).toBe(true);
    });

    test('a video that was read: what it showed, how long it is and the writing on screen are labelled as the video\'s, beside the player', async () => {
      const read = { analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 4 }, image_text: 'VOTE FOR CHANGE', image_description: 'A crowd holds flags in a street.', image_signals: [], video: { seconds: 52, scenes: 3 } };
      await loadWith([{ ...instagramVideo, ...read, id: '20', text: 'Rally highlights' }]);
      const seen = container.querySelector('[data-video-seen]');
      expect(seen.textContent).toContain('Video · 52s');
      expect(seen.textContent).toContain('A crowd holds flags in a street.');
      expect(container.querySelector('[data-image-text]').textContent).toContain('On-screen text');
      expect(container.querySelector('[data-image-text]').textContent).toContain('VOTE FOR CHANGE');
      expect(container.querySelector('article').textContent).not.toMatch(/Image text|Picture/);   // not described as a still picture
      expect(container.querySelector('video[data-post-video]')).toBeTruthy();
      expect(container.querySelector('[data-video-chip]').textContent).toBe('Video post');
    });

    test('a video with no caption of its own: the writing on screen is the post\'s text, tagged Video post, beside its description', async () => {
      await loadWith([{
        ...instagramVideo, id: '23', text: '', analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 4 },
        image_text: 'VOTE FOR CHANGE', image_description: 'A crowd holds flags in a street.', image_signals: [], video: { seconds: 52, scenes: 3 },
      }]);
      const card = container.querySelector('article');
      expect(card.textContent).toContain('VOTE FOR CHANGE');
      expect(card.textContent).not.toContain('(no caption)');
      expect(card.querySelector('[data-video-chip]').textContent).toBe('Video post');
      expect(card.querySelector('[data-video-seen]').textContent).toContain('A crowd holds flags in a street.');
      expect(card.textContent).not.toMatch(/Image post|Picture/);
    });

    test('a video that was not read has no video line, and a picture post keeps its Picture and Image text labels', async () => {
      await loadWith([
        { ...instagramVideo, id: '21', text: 'caption only', analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 4 }, video: null },
        { ...base, id: '22', platform: 'instagram', url: 'https://www.instagram.com/p/Pic2/', text: 'A poster', media_type: 'post', media_urls: ['https://scontent.cdninstagram.com/v/t51/p.jpg'], analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 1 }, image_text: 'MEETING TODAY', image_description: 'A poster on a wall.', image_signals: [], video: null },
      ]);
      expect(container.querySelectorAll('[data-video-seen]').length).toBe(0);
      const [video, picture] = [...container.querySelectorAll('article')];
      expect(video.textContent).toContain('caption only');
      expect(picture.textContent).toContain('Image text');
      expect(picture.textContent).toContain('MEETING TODAY');
      expect(picture.textContent).toContain('Picture');
      expect(picture.textContent).toContain('A poster on a wall.');
      expect(picture.querySelector('[data-video-seen]')).toBeNull();
    });

    test('a plain picture post and a text post are unchanged: no player, no Video post label', async () => {
      await loadWith([
        { ...base, id: '15', platform: 'instagram', url: 'https://www.instagram.com/p/Pic/', text: 'A photo', media_type: 'post', media_urls: ['https://scontent.cdninstagram.com/v/t51/photo.jpg?x=1'], analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 1 } },
        { ...base, id: '16', platform: 'x', url: null, text: 'Only words', media_type: 'tweet', media_urls: [], analysis_status: 'done', analysis: { sentiment: 'neutral', risk_level: 'low', risk_score: 1 } },
      ]);
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('[data-video-chip]')).toBeNull();
      expect(container.querySelector('article img').getAttribute('src')).toBe('https://scontent.cdninstagram.com/v/t51/photo.jpg?x=1');
    });
  });

  test('while posts are being collected or analysed the numbers refresh by themselves', async () => {
    await render([subject(1, 'Alpha')]);
    const before = mockApi.list.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(5100); });
    await flush();
    expect(mockApi.list.mock.calls.length).toBeGreaterThan(before);
  });

  test('a finished profile is not polled', async () => {
    await render([subject(1, 'Alpha', { waiting: 0, analysed: 100 })]);
    const before = mockApi.list.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(mockApi.list.mock.calls.length).toBe(before);
  });

  test('Refresh posts is not offered while collecting; a stopped collection can be retried', async () => {
    await render([subject(1, 'Alpha', { collecting: 1, accounts: [acc(10, 'x', 'alpha', { fetch_status: 'running' })] })]);
    expect(button('Refresh posts').disabled).toBe(true);
    await act(async () => { root.unmount(); });
    container.remove();

    container = document.createElement('div');
    document.body.appendChild(container);
    await render([subject(1, 'Alpha', { accounts: [acc(10, 'x', 'alpha', { fetch_status: 'failed', fetch_error: 'The platform stopped returning posts. 300 posts were saved; Retry continues from there.' })] })]);
    expect(text()).toContain('300 posts were saved');
    await act(async () => { button('Retry').click(); });
    await flush();
    expect(mockApi.retry).toHaveBeenCalledWith(1);
    await act(async () => { button('Refresh posts').click(); });
    await flush();
    expect(mockApi.refresh).toHaveBeenCalledWith(1);
  });

  test('Edit opens the profile with its accounts', async () => {
    mockApi.get.mockResolvedValue({ data: subject(1, 'Alpha') });
    await render([subject(1, 'Alpha')]);
    await act(async () => { button('Edit').click(); });
    await flush();
    expect(mockApi.get).toHaveBeenCalledWith(1);
    expect(container.querySelector('[data-add-dialog]').textContent).toBe('editing Alpha');
  });

  test('delete asks first, says what goes with it, and then removes the profile', async () => {
    await render([subject(1, 'Alpha')]);
    await act(async () => { container.querySelector('button[aria-label="Delete profile"]').click(); });
    const confirm = container.querySelector('[data-confirm]');
    expect(confirm.textContent).toContain('Alpha and its 100 collected posts');
    expect(mockApi.remove).not.toHaveBeenCalled();
    await act(async () => { [...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click(); });
    await flush();
    expect(mockApi.remove).toHaveBeenCalledWith(1);
  });

  test('filters are applied on the server and a new filter starts from page 1', async () => {
    await render([subject(1, 'Alpha')]);
    const tone = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === 'Any tone'));
    await act(async () => {
      tone.value = 'negative';
      tone.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(mockApi.posts).toHaveBeenLastCalledWith(1, expect.objectContaining({ sentiment: 'negative', page: 1 }));
  });
});
