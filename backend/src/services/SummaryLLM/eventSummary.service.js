const axios = require('axios');
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');

const getLLMConfig = () => {
  const baseUrl = (process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
  const apiKey = (process.env.LLM_API_KEY || '').trim();
  const model = (process.env.LLM_MODEL || 'qwen3-14b').trim();

  if (!baseUrl) {
    const err = new Error('LLM_BASE_URL is not configured in environment (.env).');
    err.status = 500;
    throw err;
  }

  return { baseUrl, apiKey, model };
};

/**
 * Strips reasoning / think tags from modern LLM outputs (e.g. Qwen, DeepSeek).
 */
const cleanLLMOutput = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip outer markdown blocks if LLM accidentally wrapped the whole document
  if (text.startsWith('```markdown')) {
    text = text.replace(/^```markdown\s*/i, '').replace(/```$/i, '').trim();
  }
  return text;
};

/**
 * Safely parse numeric engagement from engagement JSON.
 */
const getEngagementTotal = (eng) => {
  if (!eng || typeof eng !== 'object') return 0;
  const likes = Number(eng.likes || eng.like_count || eng.favorite_count || 0) || 0;
  const reposts = Number(eng.retweets || eng.reposts || eng.shares || eng.share_count || 0) || 0;
  const comments = Number(eng.replies || eng.comments || eng.comment_count || 0) || 0;
  const views = Number(eng.views || eng.view_count || 0) || 0;
  return likes + reposts + comments + Math.floor(views / 10);
};

/**
 * Generate comprehensive AI Executive Summary for an event using telemetry and LLM.
 * Fetches and analyzes ALL rows (N rows) for the event from the database.
 *
 * @param {number|string} eventId
 * @param {object} [options]
 */
const generateEventSummary = async (eventId, { db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(eventId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const err = new Error('Invalid event ID');
    err.status = 400;
    throw err;
  }

  // 1. Fetch Event details
  const event = await prisma.social_media_events.findUnique({
    where: { id: numericId },
  });
  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  // 2. Fetch ALL Event Media rows without arbitrary limit
  // We select only needed columns for high performance even with large N
  const mediaRows = await prisma.social_media_event_media.findMany({
    where: { event_id: numericId },
    select: {
      id: true,
      platform: true,
      text: true,
      author_name: true,
      author_handle: true,
      engagement: true,
      posted_at: true,
      analysis_result: true,
    },
    orderBy: [{ posted_at: 'desc' }, { id: 'desc' }],
  });

  const totalMediaCount = mediaRows.length;

  // 3. Compute telemetry aggregations across ALL N rows
  const platformCounts = {};
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const stanceCounts = { support: 0, oppose: 0, neutral: 0 };
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  let totalEngagement = {
    likes: 0,
    shares: 0,
    comments: 0,
    views: 0,
  };

  let earliestPost = null;
  let latestPost = null;

  // Categorized candidates for stratified LLM context sampling
  const highRiskPosts = [];
  const highViralPosts = [];
  const criticalNegativePosts = [];
  const recentPosts = [];

  for (const m of mediaRows) {
    // Platform
    const p = String(m.platform || 'unknown').toLowerCase();
    platformCounts[p] = (platformCounts[p] || 0) + 1;

    // Dates
    if (m.posted_at) {
      const dt = new Date(m.posted_at);
      if (!earliestPost || dt < earliestPost) earliestPost = dt;
      if (!latestPost || dt > latestPost) latestPost = dt;
    }

    // Engagement totals
    const eng = m.engagement || {};
    totalEngagement.likes += Number(eng.likes || eng.like_count || 0) || 0;
    totalEngagement.shares += Number(eng.shares || eng.retweets || eng.share_count || 0) || 0;
    totalEngagement.comments += Number(eng.comments || eng.replies || eng.comment_count || 0) || 0;
    totalEngagement.views += Number(eng.views || eng.view_count || 0) || 0;

    // Analysis tags
    const analysis = m.analysis_result || {};
    const sent = String(analysis.sentiment || 'neutral').toLowerCase();
    if (sent.includes('pos')) sentimentCounts.positive++;
    else if (sent.includes('neg')) sentimentCounts.negative++;
    else sentimentCounts.neutral++;

    const st = String(analysis.stance || 'neutral').toLowerCase();
    if (st.includes('support') || st.includes('pro')) stanceCounts.support++;
    else if (st.includes('oppose') || st.includes('anti')) stanceCounts.oppose++;
    else stanceCounts.neutral++;

    // Risk classification
    let rk = String(analysis.risk_level || '').toLowerCase();
    if (!rk) {
      const score = Number(analysis.risk_score || 0);
      if (score >= 85) rk = 'critical';
      else if (score >= 65) rk = 'high';
      else if (score >= 35) rk = 'medium';
      else rk = 'low';
    }
    if (rk.includes('crit')) riskCounts.critical++;
    else if (rk.includes('high')) riskCounts.high++;
    else if (rk.includes('med')) riskCounts.medium++;
    else riskCounts.low++;

    // Format post snippet for sampling
    if (m.text && m.text.trim().length > 10) {
      const snippet = {
        id: String(m.id),
        platform: m.platform,
        author: m.author_name || m.author_handle || 'Unknown',
        text: m.text.slice(0, 220).replace(/\s+/g, ' ').trim(),
        sentiment: analysis.sentiment || 'neutral',
        risk_level: rk || 'low',
        engagementScore: getEngagementTotal(m.engagement),
        postedAt: m.posted_at,
      };

      if (rk === 'critical' || rk === 'high') {
        highRiskPosts.push(snippet);
      } else if (snippet.engagementScore > 100) {
        highViralPosts.push(snippet);
      } else if (sent.includes('neg')) {
        criticalNegativePosts.push(snippet);
      }

      if (recentPosts.length < 15) {
        recentPosts.push(snippet);
      }
    }
  }

  // 4. Stratified selection of sample posts for LLM prompt
  // Takes the most critical high-risk posts, viral posts, negative sentiment posts, and latest ground posts
  highViralPosts.sort((a, b) => b.engagementScore - a.engagementScore);
  const selectedSnippets = [];
  const seenIds = new Set();

  const addSnippet = (s) => {
    if (!s || seenIds.has(s.id)) return;
    seenIds.add(s.id);
    selectedSnippets.push(s);
  };

  highRiskPosts.slice(0, 15).forEach(addSnippet);
  highViralPosts.slice(0, 12).forEach(addSnippet);
  criticalNegativePosts.slice(0, 10).forEach(addSnippet);
  recentPosts.slice(0, 10).forEach(addSnippet);

  // Keywords list
  let keywordsList = [];
  try {
    if (Array.isArray(event.keywords)) {
      keywordsList = event.keywords.map((k) => (typeof k === 'string' ? k : k?.keyword)).filter(Boolean);
    }
  } catch {}

  // 5. Construct Prompt Context
  const { baseUrl, apiKey, model } = getLLMConfig();

  const userContext = `
EVENT DETAILS:
- Event Name: ${event.name}
- Description: ${event.description || 'Not provided'}
- Monitored Location: ${event.location || 'General'}
- Tracked Keywords: ${keywordsList.join(', ') || 'General queries'}
- Platforms Monitored: ${(event.platforms || []).join(', ') || 'All major social networks'}
- Status: ${event.monitoring_status || 'started'}

AGGREGATED TELEMETRY ACROSS ALL ${totalMediaCount} INGESTED POSTS:
- Total Posts Ingested & Analyzed: ${totalMediaCount}
- Active Date Range: ${earliestPost ? earliestPost.toLocaleDateString() : 'N/A'} to ${latestPost ? latestPost.toLocaleDateString() : 'N/A'}
- Platform Distribution: ${JSON.stringify(platformCounts)}
- Public Sentiment Distribution: Positive: ${sentimentCounts.positive}, Neutral/News: ${sentimentCounts.neutral}, Negative: ${sentimentCounts.negative}
- Narrative Stance: Supporting: ${stanceCounts.support}, Opposing: ${stanceCounts.oppose}, Neutral: ${stanceCounts.neutral}
- Threat & Risk Level: Critical: ${riskCounts.critical}, High: ${riskCounts.high}, Medium: ${riskCounts.medium}, Low: ${riskCounts.low}
- Total Ground Engagement: Likes: ${totalEngagement.likes}, Shares: ${totalEngagement.shares}, Comments: ${totalEngagement.comments}, Views: ${totalEngagement.views}

STRATIFIED GROUND INTELLIGENCE EVIDENCE (Selected from all ${totalMediaCount} posts):
${selectedSnippets.length > 0 ? selectedSnippets.map((s, idx) => `[${idx + 1}] (${s.platform.toUpperCase()}) ${s.author}: "${s.text}" [Sentiment: ${s.sentiment}, Risk: ${s.risk_level}, Impact: ${s.engagementScore}]`).join('\n') : 'No text posts available yet in the database.'}
`.trim();

  const systemPrompt = `You are a Senior Strategic OSINT Analyst.
Your objective is to examine all data rows, keyword signals, and social media posts for the given event, and synthesize a comprehensive, natural, user-readable and easily understandable Event Summary.

Write in clear, natural, fluent English using GitHub Markdown. Format your output with clean headers, key highlights, and concise bullet points.

Required Sections:
# 📋 Event Summary: ${event.name}

### 📌 1. Ground Situation & Event Context
Provide a clear, natural narrative explaining what this event is about, why it is occurring, and its current trajectory.

### 🌐 2. Public Sentiment & Ground Atmosphere
Analyze the public mood. Are people supportive, outraged, fearful, or indifferent? Interpret the sentiment statistics clearly for a human reader.

### 📢 3. Key Narratives, Demands & Core Claims
What are the primary narratives, hashtags, grievances, or demands circulating across public chatter?

### ⚠️ 4. Threat & Public Order Risk Assessment
Evaluate the threat level. Is there potential for disruption, road blockages, violence, strikes, or bandhs? Highlight any high-risk vectors.

### 👥 5. Amplifiers & Key Vector Channels
Which social media networks and key voices are driving the conversation?

### 🎯 6. Recommended Operational Actions for Law Enforcement
Provide clear, practical, numbered or bulleted tactical recommendations for field deployment, intelligence monitoring, and grievance addressal.

Ensure the summary is crystal-clear, natural, and completely easy to understand. Do not output raw JSON or codeblocks.`;

  let summaryMarkdown = '';

  try {
    const llmRes = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContext },
        ],
        max_tokens: 1800,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const rawContent = llmRes.data?.choices?.[0]?.message?.content || '';
    summaryMarkdown = cleanLLMOutput(rawContent);

    if (!summaryMarkdown) {
      summaryMarkdown = `### Event Summary: ${event.name}\n\nAnalysis completed. ${totalMediaCount} posts processed across ${(event.platforms || []).join(', ') || 'social platforms'}. Public sentiment is currently ${sentimentCounts.negative > sentimentCounts.positive ? 'predominantly critical' : 'stable'}.`;
    }
  } catch (err) {
    logger.error(`[SummaryLLM] LLM completion failed: ${err.message}`);
    // Graceful fallback summary if LLM service is temporarily unreachable
    summaryMarkdown = `### 📋 Event Summary: ${event.name}

> [!NOTE]
> Detailed AI narrative synthesis encountered a connection delay. Below is the direct aggregated telemetry summary across all database records.

- **Monitored Event**: ${event.name} (${event.location || 'All Regions'})
- **Total Posts Ingested & Analyzed**: ${totalMediaCount.toLocaleString('en-IN')}
- **Public Sentiment Breakdown**:
  - Positive: **${sentimentCounts.positive}**
  - Neutral / News: **${sentimentCounts.neutral}**
  - Negative / Critical: **${sentimentCounts.negative}**
- **Threat Risk Evaluation**:
  - Critical / High Risk: **${riskCounts.critical + riskCounts.high}**
  - Medium Risk: **${riskCounts.medium}**
  - Low Risk: **${riskCounts.low}**
- **Platforms Active**: ${Object.entries(platformCounts).map(([p, c]) => `${p.toUpperCase()} (${c})`).join(', ') || 'None'}
`;
  }

  return {
    ok: true,
    event: {
      id: event.id,
      name: event.name,
      location: event.location,
      monitoring_status: event.monitoring_status,
      keywords: keywordsList,
      platforms: event.platforms,
      start_date: event.start_date,
      end_date: event.end_date,
    },
    summary: summaryMarkdown,
    stats: {
      total_media_count: totalMediaCount,
      analyzed_sample_count: selectedSnippets.length,
      platform_counts: platformCounts,
      sentiment_counts: sentimentCounts,
      stance_counts: stanceCounts,
      risk_counts: riskCounts,
      total_engagement: totalEngagement,
      date_range: {
        start: earliestPost ? earliestPost.toISOString() : null,
        end: latestPost ? latestPost.toISOString() : null,
      },
    },
    model,
    generated_at: new Date().toISOString(),
  };
};

module.exports = {
  generateEventSummary,
  getLLMConfig,
};
