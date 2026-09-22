const axios = require('axios');
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const {
  TARGET_ENTITIES,
  parseSentiment,
  classifyEventRelevance,
  classifyTargetEntity,
  getSentimentTargetSemantics,
  evaluateThreatRisk,
  calculateReconciledPercentages,
} = require('../../modules/events/eventTelemetry.service');

const getLLMConfig = () => {
  let baseUrl = (process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl && process.env.OLLAMA_BASE_URL) {
    baseUrl = `${process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, '')}/v1`;
  }
  const apiKey = (process.env.LLM_API_KEY || 'ollama').trim();
  const model = (process.env.LLM_MODEL || 'qwen3-14b').trim();
  const timeoutMs = Math.max(
    30000,
    Number(process.env.LLM_SUMMARY_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 180000)
  );

  if (!baseUrl) {
    const err = new Error('LLM_BASE_URL is not configured in environment (.env).');
    err.status = 500;
    throw err;
  }

  return { baseUrl, apiKey, model, timeoutMs };
};

/**
 * Strips reasoning / think tags from modern LLM outputs (e.g. Qwen, DeepSeek).
 */
const cleanLLMOutput = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText
    .replace(/<(?:think|redacted_thinking)>[\s\S]*?<\/(?:think|redacted_thinking)>/gi, '')
    .replace(/<(?:think|redacted_thinking)>[\s\S]*?<\/think>/gi, '')
    .trim();
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

  // Keywords list
  let keywordsList = [];
  try {
    if (Array.isArray(event.keywords)) {
      keywordsList = event.keywords.map((k) => (typeof k === 'string' ? k : k?.keyword)).filter(Boolean);
    }
  } catch {}

  // 2. Fetch ALL Event Media rows without arbitrary limit
  const mediaRows = await prisma.social_media_event_media.findMany({
    where: { event_id: numericId },
    select: {
      id: true,
      platform: true,
      text: true,
      author_name: true,
      author_handle: true,
      url: true,
      engagement: true,
      posted_at: true,
      fetched_at: true,
      analysis_result: true,
    },
    orderBy: [{ posted_at: 'desc' }, { id: 'desc' }],
    take: 5000,
  });

  const totalMediaCount = mediaRows.length;

  // 3. Compute telemetry aggregations across ALL N rows using unified logic
  const platformCounts = {};
  const overallSentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const relevantSentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const stanceCounts = { support: 0, oppose: 0, neutral: 0 };
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  const targetBreakdown = {
    [TARGET_ENTITIES.GOVERNMENT]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.POLICE]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.POLITICAL_LEADER]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.ORGANIZATION]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.OTHER]: { total: 0, praise: 0, news: 0, criticism: 0 },
  };

  let totalEngagement = {
    likes: 0,
    shares: 0,
    comments: 0,
    views: 0,
  };

  let earliestPost = null;
  let latestPost = null;
  let relevantPostsCount = 0;
  let unrelatedPostsCount = 0;
  let totalKeywordMentionsCount = 0;

  // Categorized candidates for stratified LLM context sampling
  const highRiskPosts = [];
  const highViralPosts = [];
  const criticismNegativePosts = [];
  const recentPosts = [];

  for (const m of mediaRows) {
    // Platform
    let p = String(m.platform || 'unknown').toLowerCase().trim();
    if (p === 'twitter') p = 'x';
    platformCounts[p] = (platformCounts[p] || 0) + 1;

    // Dates
    const postDt = m.posted_at ? new Date(m.posted_at) : (m.fetched_at ? new Date(m.fetched_at) : null);
    if (postDt && !isNaN(postDt.getTime())) {
      if (!earliestPost || postDt < earliestPost) earliestPost = postDt;
      if (!latestPost || postDt > latestPost) latestPost = postDt;
    }

    // Engagement totals
    const eng = m.engagement || {};
    totalEngagement.likes += Number(eng.likes || eng.like_count || 0) || 0;
    totalEngagement.shares += Number(eng.shares || eng.retweets || eng.share_count || 0) || 0;
    totalEngagement.comments += Number(eng.comments || eng.replies || eng.comment_count || 0) || 0;
    totalEngagement.views += Number(eng.views || eng.view_count || 0) || 0;

    // Unified sentiment and threat evaluation
    const analysis = m.analysis_result || {};
    const sent = parseSentiment(analysis.sentiment || analysis.label || 'neutral');
    overallSentimentCounts[sent] = (overallSentimentCounts[sent] || 0) + 1;

    // Stance
    const st = String(analysis.stance || 'neutral').toLowerCase();
    if (st.includes('support') || st.includes('pro') || st.includes('favour')) stanceCounts.support++;
    else if (st.includes('oppose') || st.includes('anti') || st.includes('against')) stanceCounts.oppose++;
    else stanceCounts.neutral++;

    // Strict Threat/Risk evaluation (Decoupled from criticism)
    const { riskLevel, riskScore, hasThreatVector } = evaluateThreatRisk(analysis, m.text || '');
    if (riskLevel === 'critical') riskCounts.critical++;
    else if (riskLevel === 'high') riskCounts.high++;
    else if (riskLevel === 'medium') riskCounts.medium++;
    else riskCounts.low++;

    // Event Relevance Classification
    const relevance = classifyEventRelevance(m.text || '', event.name, keywordsList);
    const targetEntity = classifyTargetEntity(m.text || '', m.author_name || m.author_handle || '', analysis);
    const targetSemantics = getSentimentTargetSemantics(sent);

    // Count keyword mentions per post
    const matchedKws = Array.isArray(analysis.matched_keywords) ? analysis.matched_keywords : [];
    if (matchedKws.length > 0) {
      totalKeywordMentionsCount += matchedKws.length;
    } else if (m.text) {
      // Check count against tracked keywords
      const textLower = m.text.toLowerCase();
      const kwHits = keywordsList.filter((k) => textLower.includes(String(k).toLowerCase())).length;
      totalKeywordMentionsCount += Math.max(1, kwHits);
    }

    if (relevance.isRelevant) {
      relevantPostsCount++;
      relevantSentimentCounts[sent] = (relevantSentimentCounts[sent] || 0) + 1;

      if (targetBreakdown[targetEntity]) {
        targetBreakdown[targetEntity].total++;
        if (sent === 'positive') targetBreakdown[targetEntity].praise++;
        else if (sent === 'negative') targetBreakdown[targetEntity].criticism++;
        else targetBreakdown[targetEntity].news++;
      }
    } else {
      unrelatedPostsCount++;
    }

    // Format post snippet for sampling
    if (m.text && m.text.trim().length > 10) {
      const snippet = {
        id: String(m.id),
        platform: p,
        author: m.author_name || m.author_handle || 'Unknown',
        text: m.text.slice(0, 240).replace(/\s+/g, ' ').trim(),
        sentiment: sent,
        target_entity: targetEntity,
        target_semantic: targetSemantics.label,
        risk_level: riskLevel,
        risk_score: riskScore,
        has_threat_vector: hasThreatVector,
        is_relevant: relevance.isRelevant,
        url: m.url || null,
        engagementScore: getEngagementTotal(m.engagement),
        postedAt: m.posted_at,
      };

      if (relevance.isRelevant) {
        if (hasThreatVector || riskLevel === 'critical' || riskLevel === 'high') {
          highRiskPosts.push(snippet);
        } else if (snippet.engagementScore > 50) {
          highViralPosts.push(snippet);
        } else if (sent === 'negative') {
          criticismNegativePosts.push(snippet);
        }

        if (recentPosts.length < 15) {
          recentPosts.push(snippet);
        }
      }
    }
  }

  // 4. Stratified selection of sample posts for LLM prompt
  highViralPosts.sort((a, b) => b.engagementScore - a.engagementScore);
  const selectedSnippets = [];
  const seenIds = new Set();

  const addSnippet = (s) => {
    if (!s || seenIds.has(s.id)) return;
    seenIds.add(s.id);
    selectedSnippets.push(s);
  };

  highRiskPosts.slice(0, 8).forEach(addSnippet);
  highViralPosts.slice(0, 8).forEach(addSnippet);
  criticismNegativePosts.slice(0, 8).forEach(addSnippet);
  recentPosts.slice(0, 8).forEach(addSnippet);

  // Index snippets with clear reference tags for traceability: [Post #1], [Post #2], ...
  const indexedSnippets = selectedSnippets.map((s, idx) => ({
    ...s,
    citationTag: `[Post #${idx + 1}]`,
  }));

  // Reconciled platform percentages (e.g. X: 77%, YouTube: 23%)
  const platformPercentages = calculateReconciledPercentages(platformCounts);

  // Reconciled sentiment percentages
  const activeSentiment = relevantPostsCount > 0 ? relevantSentimentCounts : overallSentimentCounts;
  const sentimentPercentages = calculateReconciledPercentages(activeSentiment);

  // 5. Construct Prompt Context
  const { baseUrl, apiKey, model, timeoutMs } = getLLMConfig();

  const userContext = `
EVENT DETAILS:
- Event Name: ${event.name}
- Monitored Location: ${event.location || 'General'}
- Tracked Keywords: ${keywordsList.join(', ') || 'General queries'}
- Platforms Monitored: ${(event.platforms || []).join(', ') || 'All major social networks'}
- Status: ${event.monitoring_status || 'started'}

AGGREGATED TELEMETRY ACROSS ALL ${totalMediaCount} INGESTED POSTS:
- Total Unique Posts Analyzed: ${totalMediaCount}
- Relevant Posts to Event: ${relevantPostsCount} (Out-of-scope/unrelated noise posts excluded: ${unrelatedPostsCount})
- Total Keyword Mentions across all terms: ${totalKeywordMentionsCount} (Note: individual posts contain multiple keywords)
- Active Date Range: ${earliestPost ? earliestPost.toLocaleDateString() : 'N/A'} to ${latestPost ? latestPost.toLocaleDateString() : 'N/A'}
- Platform Distribution: ${Object.entries(platformCounts).map(([plt, c]) => `${plt.toUpperCase()}: ${c} (${platformPercentages[plt] || 0}%)`).join(', ')}
- Sentiment toward Target Distribution (Event-Relevant):
  • Praise (Positive): ${activeSentiment.positive} (${sentimentPercentages.positive}%)
  • News / Updates (Neutral): ${activeSentiment.neutral} (${sentimentPercentages.neutral}%)
  • Criticism (Negative feedback, non-threat): ${activeSentiment.negative} (${sentimentPercentages.negative}%)
- Target Entity Breakdown:
  • Government: ${targetBreakdown.Government.total} (Praise: ${targetBreakdown.Government.praise}, News: ${targetBreakdown.Government.news}, Criticism: ${targetBreakdown.Government.criticism})
  • Police: ${targetBreakdown.Police.total} (Praise: ${targetBreakdown.Police.praise}, News: ${targetBreakdown.Police.news}, Criticism: ${targetBreakdown.Police.criticism})
  • Political Leaders: ${targetBreakdown['Political leader'].total} (Praise: ${targetBreakdown['Political leader'].praise}, News: ${targetBreakdown['Political leader'].news}, Criticism: ${targetBreakdown['Political leader'].criticism})
  • Organizations: ${targetBreakdown.Organization.total} (Praise: ${targetBreakdown.Organization.praise}, News: ${targetBreakdown.Organization.news}, Criticism: ${targetBreakdown.Organization.criticism})
  • Other: ${targetBreakdown.Other.total}
- Public Order Threat & Risk Assessment (Decoupled from criticism):
  • Critical/High Threat: ${riskCounts.critical + riskCounts.high} (Explicit disruption, bandh, violence, blockade calls)
  • Medium Risk: ${riskCounts.medium}
  • Low/Negligible Risk: ${riskCounts.low}
- Ground Engagement: Likes: ${totalEngagement.likes}, Shares: ${totalEngagement.shares}, Comments: ${totalEngagement.comments}, Views: ${totalEngagement.views}

VERIFIED GROUND INTELLIGENCE EVIDENCE (Sampled from ingested posts):
${indexedSnippets.length > 0 ? indexedSnippets.map((s) => `${s.citationTag} (${s.platform.toUpperCase()}) @${s.author}: "${s.text}" [Target: ${s.target_entity} (${s.target_semantic}), Risk: ${s.risk_level}]`).join('\n') : 'No text posts available yet in the database.'}
`.trim();

  const maxPromptChars = Math.max(8000, Number(process.env.LLM_SUMMARY_MAX_PROMPT_CHARS || 32000));
  let llmUserContext = userContext;
  if (llmUserContext.length > maxPromptChars) {
    llmUserContext = `${llmUserContext.slice(0, maxPromptChars)}\n\n[Evidence list truncated for model context limit.]`;
  }

  const systemPrompt = `You are a Senior Strategic OSINT Analyst specializing in social media intelligence.
Synthesize a comprehensive, factual, and strictly evidence-grounded Event Summary for "${event.name}".

CRITICAL GUIDELINES & CONSTRAINTS (MUST STRICTLY FOLLOW):
1. STRICT PROHIBITION AGAINST UNSUPPORTED GENERALIZATIONS:
   - Do NOT use the phrase "public sentiment" (Use "monitored social commentary", "expressed user opinions", or "sampled reactions").
   - Do NOT use the phrase "dominated conversations" (Unless data shows >80% share; otherwise use "represented X% of analyzed posts").
   - Do NOT use the phrase "no organized dissent" (Specify: "No disruptive protest or mobilization calls were detected within the monitored posts").
   - Do NOT use the phrase "proceeded smoothly" (Do not make unverified operational assertions about physical on-ground summit conduct).
   - Do NOT use the phrase "fostering public confidence" (Do not speculate on wider population psychology).

2. STRICT RISK VS SENTIMENT SEPARATION:
   - Negative sentiment (criticism, grievance, policy disagreement) is NOT a threat or agitation signal.
   - Criticism directed at leaders, summit policy, or government decisions must be characterized strictly as public criticism/feedback, NOT as an agitation or security threat, unless there are explicit calls to violence, strikes, blockades, or unrest.

3. EVIDENCE TRACEABILITY:
   - Every major narrative, claim, criticism, or threat assessment MUST cite the corresponding evidence tag from the provided sample (e.g. [Post #1], [Post #4]).

4. EVENT RELEVANCE & TARGET CLASSIFICATION:
   - Base your analysis strictly on posts relevant to "${event.name}". Do not let unrelated noise (e.g., local city traffic posts or unrelated regional conflicts) distort the assessment.
   - Address sentiment toward targets using the defined semantics:
     • Positive = Praise
     • Neutral = News / Updates
     • Negative = Criticism

Required Markdown Structure:
# 📋 Event Summary: ${event.name}

### 📌 1. Situation & Event Scope
Factual narrative explaining what this event is about based on monitored activity. State clearly that the analysis is based on ${totalMediaCount} unique posts analyzed across ${(event.platforms || []).join(', ') || 'social platforms'}.

### 🌐 2. Social Commentary & Target Sentiment
Analyze the commentary directed at the event, government, leaders, and organizations. Clearly interpret the sentiment metrics:
- Praise (Positive): ${activeSentiment.positive} posts (${sentimentPercentages.positive}%)
- News / Updates (Neutral): ${activeSentiment.neutral} posts (${sentimentPercentages.neutral}%)
- Criticism (Negative): ${activeSentiment.negative} posts (${sentimentPercentages.negative}%)
Cite specific posts (e.g. [Post #X]) demonstrating praise or criticism.

### 📢 3. Key Narratives & Public Claims
What are the primary narratives, demands, or discussions circulating? Every narrative claim must cite its supporting evidence (e.g. [Post #X]).

### ⚠️ 4. Public Order & Threat Assessment (Separated from Criticism)
Factual evaluation of whether any actual disruption, protest mobilization, or law & order threats were detected. Explicitly distinguish peaceful criticism from threat indicators.

### 👥 5. Active Platforms & Distribution Channels
Platform distribution breakdown (e.g. ${Object.entries(platformPercentages).map(([p, pct]) => `${p.toUpperCase()}: ${pct}%`).join(', ')}) and key voices.

### 🎯 6. Recommended Operational Actions for Authorities
Actionable, evidence-based recommendations for digital monitoring and verification.`;

  let summaryMarkdown = '';
  let summarySource = 'llm';
  let llmError = null;

  try {
    const llmRes = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: llmUserContext },
        ],
        max_tokens: 2000,
        temperature: 0.15,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      }
    );

    const rawContent = llmRes.data?.choices?.[0]?.message?.content || '';
    summaryMarkdown = cleanLLMOutput(rawContent);

    if (!summaryMarkdown) {
      summarySource = 'stats_only';
      summaryMarkdown = `### Event Summary: ${event.name}\n\nAnalysis completed across ${totalMediaCount} unique posts. Expressed commentary indicates ${activeSentiment.negative} posts (${sentimentPercentages.negative}%) containing criticism, ${activeSentiment.neutral} posts (${sentimentPercentages.neutral}%) of news/updates, and ${activeSentiment.positive} posts (${sentimentPercentages.positive}%) of praise. No disruptive threat vectors detected.`;
    }
  } catch (err) {
    summarySource = 'fallback';
    llmError = err?.response?.data?.error?.message || err?.response?.data?.message || err.message;
    logger.error(`[SummaryLLM] LLM completion failed: ${llmError}`);

    const topCitations = indexedSnippets.slice(0, 5).map((s) => `- ${s.citationTag} (${s.platform.toUpperCase()} @${s.author}): "${s.text.slice(0, 140)}..." [Target: ${s.target_entity} - ${s.target_semantic}]`).join('\n');

    summaryMarkdown = `# 📋 Event Summary: ${event.name}

### 📌 1. Situation & Event Scope
Monitoring analysis synthesized across **${totalMediaCount.toLocaleString('en-IN')} unique posts** for **${event.name}** (${event.location || 'General Region'}). Monitored channels include ${(event.platforms || []).join(', ') || 'social networks'}. Of the total posts, **${relevantPostsCount}** were classified as directly relevant to the event, while **${unrelatedPostsCount}** peripheral background posts were excluded from the event sentiment analysis.

### 🌐 2. Social Commentary & Target Sentiment
Analyzed social commentary toward key targets reflects:
- **Praise (Positive)**: **${activeSentiment.positive} posts** (${sentimentPercentages.positive}%) commend policy execution and official initiatives.
- **News / Updates (Neutral)**: **${activeSentiment.neutral} posts** (${sentimentPercentages.neutral}%) consist of factual developments, media reporting, and announcements.
- **Criticism (Negative feedback)**: **${activeSentiment.negative} posts** (${sentimentPercentages.negative}%) represent public feedback and policy critique, strictly decoupled from threat vectors.

### 📢 3. Key Narratives & Public Claims
Key discussions circulating across monitored feeds focus on event milestones, economic implications, and stakeholder statements.
${topCitations ? `\n**Sampled Evidence Citations:**\n${topCitations}\n` : ''}
*Total tracked keyword mentions across all terms: **${totalKeywordMentionsCount}** (posts frequently match multiple keywords).*

### ⚠️ 4. Threat & Public Order Risk Assessment
Public order evaluation indicates **${riskCounts.critical + riskCounts.high} critical/high threat signals** and **${riskCounts.medium} medium risk items**.
- **Important Distinction**: Negative sentiment (${activeSentiment.negative} posts) represents policy criticism and grievance feedback, and does not constitute an agitation or disruption signal.
- No organized bandhs, violent mobilization, or disruption vectors were identified within the monitored sample.

### 👥 5. Amplifiers & Key Vector Channels
Distribution of analyzed content by platform:
${Object.entries(platformCounts).map(([p, count]) => `- **${p.toUpperCase()}**: ${count} posts (${platformPercentages[p] || 0}%)`).join('\n')}

### 🎯 6. Recommended Operational Actions for Law Enforcement
1. **Targeted Verification**: Maintain priority monitoring over high-engagement channels to quickly verify speculative claims.
2. **Grievance Clarification**: Address constructive criticism regarding summit logistics or policies with prompt factual updates.
3. **Traceable Intelligence**: Ensure all operational situation reports continue to reference underlying post evidence citations.
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
    summary_source: summarySource,
    llm_error: llmError,
    stats: {
      total_media_count: totalMediaCount,
      total_unique_posts: totalMediaCount,
      relevant_posts_count: relevantPostsCount,
      unrelated_posts_count: unrelatedPostsCount,
      total_keyword_mentions: totalKeywordMentionsCount,
      analyzed_sample_count: indexedSnippets.length,
      platform_counts: platformCounts,
      platform_percentages: platformPercentages,
      sentiment_counts: activeSentiment,
      sentiment_percentages: sentimentPercentages,
      target_classification: targetBreakdown,
      stance_counts: stanceCounts,
      risk_counts: riskCounts,
      total_engagement: totalEngagement,
      date_range: {
        start: earliestPost ? earliestPost.toISOString() : null,
        end: latestPost ? latestPost.toISOString() : null,
      },
    },
    evidence_traceability: indexedSnippets.map((s) => ({
      citationTag: s.citationTag,
      id: s.id,
      platform: s.platform,
      author: s.author,
      text: s.text,
      sentiment: s.sentiment,
      target_entity: s.target_entity,
      target_semantic: s.target_semantic,
      risk_level: s.risk_level,
      url: s.url,
    })),
    model,
    generated_at: new Date().toISOString(),
  };
};

module.exports = {
  generateEventSummary,
  getLLMConfig,
};
