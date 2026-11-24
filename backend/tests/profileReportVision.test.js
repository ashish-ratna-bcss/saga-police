/**
 * Profile Report: describing what is IN a picture. The image reader's own timing statistics are never a description;
 * the vision model's description is what gets analysed and reported. The model server is faked: nothing is called.
 */
process.env.OCR_SERVICE_URL = 'http://gpu.test:8000';
delete process.env.PROFILE_REPORT_VISION_URL;
delete process.env.PROFILE_REPORT_PICTURE_DESCRIPTION;

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

// the downloader is taken from the OCR module when the vision module loads, so it is replaced first
const ocrModule = require('../src/services/media_post_analysis/extractOcr');
let downloads = [];
let downloadError = null;
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
ocrModule.downloadImageAsBase64 = async (url) => {
  downloads.push(url);
  if (downloadError) throw downloadError;
  return PNG_BYTES.toString('base64');
};

const { flatten, mediaTextOf, sceneOf, signalsOf } = require('../src/services/media_post_analysis/imageText');
const vision = require('../src/modules/profile-report/profileReport.vision');

/** exactly what the image reader returned as `summary` for a photo with no text (from a real report) */
const READER_STATISTICS = {
  text_blocks_detected: 0,
  blocks_dropped_below_threshold: 0,
  total_processing_time_sec: 0.399,
  stage_times_sec: { ocr: 0.399, total: 0.399 },
};

/* ----------------------------------------------------------------------- statistics are not a description ---- */

test('the image reader\'s timing statistics are never read as a description of the picture', () => {
  assert.strictEqual(mediaTextOf({ summary: READER_STATISTICS }), '');
  assert.strictEqual(mediaTextOf({ description: READER_STATISTICS }), '');
  assert.strictEqual(mediaTextOf({ description: READER_STATISTICS, summary: READER_STATISTICS }), '');
  assert.strictEqual(sceneOf({ summary: READER_STATISTICS }), '');
  assert.strictEqual(sceneOf({ description: READER_STATISTICS, summary: READER_STATISTICS }), '');
  // the generic flattener still reads whatever it is given; it is the description paths that refuse statistics
  assert.match(flatten(READER_STATISTICS), /text blocks detected: 0/);
  // a real description that happens to carry timings keeps its words and drops the timings
  assert.strictEqual(mediaTextOf({ summary: { scene: 'a crowd at a rally', total_processing_time_sec: 0.4, stage_times_sec: { ocr: 0.2 } } }), 'a crowd at a rally');
  assert.strictEqual(sceneOf({ description: { description: 'a man on a sofa', text_blocks_detected: 0 } }), 'a man on a sofa');
  // plain strings are untouched
  assert.strictEqual(mediaTextOf({ description: 'A poster.', summary: 'Protest notice.' }), 'A poster.\nProtest notice.');
});

test('a picture with no text and only statistics has nothing to analyse until the vision model describes it', () => {
  const reading = { summary: READER_STATISTICS, language: 'en' };
  assert.strictEqual(mediaTextOf(reading), '');
  assert.strictEqual(sceneOf(reading), '');
  const described = { ...reading, picture: { description: 'One man sits on a green sofa in a living room.', alerts: [], symbols: [] } };
  assert.strictEqual(sceneOf(described), 'One man sits on a green sofa in a living room.');
  assert.strictEqual(sceneOf({ ...described, description: 'A reader sentence.' }), 'One man sits on a green sofa in a living room.', 'the vision model\'s description comes first');
  assert.strictEqual(sceneOf({ ...reading, picture: { failed: true, error: 'x' } }), '', 'a failed description is not a description');
  assert.strictEqual(sceneOf({ ...reading, picture: { skipped: 'no_image' } }), '');
});

test('what stood out in the picture: alerts and symbols, each once', () => {
  assert.deepStrictEqual(signalsOf({ picture: { alerts: ['weapon', 'crowd or protest'], symbols: ['Blue flag with a sun', 'weapon'] } }), ['weapon', 'crowd or protest', 'Blue flag with a sun']);
  assert.deepStrictEqual(signalsOf({ picture: { alerts: [], symbols: [] } }), []);
  assert.deepStrictEqual(signalsOf({ picture: { failed: true } }), []);
  assert.deepStrictEqual(signalsOf(null), []);
  assert.strictEqual(signalsOf({ picture: { alerts: Array.from({ length: 20 }, (_, i) => `thing ${i}`) } }).length, 8);
});

/* ---------------------------------------------------------------------------------------- reading the reply -- */

test('the model\'s JSON reply becomes the stored picture record', () => {
  const p = vision.parsePicture(JSON.stringify({
    description: 'One man sits on a green sofa and looks at the camera.',
    people: 1,
    setting: 'indoor, a living room',
    objects: ['sofa', 'cushion'],
    symbols: [],
    text_visible: '',
    alerts: [],
  }));
  assert.deepStrictEqual(p, {
    description: 'One man sits on a green sofa and looks at the camera.', people: 1, setting: 'indoor, a living room', objects: ['sofa', 'cushion'], symbols: [], text_visible: '', alerts: [],
  });
});

test('alerts are kept only as the analyst\'s own words, symbols keep their wording, and every field is bounded', () => {
  const p = vision.parsePicture('```json\n' + JSON.stringify({
    description: 'A crowd with flags and one man holding a gun.',
    people: 9999,
    setting: 'outdoor, a street',
    objects: Array.from({ length: 20 }, (_, i) => `object ${i}`),
    symbols: ['Flag with a rising sun and the words FREE STATE'],
    alerts: ['a gun', 'big protest crowd', 'cat', 'uniformed police', 'blood on the road'],
  }) + '\n```');
  assert.strictEqual(p.people, 500, 'a count is capped');
  assert.deepStrictEqual(p.alerts, ['weapon', 'blood or injury', 'crowd or protest', 'uniform'], 'known alerts in a fixed order; "cat" is not an alert');
  assert.strictEqual(p.objects.length, 8);
  assert.deepStrictEqual(p.symbols, ['Flag with a rising sun and the words FREE STATE']);
  assert.ok(Array.from(vision.parsePicture(JSON.stringify({ description: 'x'.repeat(2000) })).description).length <= 400);
});

test('a reply that is not JSON still gives a description when it is a sentence; an empty or useless one gives none', () => {
  assert.strictEqual(vision.parsePicture('A man sitting on a green sofa in a living room.').description, 'A man sitting on a green sofa in a living room.');
  assert.strictEqual(vision.parsePicture('A man sitting on a green sofa.').people, null);
  assert.strictEqual(vision.parsePicture(''), null);
  assert.strictEqual(vision.parsePicture('ok'), null);
  assert.strictEqual(vision.parsePicture(JSON.stringify({ people: 2, objects: ['sofa'] })), null, 'no description, no record');
  assert.strictEqual(vision.parsePicture(JSON.stringify([1, 2, 3])), null);
});

test('the model is told to describe, never to identify, and its prompt is the one that was tried on the real model', async () => {
  let body = null;
  const original = axios.post;
  axios.post = async (url, b) => { body = b; return { data: { choices: [{ message: { content: JSON.stringify({ description: 'A test picture.' }) } }] } }; };
  try {
    await vision.describePicture('https://img.test/a.jpg', { postId: '1' });
  } finally { axios.post = original; }
  const system = body.messages[0].content;
  const user = body.messages[1].content[1].text;
  assert.match(system, /never identify anyone/);
  assert.match(user, /do not name or identify any person/i);
  assert.match(user, /Do not guess age, ethnicity, religion, nationality, caste or political affiliation/);
  assert.match(user, /weapon, blood or injury, fire or smoke, crowd or protest, uniform, child, nudity, drugs or alcohol/);
  assert.match(user, /Reply with ONE JSON object/);
});

/* --------------------------------------------------------------------------------- talking to the server ----- */

const reply = (content) => ({ data: { choices: [{ message: { content } }] } });

test('the vision server is found next to the image reader (port 8001) unless told otherwise', () => {
  assert.strictEqual(vision.baseUrl(), 'http://gpu.test:8001');
  assert.strictEqual(vision.enabled(), true);
  assert.strictEqual(vision.modelName(), 'Qwen/Qwen2.5-VL-7B-Instruct');
  process.env.PROFILE_REPORT_VISION_URL = 'http://vision.test:9000/v1/';
  try {
    assert.strictEqual(vision.baseUrl(), 'http://vision.test:9000');
  } finally { delete process.env.PROFILE_REPORT_VISION_URL; }
  process.env.PROFILE_REPORT_PICTURE_DESCRIPTION = '0';
  try {
    assert.strictEqual(vision.enabled(), false, 'it can be switched off');
  } finally { delete process.env.PROFILE_REPORT_PICTURE_DESCRIPTION; }
});

test('a picture is sent as an image the model can read, and its description comes back with the model and the time', async () => {
  downloads = [];
  let call = null;
  const original = axios.post;
  axios.post = async (url, body, cfg) => { call = { url, body, cfg }; return reply('{"description":"One man sits on a green sofa.","people":1,"setting":"indoor","objects":["sofa"],"symbols":[],"text_visible":"","alerts":[]}'); };
  try {
    const out = await vision.describePicture('https://img.test/p.jpg', { postId: '7' });
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.data.description, 'One man sits on a green sofa.');
    assert.strictEqual(out.data.model, 'Qwen/Qwen2.5-VL-7B-Instruct');
    assert.ok(!Number.isNaN(Date.parse(out.data.at)));
  } finally { axios.post = original; }
  assert.deepStrictEqual(downloads, ['https://img.test/p.jpg']);
  assert.strictEqual(call.url, 'http://gpu.test:8001/v1/chat/completions');
  assert.strictEqual(call.body.model, 'Qwen/Qwen2.5-VL-7B-Instruct');
  const image = call.body.messages[1].content[0];
  assert.strictEqual(image.type, 'image_url');
  assert.match(image.image_url.url, /^data:image\/png;base64,/, 'the type is read from the picture itself');
  assert.ok(call.cfg.timeout >= 30000, 'it has a time limit of its own');
  assert.ok(!('Authorization' in call.cfg.headers), 'no key unless one is configured');
});

test('failures say whether trying again can help', async () => {
  const original = axios.post;
  const fail = async (err) => { axios.post = async () => { throw err; }; return vision.describePicture('https://img.test/p.jpg', { postId: '1' }); };
  try {
    const busy = await fail(Object.assign(new Error('Request failed'), { response: { status: 503, data: { error: { message: 'engine overloaded' } } } }));
    assert.strictEqual(busy.success, false);
    assert.match(busy.error, /HTTP 503: engine overloaded/);
    assert.strictEqual(busy.nonRetryable, false, 'a busy server is tried again');

    const limited = await fail(Object.assign(new Error('Request failed'), { response: { status: 429, data: {} } }));
    assert.strictEqual(limited.nonRetryable, false);

    const dropped = await fail(new Error('socket hang up'));
    assert.match(dropped.error, /socket hang up/);
    assert.strictEqual(dropped.nonRetryable, false);

    const rejected = await fail(Object.assign(new Error('Request failed'), { response: { status: 400, data: { message: 'image could not be decoded' } } }));
    assert.match(rejected.error, /HTTP 400: image could not be decoded/);
    assert.strictEqual(rejected.nonRetryable, true, 'a picture the model rejects is not retried');

    axios.post = async () => reply('   ');
    const empty = await vision.describePicture('https://img.test/p.jpg', { postId: '1' });
    assert.strictEqual(empty.success, false);
    assert.strictEqual(empty.nonRetryable, true);
  } finally { axios.post = original; }
});

test('a picture that cannot be fetched is reported as such, and a missing or forbidden one is not retried', async () => {
  const original = axios.post;
  let posted = false;
  axios.post = async () => { posted = true; return reply('{"description":"x picture here"}'); };
  try {
    downloadError = Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } });
    const forbidden = await vision.describePicture('https://img.test/gone.jpg', { postId: '1' });
    assert.match(forbidden.error, /^Download failed: /);
    assert.strictEqual(forbidden.nonRetryable, true);
    downloadError = new Error('socket hang up');
    const flaky = await vision.describePicture('https://img.test/gone.jpg', { postId: '1' });
    assert.strictEqual(flaky.nonRetryable, false);
    assert.strictEqual(posted, false, 'the model is not asked about a picture that was never fetched');
  } finally { axios.post = original; downloadError = null; }
});

test('with picture descriptions switched off nothing is downloaded or sent', async () => {
  downloads = [];
  process.env.PROFILE_REPORT_PICTURE_DESCRIPTION = '0';
  const original = axios.post;
  let posted = false;
  axios.post = async () => { posted = true; return reply('{}'); };
  try {
    const out = await vision.describePicture('https://img.test/p.jpg', { postId: '1' });
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.nonRetryable, true);
    assert.deepStrictEqual(downloads, []);
    assert.strictEqual(posted, false);
  } finally { axios.post = original; delete process.env.PROFILE_REPORT_PICTURE_DESCRIPTION; }
});
