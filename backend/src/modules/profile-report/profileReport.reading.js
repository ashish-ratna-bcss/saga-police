/**
 * Tools → Profile Report: how each post is MEANT.
 *
 * The sentiment service scores words: a joke about a man crushed under a load of sacks, or a quote that contains a rude
 * word, comes out "negative". A person reads the caption, the writing on the picture and the picture together and sees
 * a dark joke. This step does that: a text model is given the caption, the text printed on the picture, the description
 * of the picture and what the classifier concluded, and says in one sentence what the post means (explaining a joke),
 * what its tone is, and what the poster's own attitude is.
 *
 * What it is allowed to change is deliberately small. It never touches risk, stance or category. It may soften a
 * "negative" sentiment to "neutral", and only for a post that is clearly humour, sarcasm, a quote, a greeting, a personal
 * update or a personal complaint, that it is confident about, and that does not attack, threaten or demean anyone. It
 * never makes a post more negative. The classifier's own answer is kept beside the result.
 *
 * Settings: PROFILE_REPORT_POST_READING=0 switches it off. It uses the report model (LLM_BASE_URL, LLM_MODEL).
 */
const axios = require('axios');
const { getLLMConfig } = require('../../services/SummaryLLM');
const { extractJson } = require('../../services/SummaryLLM/eventSummary.prompt');
const { flatten } = require('../../services/media_post_analysis/imageText');

/** Bumped when the prompt changes enough that older readings should be made again. */
const READING_VERSION = 1;

const TONES = [
  'humour', 'dark humour', 'sarcasm', 'mockery', 'motivational', 'greeting', 'personal update', 'personal complaint', 'grief',
  'anger', 'criticism', 'shows a group or cause', 'call to action', 'news or information', 'advert', 'unclear',
];
/** Tones where a harsh word or a sad subject says little about the poster's own attitude. */
const SOFT_TONES = new Set(['humour', 'dark humour', 'sarcasm', 'motivational', 'greeting', 'personal update', 'personal complaint']);
const JOKE_TONES = new Set(['humour', 'dark humour', 'sarcasm']);

const enabled = () => {
  if (process.env.PROFILE_REPORT_POST_READING === '0') return false;
  try { return Boolean(getLLMConfig().baseUrl); } catch (e) { return false; }
};

const SYSTEM = `You are a police OSINT analyst reading ONE social media post. You are given the caption the account wrote, any text printed on the picture, a description of the picture, and what an automatic classifier concluded. Work out what the post as a whole means and how it is meant.
Rules: use only what is given and never invent facts. Never name or identify a person shown in a picture. Do not decide whether anything is legal and do not rate risk. If the caption and the picture together make a joke, say so and explain the joke in a few words. A joke, a quote or a complaint that mentions something sad, rude or violent is not hostile by that alone. Only say hostile is true if the post attacks, threatens, demeans or incites against a person or group. If there is too little to read, use tone "unclear" and confidence "low".
Jokes: most posts are NOT jokes. A quote, a saying, a greeting, advice, a motivational message, a personal photo, a news item, and a statement of belief, loyalty or support are not jokes, even when they come with a picture. A post is a joke only when it is plainly a meme or a punchline: the words or the picture are meant to be funny or ironic, for example a caption that complains about or blames something while the picture shows what really happened, often something unfortunate or absurd. A picture whose type is "meme" is a joke unless its words are plainly a serious message: look for the punchline in how the picture and the words fit. Otherwise, when in doubt, it is not a joke. When a caption blames or guesses a reason (for example that someone is busy or ignoring the poster) and the picture shows that person hurt, trapped or in trouble, the joke is that the picture shows the real reason: say exactly that in "meaning". Only for a plain joke is the tone "humour", or "dark humour" when the picture shows someone hurt, trapped, in trouble or dead; the poster's own attitude in a joke is neutral or positive, and the caption must not be taken as a real complaint.
Use "news or information" only for a news item, an announcement or a fact being shared; a plain photo of people with no message is "personal update".
Showing a group or cause: when the caption or the picture names a group or displays its flag, emblem or banner (clothes or a uniform alone are not enough) and shows no hostility, the tone is "shows a group or cause" (this is not about being supportive to a friend) and "meaning" says what is shown (the colours, the clothing, the words) without saying what the group is or whether it is lawful.`;

const OUTPUT = `Reply with ONE JSON object and nothing else, with the fields in this order:
{
 "is_joke": "true only if the post is plainly a joke or a meme with a punchline; otherwise false. A quote, greeting, advice, motivational message, personal photo, news item or statement of belief, loyalty or support is false.",
 "meaning": "ONE plain sentence for an officer: what the post is saying or showing. If is_joke is true, begin with 'Joke:' and explain what is funny and how the picture and the words fit. Otherwise say plainly what it says or shows. Do not just repeat the caption.",
 "tone": "one of: ${TONES.join(' / ')}",
 "sentiment": "positive, neutral or negative: the poster's own attitude, judged from the whole post",
 "hostile": false,
 "confidence": "high, medium or low"
}`;

const clip = (s, max) => Array.from(String(s || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

/** The facts one post is read from, as the text the model sees. */
const buildInput = ({ caption, printed, picture, kind, classifier }) => {
  const lines = [
    `CAPTION: ${clip(caption, 600) ? `"${clip(caption, 600)}"` : '(none)'}`,
    `TEXT PRINTED ON THE PICTURE: ${clip(printed, 500) ? `"${clip(printed, 500)}"` : '(none)'}`,
    `PICTURE: ${clip(picture, 700) || '(no picture or no description)'}`,
    ...(kind ? [`PICTURE TYPE: ${clip(kind, 30)}`] : []),
  ];
  if (classifier) {
    lines.push(`CLASSIFIER SAYS: sentiment ${classifier.sentiment || 'unknown'}, risk ${classifier.risk_level || 'unknown'}${classifier.category ? `, category ${classifier.category}` : ''}${classifier.summary ? `; its note: ${clip(classifier.summary, 200)}` : ''}`);
  }
  return `${lines.join('\n')}\n\n${OUTPUT}`;
};

const pick = (v, allowed, fallback) => {
  const s = String(v || '').trim().toLowerCase();
  return allowed.find((a) => a === s) || allowed.find((a) => s.includes(a)) || fallback;
};

/** The model's reply as the stored reading, or null when there is no usable meaning. `alerts` are what the picture description flagged. */
const parseReading = (reply, { alerts = [] } = {}) => {
  let obj = null;
  try { obj = extractJson(reply); } catch (e) { obj = null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const meaning = clip(flatten(obj.meaning), 400);
  if (meaning.length < 8) return null;
  const joke = obj.is_joke === true || /^true$/i.test(String(obj.is_joke));
  let tone = pick(obj.tone, TONES, 'unclear');
  let confidence = pick(obj.confidence, ['high', 'medium', 'low'], 'low');
  // humour is only believed when the model also said it is a joke; otherwise the two answers disagree and nothing is claimed
  if ((tone === 'humour' || tone === 'dark humour') && !joke) { tone = 'unclear'; confidence = 'low'; }
  // a joke whose picture shows someone hurt, trapped or in trouble is dark humour, whatever the model called it
  if (joke && tone === 'humour' && alerts.some((a) => /trapped|hurt|motionless|injur|blood/i.test(String(a)))) tone = 'dark humour';
  return {
    v: READING_VERSION,
    meaning: joke && !/^joke:/i.test(meaning) ? `Joke: ${meaning}` : meaning,
    tone,
    joke,
    sentiment: pick(obj.sentiment, ['positive', 'neutral', 'negative'], 'neutral'),
    hostile: obj.hostile === true || /^true$/i.test(String(obj.hostile)),
    confidence,
  };
};

/**
 * The sentiment a post ends up with. The classifier's answer stands unless the reading is confident that a "negative"
 * post is only humour, a quote, a greeting or a personal remark and attacks nobody; then it becomes "neutral".
 * Never more negative than the classifier said, and risk is not touched here at all.
 */
const finalSentiment = (classifierSentiment, reading) => {
  if (!reading || reading.failed || reading.hostile || reading.confidence === 'low') return classifierSentiment;
  if (classifierSentiment !== 'negative' || !SOFT_TONES.has(reading.tone)) return classifierSentiment;
  // a joke or sarcasm is not the poster's own bad mood, whatever the model also says about the subject of the joke
  if (JOKE_TONES.has(reading.tone) || reading.sentiment !== 'negative') return 'neutral';
  return classifierSentiment;
};

const callModel = async (messages, signal) => {
  const { baseUrl, apiKey, model, timeoutMs } = getLLMConfig();
  let thinkingOff = true;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await axios.post(
        `${baseUrl}/chat/completions`,
        { model, messages, max_tokens: 400, temperature: 0, ...(thinkingOff ? { chat_template_kwargs: { enable_thinking: false } } : {}) },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: Math.min(timeoutMs || 60000, 60000), ...(signal ? { signal } : {}) }
      );
      return { content: res.data?.choices?.[0]?.message?.content || '', model };
    } catch (err) {
      if (err?.response?.status === 400 && thinkingOff) { thinkingOff = false; continue; }   // a server that does not know the thinking flag
      throw err;
    }
  }
  throw new Error('model call failed');
};

/**
 * Read one post.
 * @returns {Promise<{ success: boolean, data?: object, error?: string, transient?: boolean }>}
 */
const readPost = async (input, { signal } = {}) => {
  if (!enabled()) return { success: false, error: 'Post reading is switched off' };
  try {
    const reply = await callModel([{ role: 'system', content: SYSTEM }, { role: 'user', content: buildInput(input) }], signal);
    const reading = parseReading(reply.content, { alerts: input.alerts || [] });
    if (!reading) return { success: false, error: 'The model gave no readable answer', transient: false };
    return { success: true, data: { ...reading, model: reply.model, at: new Date().toISOString() } };
  } catch (err) {
    const status = err?.response?.status;
    return { success: false, error: `Reading model${status ? ` HTTP ${status}` : ''}: ${String(err?.response?.data?.error?.message || err?.message || '').slice(0, 140)}`.trim(), transient: !status || status >= 500 || status === 429 };
  }
};

module.exports = { readPost, parseReading, buildInput, finalSentiment, enabled, TONES, SOFT_TONES, READING_VERSION, SYSTEM };
