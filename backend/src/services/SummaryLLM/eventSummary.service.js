const axios = require('axios');
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');

const getLLMConfig = () => ({
  baseUrl: (process.env.LLM_BASE_URL || 'http://100.49.109.96/v1').replace(/\/$/, ''),
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'qwen3-14b',
});

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
 * Generate comprehensive AI Executive Summary for an event using telemetry and LLM.
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

  // 2. Fetch Event Media rows (up to 300 latest/highest engagement rows)
  const [totalMediaCount, mediaRows] = await Promise.all([
    prisma.social_media_event_media.count({ where: { event_id: numericId } }),
    prisma.social_media_event_media.findMany({
      where: { event_id: numericId },
      orderBy: [{ posted_at: 'desc' }, { id: 'desc' }],
      take: 300,
    }),
  ]);

  // 3. Compute telemetry aggregations
  const platformCounts = {};
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const stanceCounts = { support: 0, oppose: 0, neutral: 0 };
  const riskCounts = { high: 0, medium: 0, low: 0 };

  const sampleSnippets = [];

  for (const m of mediaRows) {
    const p = String(m.platform || 'unknown').toLowerCase();
    platformCounts[p] = (platformCounts[p] || 0) + 1;

    const analysis = m.analysis_result || {};
    const sent = String(analysis.sentiment || 'neutral').toLowerCase();
    if (sentimentCounts[sent] !== undefined) sentimentCounts[sent]++;
    else sentimentCounts.neutral++;

    const st = String(analysis.stance || 'neutral').toLowerCase();
    if (st.includes('support') || st.includes('pro')) stanceCounts.support++;
    else if (st.includes('oppose') || st.includes('anti')) stanceCounts.oppose++;
    else stanceCounts.neutral++;

    const rk = String(analysis.risk_level || (analysis.risk_score >= 70 ? 'high' : analysis.risk_score >= 40 ? 'medium' : 'low')).toLowerCase();
    if (riskCounts[rk] !== undefined) riskCounts[rk]++;
    else riskCounts.low++;

    if (m.text && m.text.trim().length > 15 && sampleSnippets.length < 25) {
      sampleSnippets.push({
        platform: m.platform,
        author: m.author_name || m.author_handle || 'Unknown',
        text: m.text.slice(0, 240).replace(/\s+/g, ' ').trim(),
        sentiment: analysis.sentiment || 'neutral',
        risk_level: analysis.risk_level || 'low',
      });
    }
  }

  // Keywords list
  let keywordsList = [];
  try {
    if (Array.isArray(event.keywords)) {
      keywordsList = event.keywords.map((k) => (typeof k === 'string' ? k : k?.keyword)).filter(Boolean);
    }
  } catch {}

  // 4. Construct Prompt
  const { baseUrl, apiKey, model } = getLLMConfig();

  const userContext = `
EVENT DETAILS:
- Event Name: ${event.name}
- Description: ${event.description || 'Not provided'}
- Monitored Location: ${event.location || 'General'}
- Tracked Keywords: ${keywordsList.join(', ') || 'General queries'}
- Platforms Monitored: ${(event.platforms || []).join(', ') || 'All major social networks'}
- Status: ${event.monitoring_status || 'started'}

AGGREGATED TELEMETRY DATA:
- Total Posts Ingested: ${totalMediaCount} (Sampled: ${mediaRows.length})
- Platform Distribution: ${JSON.stringify(platformCounts)}
- Public Sentiment: Positive: ${sentimentCounts.positive}, Neutral/News: ${sentimentCounts.neutral}, Negative: ${sentimentCounts.negative}
- Narrative Stance: Supporting: ${stanceCounts.support}, Opposing: ${stanceCounts.oppose}, Neutral: ${stanceCounts.neutral}
- Threat & Risk Level: Critical/High: ${riskCounts.high}, Medium: ${riskCounts.medium}, Low: ${riskCounts.low}

SAMPLE TELEMETRY POSTS FROM GROUND:
${sampleSnippets.length > 0 ? sampleSnippets.map((s, idx) => `[${idx + 1}] (${s.platform}) ${s.author}: "${s.text}" [Sentiment: ${s.sentiment}, Risk: ${s.risk_level}]`).join('\n') : 'No text posts available yet.'}
`.trim();

  const systemPrompt = `You are a Senior Strategic OSINT Intelligence Analyst for Special Branch Police and Homeland Security.
Your objective is to examine all telemetry data rows, keyword signals, and social media posts for the given event, and synthesize a comprehensive, natural, user-readable and easily understandable Intelligence Summary.

Write in authoritative, natural, fluent English using GitHub Markdown. Format your output with clear headers, key highlights, and concise bullet points.

Required Sections:
# 🚨 Intelligence Assessment & Executive Summary: ${event.name}

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

Ensure the briefing is crystal-clear, executive-level, and completely jargon-free for officers. Do not output raw JSON or codeblocks.`;

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
        max_tokens: 1500,
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
      summaryMarkdown = `### Intelligence Briefing for ${event.name}\n\nAnalysis completed. ${totalMediaCount} posts processed across ${(event.platforms || []).join(', ') || 'social platforms'}. Public sentiment is currently ${sentimentCounts.negative > sentimentCounts.positive ? 'predominantly critical' : 'stable'}.`;
    }
  } catch (err) {
    logger.error(`[SummaryLLM] LLM completion failed: ${err.message}`);
    // Graceful fallback summary if LLM service is temporarily unreachable
    summaryMarkdown = `### 🚨 Automated Intelligence Snapshot: ${event.name}

> [!NOTE]
> Detailed LLM narrative synthesis encountered a connection delay. Below is the direct aggregated telemetry summary.

- **Monitored Event**: ${event.name} (${event.location || 'All Regions'})
- **Total Posts Ingested**: ${totalMediaCount.toLocaleString('en-IN')}
- **Public Sentiment Breakdown**:
  - Positive: **${sentimentCounts.positive}**
  - Neutral / News: **${sentimentCounts.neutral}**
  - Negative / Critical: **${sentimentCounts.negative}**
- **Threat Risk Evaluation**:
  - High / Critical: **${riskCounts.high}**
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
      analyzed_sample_count: mediaRows.length,
      platform_counts: platformCounts,
      sentiment_counts: sentimentCounts,
      stance_counts: stanceCounts,
      risk_counts: riskCounts,
    },
    model,
    generated_at: new Date().toISOString(),
  };
};

module.exports = {
  generateEventSummary,
  getLLMConfig,
};
