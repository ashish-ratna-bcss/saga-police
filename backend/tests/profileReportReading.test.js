/**
 * Profile Report: how each post is MEANT. A text model reads the caption, the writing on the picture, the picture
 * description and the classifier's answer together. It may soften a "negative" to "neutral" for plain humour and the like;
 * it never changes risk and never makes anything more negative. The model server is faked: nothing is called.
 */
process.env.LLM_BASE_URL = 'http://llm.test/v1';
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_MODEL = 'test-model';
delete process.env.PROFILE_REPORT_POST_READING;

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const reader = require('../src/modules/profile-report/profileReport.reading');

const reply = (obj) => JSON.stringify({ meaning: 'The post says something plain and clear.', tone: 'unclear', sentiment: 'neutral', hostile: false, confidence: 'high', is_joke: false, ...obj });

/* --------------------------------------------------------------------------------------- reading the reply -- */

test('a reply becomes the stored reading, with every answer from a fixed list', () => {
  const r = reader.parseReading(reply({ meaning: 'A greeting with a motivational message about patience.', tone: 'Motivational', sentiment: 'POSITIVE', confidence: 'High' }));
  assert.deepStrictEqual(r, {
    v: reader.READING_VERSION, meaning: 'A greeting with a motivational message about patience.', tone: 'motivational', joke: false, sentiment: 'positive', hostile: false, confidence: 'high',
  });
  const odd = reader.parseReading(reply({ tone: 'something invented', sentiment: 'furious', confidence: 'certain' }));
  assert.strictEqual(odd.tone, 'unclear');
  assert.strictEqual(odd.sentiment, 'neutral');
  assert.strictEqual(odd.confidence, 'low');
  assert.strictEqual(reader.parseReading('not json'), null);
  assert.strictEqual(reader.parseReading(JSON.stringify({ tone: 'humour' })), null, 'no meaning, no reading');
  assert.strictEqual(reader.parseReading(JSON.stringify({ meaning: 'ok' })), null, 'too short to be a meaning');
  assert.strictEqual(reader.parseReading('```json\n' + reply({ tone: 'greeting' }) + '\n```').tone, 'greeting');
  assert.strictEqual(reader.parseReading(reply({ hostile: 'true' })).hostile, true);
  assert.strictEqual(reader.parseReading(reply({ hostile: 'no' })).hostile, false);
});

test('a joke says so: the meaning starts with "Joke:"', () => {
  const j = reader.parseReading(reply({ is_joke: true, tone: 'humour', meaning: 'The caption blames someone for not answering while the picture shows a crashed bike.' }));
  assert.strictEqual(j.joke, true);
  assert.match(j.meaning, /^Joke: The caption blames/);
  const again = reader.parseReading(reply({ is_joke: true, tone: 'humour', meaning: 'Joke: already marked.' }));
  assert.strictEqual(again.meaning, 'Joke: already marked.', 'not marked twice');
});

test('humour is only believed when the model also said it is a joke; otherwise nothing is claimed', () => {
  const r = reader.parseReading(reply({ is_joke: false, tone: 'humour', confidence: 'high' }));
  assert.strictEqual(r.tone, 'unclear');
  assert.strictEqual(r.confidence, 'low');
  assert.strictEqual(reader.parseReading(reply({ is_joke: false, tone: 'dark humour' })).tone, 'unclear');
  assert.strictEqual(reader.parseReading(reply({ is_joke: false, tone: 'sarcasm' })).tone, 'sarcasm', 'sarcasm does not need the joke flag');
  assert.strictEqual(reader.parseReading(reply({ is_joke: false, tone: 'motivational' })).tone, 'motivational');
});

test('a joke whose picture shows someone hurt, trapped or motionless is dark humour', () => {
  const asked = reply({ is_joke: true, tone: 'humour' });
  assert.strictEqual(reader.parseReading(asked, { alerts: ['person trapped, hurt or motionless'] }).tone, 'dark humour');
  assert.strictEqual(reader.parseReading(asked, { alerts: ['blood or injury'] }).tone, 'dark humour');
  assert.strictEqual(reader.parseReading(asked, { alerts: ['crowd or protest'] }).tone, 'humour');
  assert.strictEqual(reader.parseReading(asked, { alerts: [] }).tone, 'humour');
  assert.strictEqual(reader.parseReading(reply({ is_joke: false, tone: 'motivational' }), { alerts: ['blood or injury'] }).tone, 'motivational', 'only jokes change');
});

/* ---------------------------------------------------------------------------- what it may change ---------- */

test('sentiment: only a confident, non-hostile joke or similar can soften "negative" to "neutral"', () => {
  const r = (over) => ({ meaning: 'x'.repeat(10), tone: 'dark humour', joke: true, sentiment: 'neutral', hostile: false, confidence: 'medium', ...over });
  assert.strictEqual(reader.finalSentiment('negative', r()), 'neutral');
  assert.strictEqual(reader.finalSentiment('negative', r({ tone: 'humour' })), 'neutral');
  assert.strictEqual(reader.finalSentiment('negative', r({ tone: 'motivational', joke: false })), 'neutral');
  assert.strictEqual(reader.finalSentiment('negative', r({ tone: 'greeting', joke: false })), 'neutral');
  // a joke is not the poster's own bad mood, even if the model also called the post negative
  assert.strictEqual(reader.finalSentiment('negative', r({ tone: 'dark humour', sentiment: 'negative' })), 'neutral');
  // a personal complaint is softened only when the model itself does not call it negative
  assert.strictEqual(reader.finalSentiment('negative', r({ tone: 'personal complaint', joke: false, sentiment: 'neutral' })), 'neutral');
  assert.strictEqual(reader.finalSentiment('negative', r({ tone: 'personal complaint', joke: false, sentiment: 'negative' })), 'negative');
});

test('sentiment: never made worse, never softened for anger, criticism, hostility, doubt or a failed reading', () => {
  const r = (over) => ({ meaning: 'x'.repeat(10), tone: 'dark humour', joke: true, sentiment: 'neutral', hostile: false, confidence: 'high', ...over });
  for (const tone of ['anger', 'criticism', 'mockery', 'grief', 'call to action', 'shows a group or cause', 'unclear']) {
    assert.strictEqual(reader.finalSentiment('negative', r({ tone, joke: false })), 'negative', tone);
  }
  assert.strictEqual(reader.finalSentiment('negative', r({ hostile: true })), 'negative', 'a joke that attacks someone stays negative');
  assert.strictEqual(reader.finalSentiment('negative', r({ confidence: 'low' })), 'negative');
  assert.strictEqual(reader.finalSentiment('negative', { failed: true }), 'negative');
  assert.strictEqual(reader.finalSentiment('negative', null), 'negative');
  // never more negative than the classifier said
  for (const classifier of ['positive', 'neutral']) {
    assert.strictEqual(reader.finalSentiment(classifier, r({ tone: 'anger', joke: false, sentiment: 'negative', hostile: true })), classifier);
    assert.strictEqual(reader.finalSentiment(classifier, r({ sentiment: 'negative' })), classifier);
  }
});

test('what the reader is told, and what it is told not to do', () => {
  const input = reader.buildInput({
    caption: '', printed: 'He is not picking my calls', picture: 'The vehicle is lying on its side.', kind: 'meme',
    classifier: { sentiment: 'negative', risk_level: 'low', category: 'Normal', summary: 'A complaint about calls.' },
  });
  assert.match(input, /CAPTION: \(none\)/);
  assert.match(input, /TEXT PRINTED ON THE PICTURE: "He is not picking my calls"/);
  assert.match(input, /PICTURE: The vehicle is lying on its side\./);
  assert.match(input, /PICTURE TYPE: meme/);
  assert.match(input, /CLASSIFIER SAYS: sentiment negative, risk low, category Normal; its note: A complaint about calls\./);
  assert.match(input, /"is_joke"/);
  const bare = reader.buildInput({ caption: 'Hello there', picture: '' });
  assert.match(bare, /\(no picture or no description\)/);
  assert.ok(!/PICTURE TYPE|CLASSIFIER SAYS/.test(bare));

  const s = reader.SYSTEM;
  assert.match(s, /Never name or identify a person shown in a picture/);
  assert.match(s, /do not rate risk/);
  assert.match(s, /most posts are NOT jokes/i);
  assert.match(s, /quote, a saying, a greeting, advice, a motivational message, a personal photo, a news item, and a statement of belief, loyalty or support are not jokes/);
  assert.match(s, /type is "meme" is a joke unless its words are plainly a serious message/);
  assert.match(s, /clothes or a uniform alone are not enough/);
  assert.match(s, /without saying what the group is or whether it is lawful/);
  assert.ok(!/Biafra|IPOB|Nigeria|motorcycle|sacks/i.test(s), 'no example from real posts inside the prompt: the model would copy it');
});

/* ---------------------------------------------------------------------------------- talking to the model ---- */

const modelSays = (obj) => ({ data: { choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] } });

test('a post is sent to the report model with no creativity and no thinking, and its reading comes back with the model and the time', async () => {
  let call = null;
  const original = axios.post;
  axios.post = async (url, body, cfg) => { call = { url, body, cfg }; return modelSays({ is_joke: false, meaning: 'A motivational greeting about patience.', tone: 'motivational', sentiment: 'positive', hostile: false, confidence: 'high' }); };
  try {
    const out = await reader.readPost({ caption: 'Happy New Year', picture: 'A red apple.' });
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.data.tone, 'motivational');
    assert.strictEqual(out.data.model, 'test-model');
    assert.ok(!Number.isNaN(Date.parse(out.data.at)));
  } finally { axios.post = original; }
  assert.strictEqual(call.url, 'http://llm.test/v1/chat/completions');
  assert.strictEqual(call.body.temperature, 0);
  assert.deepStrictEqual(call.body.chat_template_kwargs, { enable_thinking: false });
  assert.strictEqual(call.cfg.headers.Authorization, 'Bearer test-key');
  assert.ok(call.cfg.timeout <= 60000, 'it has a time limit of its own');
  assert.strictEqual(call.body.messages[0].role, 'system');
  assert.match(call.body.messages[1].content, /CAPTION: "Happy New Year"/);
});

test('a server that does not know the thinking flag is asked again without it', async () => {
  const seen = [];
  const original = axios.post;
  axios.post = async (url, body) => {
    seen.push(Boolean(body.chat_template_kwargs));
    if (body.chat_template_kwargs) throw Object.assign(new Error('bad request'), { response: { status: 400, data: {} } });
    return modelSays({ is_joke: false, meaning: 'A plain greeting card.', tone: 'greeting', sentiment: 'positive', hostile: false, confidence: 'high' });
  };
  try {
    const out = await reader.readPost({ caption: 'Hello' });
    assert.strictEqual(out.success, true);
  } finally { axios.post = original; }
  assert.deepStrictEqual(seen, [true, false]);
});

test('failures say whether trying again later can help', async () => {
  const original = axios.post;
  const fail = async (err) => { axios.post = async () => { throw err; }; return reader.readPost({ caption: 'Hello' }); };
  try {
    const busy = await fail(Object.assign(new Error('x'), { response: { status: 503, data: {} } }));
    assert.strictEqual(busy.success, false);
    assert.match(busy.error, /HTTP 503/);
    assert.strictEqual(busy.transient, true);
    assert.strictEqual((await fail(Object.assign(new Error('x'), { response: { status: 429, data: {} } }))).transient, true);
    assert.strictEqual((await fail(new Error('socket hang up'))).transient, true);
    assert.strictEqual((await fail(Object.assign(new Error('x'), { response: { status: 401, data: {} } }))).transient, false, 'a rejected key will not fix itself');
    axios.post = async () => modelSays('I cannot help with that.');
    const unreadable = await reader.readPost({ caption: 'Hello' });
    assert.strictEqual(unreadable.success, false);
    assert.strictEqual(unreadable.transient, false);
  } finally { axios.post = original; }
});

test('it can be switched off, and then nothing is asked', async () => {
  process.env.PROFILE_REPORT_POST_READING = '0';
  const original = axios.post;
  let asked = false;
  axios.post = async () => { asked = true; return modelSays({}); };
  try {
    assert.strictEqual(reader.enabled(), false);
    const out = await reader.readPost({ caption: 'Hello' });
    assert.strictEqual(out.success, false);
    assert.strictEqual(asked, false);
  } finally { axios.post = original; delete process.env.PROFILE_REPORT_POST_READING; }
  assert.strictEqual(reader.enabled(), true);
});
