const assert = require('assert');
const {
  getAnalyzableContentText,
  hasAnalyzableContent
} = require('./contentText');
const {
  performFullAnalysis,
  finalizeMonitoredContent,
  __private: { shouldSkipContentAnalysis }
} = require('../services/monitorService');

const run = async () => {
  assert.strictEqual(
    typeof shouldSkipContentAnalysis,
    'function',
    'monitoring service must expose its shared analysis-boundary filter'
  );
  assert.strictEqual(
    shouldSkipContentAnalysis({
      text: 'Facebook post',
      scraped_content: 'Media Count: 1'
    }),
    true,
    'monitoring analysis boundary must skip media-only placeholders'
  );

  assert.strictEqual(
    hasAnalyzableContent({
      text: '   \u200B ',
      scraped_content: ''
    }),
    false,
    'blank and zero-width text must be skipped'
  );

  assert.strictEqual(
    hasAnalyzableContent({
      text: 'Instagram post',
      scraped_content: 'Media Count: 3',
      media: [{ type: 'photo', url: 'https://example.test/photo.jpg' }]
    }),
    false,
    'generated Instagram/media placeholders must not be analyzed'
  );

  assert.strictEqual(
    hasAnalyzableContent({
      text: 'Instagram Story',
      scraped_content: 'Story expires: 2026-08-11T00:00:00.000Z'
    }),
    false,
    'generated story metadata must not be analyzed'
  );

  assert.strictEqual(
    hasAnalyzableContent({
      text: 'Facebook post',
      scraped_content: '!!!'
    }),
    false,
    'punctuation and generated Facebook placeholders are not content'
  );

  assert.strictEqual(
    hasAnalyzableContent({
      text: 'https://t.co/abcd1234',
      media: [{ type: 'photo', url: 'https://example.test/photo.jpg' }]
    }),
    false,
    'URL-only / media-only posts with no caption must be skipped'
  );

  assert.strictEqual(
    hasAnalyzableContent({
      text: '',
      scraped_content: '',
      media: [{ type: 'video', url: 'https://example.test/video.mp4' }]
    }),
    false,
    'blank text with attached media must be skipped'
  );

  assert.strictEqual(
    hasAnalyzableContent({ text: 'حیدرآباد میں احتجاج جاری ہے' }),
    true,
    'non-Latin captions are analyzable'
  );

  assert.strictEqual(
    hasAnalyzableContent({ text: '#Hyderabad 🚨' }),
    true,
    'hashtags and emoji carry analyzable meaning'
  );

  const quoted = getAnalyzableContentText({
    text: '',
    quoted_content: { text: 'Quoted warning about road closure' }
  });
  assert.strictEqual(
    quoted,
    'Quoted warning about road closure',
    'quoted post text must prevent a false empty-content skip'
  );

  const card = getAnalyzableContentText({
    text: '',
    url_cards: [{
      title: 'Flood warning issued',
      description: 'Residents should avoid the river road'
    }]
  });
  assert.strictEqual(
    card,
    'Flood warning issued Residents should avoid the river road',
    'link-card text must count as analyzable content'
  );

  const mixed = getAnalyzableContentText({
    text: 'Facebook post',
    scraped_content: 'Actual extracted article text'
  });
  assert.strictEqual(
    mixed,
    'Actual extracted article text',
    'real extracted text must survive placeholder filtering'
  );

  const mediaOnly = {
    id: 'internal-media-only',
    content_id: 'platform-media-only',
    text: 'Instagram post',
    scraped_content: 'Media Count: 1'
  };
  const directResult = await performFullAnalysis(mediaOnly, {}, []);
  assert.strictEqual(directResult.skipped, true);
  assert.strictEqual(directResult.skip_reason, 'no_analyzable_content');

  const finalizedResult = await finalizeMonitoredContent(mediaOnly, {}, []);
  assert.strictEqual(finalizedResult.skipped, true);
  assert.strictEqual(finalizedResult.analysis, null);
  assert.strictEqual(finalizedResult.alert, null);

  console.log('content analysis filter self-check: ALL PASSED');
  process.exit(0);
};

run().catch((error) => {
  console.error('content analysis filter self-check FAILED:', error);
  process.exit(1);
});
