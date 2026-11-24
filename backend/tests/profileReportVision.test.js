/**
 * Profile Report: describing what is IN a picture. The image reader's own timing statistics are never a description;
 * the vision model's description is what gets analysed and reported. The model server is faked: nothing is called.
 */
process.env.OCR_SERVICE_URL = 'http://gpu.test:8000';
delete process.env.PROFILE_REPORT_VISION_URL;
delete process.env.PROFILE_REPORT_PICTURE_DESCRIPTION;

const fs = require('fs');
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
    kind: 'photo',
    people: 1,
    setting: 'indoor, a living room',
    objects: ['sofa', 'cushion'],
    symbols: [],
    text_visible: '',
    alerts: [],
  }));
  assert.deepStrictEqual(p, {
    v: vision.PICTURE_VERSION, description: 'One man sits on a green sofa and looks at the camera.', kind: 'photo', people: 1, setting: 'indoor, a living room',
    objects: ['sofa', 'cushion'], flags: [], symbols: [], text_visible: '', alerts: [], not_identified: undefined,
  });
});

test('alerts are kept only as the analyst\'s own words, symbols keep their wording, and every field is bounded', () => {
  const p = vision.parsePicture('```json\n' + JSON.stringify({
    description: 'A crowd with flags and one man holding a gun.',
    kind: 'poster',
    people: 9999,
    setting: 'outdoor, a street',
    objects: Array.from({ length: 20 }, (_, i) => `object ${i}`),
    symbols: ['Banner with a rising sun and the words FREE STATE'],
    alerts: ['a gun', 'big protest crowd', 'cat', 'military uniform', 'blood on the road', 'person hurt'],
  }) + '\n```');
  assert.strictEqual(p.people, 500, 'a count is capped');
  assert.deepStrictEqual(p.alerts, ['weapon', 'blood or injury', 'person trapped, hurt or motionless', 'crowd or protest', 'military or police uniform'], 'known alerts in a fixed order; "cat" is not an alert');
  assert.strictEqual(p.objects.length, 8);
  assert.deepStrictEqual(p.symbols, ['Banner with a rising sun and the words FREE STATE'], 'a poster keeps the words on its banner');
  assert.ok(Array.from(vision.parsePicture(JSON.stringify({ description: 'x'.repeat(2000), kind: 'poster' })).description).length <= 700);
});

test('alerts: a baby in a bath, a selfie or a quote card raise nothing, and the old over-eager words are gone', () => {
  const names = vision.ALERTS.map(([name]) => name);
  assert.ok(!names.includes('child') && !names.includes('nudity') && !names.includes('uniform'), 'plain "child", "nudity" and "uniform" are not alerts any more');
  assert.ok(names.includes('person trapped, hurt or motionless') && names.includes('sexual or explicit nudity') && names.includes('child in danger'));
  for (const said of [['child'], ['nudity'], ['baby in a bath'], ['selfie']]) {
    assert.deepStrictEqual(vision.parsePicture(JSON.stringify({ description: 'A baby is sitting in a sink.', alerts: said })).alerts, [], JSON.stringify(said));
  }
  assert.deepStrictEqual(vision.parsePicture(JSON.stringify({ description: 'A person.', alerts: ['sexual or explicit nudity', 'child in danger'] })).alerts, ['sexual or explicit nudity', 'child in danger']);
});

test('people: a number, or a list the model gave instead; never NaN', () => {
  const people = (v) => vision.parsePicture(JSON.stringify({ description: 'A group of men stands outdoors.', people: v })).people;
  assert.strictEqual(people(3), 3);
  assert.strictEqual(people('4'), 4);
  assert.strictEqual(people([{ count: 2, gender: 'male' }, { count: 6, type: 'man' }]), 8);
  assert.strictEqual(people([]), null);
  assert.strictEqual(people('many'), null);
  assert.strictEqual(people(-2), null);
});

/* ------------------------------------------------------------------------------ nobody is named ----------- */

test('nobody is named: a name the model wrote for a person is removed and the description says so', () => {
  const named = vision.parsePicture(JSON.stringify({ description: 'A black-and-white photograph of Sigmund Freud leaning against a wall, holding a cigar.', kind: 'quote card', people: 1 }));
  assert.ok(!/Freud/.test(named.description), named.description);
  assert.match(named.description, /photograph of a person leaning against a wall/);
  assert.match(named.description, /\(Person not identified\.\)$/);
  assert.strictEqual(named.not_identified, true);

  for (const said of ['The man appears to be Bob Marley.', 'He looks like a famous actor.', 'She is a celebrity.', 'A famous singer stands on a stage.']) {
    const out = vision.anonymise(said);
    assert.strictEqual(out.changed, true, said);
    assert.ok(!/Bob Marley|famous|celebrity/i.test(out.text), `${said} -> ${out.text}`);
  }
  assert.strictEqual(vision.anonymise('A famous singer stands on a stage.').text, 'A person stands on a stage.', 'a sentence still starts with a capital');
});

test('a name printed on a quote card is the author of the words, not the person in the photo: it is left in the quote', () => {
  const out = vision.parsePicture(JSON.stringify({
    description: 'A black-and-white image of a man leaning on a wall. The text overlay is a quote attributed to Sigmund Freud.', kind: 'quote card', people: 1,
  }));
  assert.match(out.description, /quote attributed to Sigmund Freud/);
  assert.strictEqual(out.not_identified, undefined);
  assert.strictEqual(vision.anonymise('This is Master Canteen Square.').changed, false, 'a place is not a person');
  assert.strictEqual(vision.anonymise('A portrait of a man with dreadlocks.').changed, false);
});

test('the prompt itself forbids naming anyone, even a famous person, and any guess about what a flag stands for', () => {
  const sys = fs.readFileSync(require.resolve('../src/modules/profile-report/profileReport.vision'), 'utf8');
  assert.match(sys, /NEVER name or identify a real person: not from the face, not from a name printed in the picture, not even a famous person/);
  assert.match(sys, /A name printed on a quote card is the author of the words/);
  assert.match(sys, /man, woman, boy, girl, baby or child/, 'man and woman are allowed words');
  assert.match(sys, /never say what a flag, emblem or logo stands for/i);
});

/* ------------------------------------------------------------------------------ what the picture shows ---- */

test('states the model reported are said plainly in the description, so a fallen bike under a load is never "parked"', () => {
  const p = vision.parsePicture(JSON.stringify({
    description: 'A person is lying on the ground next to a motorcycle, with a large pile of sacks on the back of the bike.',
    kind: 'meme', people: 1, vehicle: 'lying on its side or crashed', main_person: 'lying down', load_or_cover: 'sacks piled on top of the motorcycle',
  }));
  // "the person is lying down" is left out here because the description already says the person is lying on the ground
  assert.match(p.description, /^The vehicle is lying on its side or has crashed; sacks piled on top of the motorcycle\. A person is lying on the ground/);
  const trapped = vision.parsePicture(JSON.stringify({ description: 'A man and a motorcycle are on a dirt road.', kind: 'photo', vehicle: 'lying on its side or crashed', main_person: 'trapped or buried under objects', load_or_cover: 'sacks' }));
  assert.match(trapped.description, /^The vehicle is lying on its side or has crashed; the person is trapped or buried under objects; sacks\./);
  // nothing is added when the description already says it, or when the states are unremarkable
  const said = vision.parsePicture(JSON.stringify({ description: 'The motorcycle is on its side and a man is lying on the ground.', kind: 'photo', vehicle: 'lying on its side or crashed', main_person: 'lying down' }));
  assert.ok(!/^The vehicle is lying/.test(said.description), said.description);
  const calm = vision.parsePicture(JSON.stringify({ description: 'A man sits in a car.', kind: 'photo', vehicle: 'upright and parked', main_person: 'sitting', load_or_cover: 'none' }));
  assert.strictEqual(calm.description, 'A man sits in a car.');
});

test('writing in an ordinary photo is not trusted (shirts and boxes get invented words); a meme, quote card or poster keeps its writing', () => {
  const photo = vision.parsePicture(JSON.stringify({
    description: "A man wearing a white t-shirt with 'sport' and 'RIGA' text stands outdoors.", kind: 'photo', text_visible: 'sport RIGA',
    symbols: ['The box features a yellow sun-like symbol and the word "NIGERIA".'],
  }));
  assert.strictEqual(photo.description, 'A man wearing a white t-shirt with some writing stands outdoors.');
  assert.strictEqual(photo.text_visible, '');
  assert.deepStrictEqual(photo.symbols, ['The box features a yellow sun-like symbol and some writing.']);
  const meme = vision.parsePicture(JSON.stringify({ description: "A baby sits in a sink. The text reads 'If you see my mom on Facebook'.", kind: 'meme', text_visible: 'If you see my mom on Facebook' }));
  assert.match(meme.description, /'If you see my mom on Facebook'/);
  assert.strictEqual(meme.text_visible, 'If you see my mom on Facebook');
  // a reply with no kind is treated like a photo
  assert.strictEqual(vision.parsePicture(JSON.stringify({ description: "A man in a shirt with 'ABC' on it." })).description, 'A man in a shirt with some writing on it.');
  assert.strictEqual(vision.dropQuotedWords('A man in a white shirt and red cap hands a box to another man.'), 'A man in a white shirt and red cap hands a box to another man.');
});

test('flags are asked separately and only phrases that really are a flag, banner, crest or emblem are kept', () => {
  assert.deepStrictEqual(vision.parseFlags('["flag with red, black, green bands", "crest with lions, sun"]'), ['flag with red, black, green bands', 'crest with lions, sun']);
  assert.deepStrictEqual(vision.parseFlags('```json\n["flag with green, black, red bands", "flag with green, black, red bands"]\n```'), ['flag with green, black, red bands'], 'each once');
  assert.deepStrictEqual(vision.parseFlags('[]'), []);
  assert.deepStrictEqual(vision.parseFlags('["white t-shirt with text", "red cap", "banner with a sun"]'), ['banner with a sun'], 'clothes are not flags');
  assert.deepStrictEqual(vision.parseFlags('no flag here'), []);
  const p = vision.parsePicture(JSON.stringify({ description: 'A man is draped in a flag.', kind: 'photo' }), { flags: ['flag with red, black, green bands'] });
  assert.deepStrictEqual(p.flags, ['flag with red, black, green bands']);
  assert.match(p.description, /Flags and emblems: flag with red, black, green bands\.$/);
});

test('a reply that is not JSON still gives a description when it is a sentence; an empty or useless one gives none', () => {
  assert.strictEqual(vision.parsePicture('A man sitting on a green sofa in a living room.').description, 'A man sitting on a green sofa in a living room.');
  assert.strictEqual(vision.parsePicture('A man sitting on a green sofa.').people, null);
  assert.strictEqual(vision.parsePicture(''), null);
  assert.strictEqual(vision.parsePicture('ok'), null);
  assert.strictEqual(vision.parsePicture(JSON.stringify({ people: 2, objects: ['sofa'] })), null, 'no description, no record');
  assert.strictEqual(vision.parsePicture(JSON.stringify([1, 2, 3])), null);
});

test('two requests go to the model at the same time: the description, and a narrow one about flags', async () => {
  const bodies = [];
  const original = axios.post;
  axios.post = async (url, b) => {
    bodies.push(b);
    const flags = /FLAG \(a piece of cloth/.test(b.messages[1].content[1].text);
    return reply(flags ? '["flag with red, black, green bands"]' : JSON.stringify({ description: 'A man is draped in a flag.', kind: 'photo', people: 1 }));
  };
  let out;
  try {
    out = await vision.describePicture('https://img.test/a.jpg', { postId: '1' });
  } finally { axios.post = original; }
  assert.strictEqual(bodies.length, 2);
  const main = bodies.find((b) => !/FLAG \(a piece of cloth/.test(b.messages[1].content[1].text));
  const flags = bodies.find((b) => /FLAG \(a piece of cloth/.test(b.messages[1].content[1].text));
  assert.strictEqual(main.temperature, 0, 'the same picture gives the same description');
  assert.match(main.messages[0].content, /never identify|NEVER name or identify a real person/);
  assert.match(main.messages[1].content[1].text, /Reply with ONE JSON object/);
  assert.match(main.messages[1].content[1].text, /"vehicle": "none, or one of: upright and parked, upright and moving, lying on its side or crashed, cannot tell"/);
  assert.match(main.messages[1].content[1].text, /A baby being bathed, people swimming, a family photo, a selfie or a quote card are NOT alerts/);
  assert.match(flags.messages[0].content, /never read or guess any words/);
  assert.ok(!/for example|e\.g\./i.test(flags.messages[1].content[1].text), 'no example in the flags question: the model would copy it');
  assert.strictEqual(out.success, true);
  assert.deepStrictEqual(out.data.flags, ['flag with red, black, green bands']);
  assert.match(out.data.description, /Flags and emblems: flag with red, black, green bands\./);
});

test('if only the flags question fails, the description is still kept', async () => {
  const original = axios.post;
  axios.post = async (url, b) => {
    if (/FLAG \(a piece of cloth/.test(b.messages[1].content[1].text)) throw new Error('socket hang up');
    return reply(JSON.stringify({ description: 'A man sits on a sofa.', kind: 'photo', people: 1 }));
  };
  try {
    const out = await vision.describePicture('https://img.test/a.jpg', { postId: '1' });
    assert.strictEqual(out.success, true);
    assert.deepStrictEqual(out.data.flags, []);
    assert.strictEqual(out.data.description, 'A man sits on a sofa.');
  } finally { axios.post = original; }
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
