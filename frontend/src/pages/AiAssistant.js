import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Bot, Brain, Clock, Database, ExternalLink,
  MessageSquare, Search, Send, Sparkles, Trash2, Square,
  TrendingUp, AlertTriangle, Users, MessageCircle, Activity, Network
} from 'lucide-react';
import api from '../lib/api';
import SoceyeDailyReport from '../components/reports/SoceyeDailyReport';

const CHAT_STORAGE_KEY = 'soceye.ai.chat.v1';
const MAX_PERSISTED_MESSAGES = 80;

// ─── Shared helpers ──────────────────────────────────────────────────────────

const TIME_WINDOW_OPTIONS = [
  { label: 'Last 24h', value: 1 },
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'All time', value: 0 },
];

const THINKING_STAGES = [
  { icon: Brain,    label: 'Understanding your question…' },
  { icon: Database, label: 'Querying live database…' },
  { icon: Search,   label: 'Searching across collections…' },
  { icon: BookOpen, label: 'Reading relevant records…' },
  { icon: Sparkles, label: 'Drafting intelligence briefing…' },
];

function ThinkingIndicator() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStage(s => (s + 1) % THINKING_STAGES.length), 1800);
    return () => clearInterval(id);
  }, []);
  const { icon: Icon, label } = THINKING_STAGES[stage];
  return (
    <div className="flex justify-start">
      <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm flex items-center gap-2.5 shadow-sm border border-slate-200/60 dark:border-slate-700/60">
        <Icon className="w-4 h-4 text-blue-600 animate-pulse" />
        <span className="text-slate-700 dark:text-slate-200">{label}</span>
        <span className="ml-1 inline-flex gap-0.5">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

function renderInline(text, isUser = false) {
  if (!text) return null;
  const tokens = [];
  let rest = String(text);
  let key = 0;
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+?)(?=[).,!?;:'"\s]|$))/;
  while (rest) {
    const m = rest.match(re);
    if (!m) { tokens.push(<span key={key++}>{rest}</span>); break; }
    if (m.index > 0) tokens.push(<span key={key++}>{rest.slice(0, m.index)}</span>);
    if (m[2] != null) {
      tokens.push(<strong key={key++} className={`font-semibold ${isUser ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{m[2]}</strong>);
    } else if (m[3] != null) {
      tokens.push(<code key={key++} className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[12px] font-mono">{m[3]}</code>);
    } else if (m[4] != null) {
      tokens.push(
        <a key={key++} href={m[5]} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline font-medium break-all">
          {m[4]} <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
      );
    } else if (m[6] != null) {
      const url = m[6];
      const short = url.replace(/^https?:\/\//, '').slice(0, 55) + (url.length > 60 ? '…' : '');
      tokens.push(
        <a key={key++} href={url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline break-all">
          {short} <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return tokens;
}

function renderMessage(content, isUser = false) {
  if (!content) return null;
  const lines = content.split('\n');
  const els = [];
  let key = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) { els.push(<div key={key++} className="h-1.5" />); continue; }
    if (/^#{2,3}\s+/.test(t)) {
      els.push(<p key={key++} className={`font-semibold text-sm mt-2 mb-0.5 ${isUser ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>{renderInline(t.replace(/^#{2,3}\s+/, ''), isUser)}</p>);
    } else if (/^[•\-\*]\s+/.test(t)) {
      els.push(
        <div key={key++} className="flex gap-1.5 items-start">
          <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isUser ? 'bg-blue-200' : 'bg-slate-400 dark:bg-slate-500'}`} />
          <span className="flex-1 leading-relaxed text-sm">{renderInline(t.replace(/^[•\-\*]\s+/, ''), isUser)}</span>
        </div>
      );
    } else if (/^\d+\.\s+/.test(t)) {
      const num = t.match(/^(\d+)\./)[1];
      els.push(
        <div key={key++} className="flex gap-1.5 items-start">
          <span className={`flex-shrink-0 text-xs font-bold mt-0.5 ${isUser ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>{num}.</span>
          <span className="flex-1 leading-relaxed text-sm">{renderInline(t.replace(/^\d+\.\s+/, ''), isUser)}</span>
        </div>
      );
    } else {
      els.push(<p key={key++} className="leading-relaxed text-sm">{renderInline(t, isUser)}</p>);
    }
  }
  return <div className="space-y-0.5">{els}</div>;
}


// ─── Main Component ──────────────────────────────────────────────────────────

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    "### 👋 SOC-EYE AI — Investigative Briefer\n\n" +
    "I'm connected to the live intelligence database (alerts, grievances, events, profiles, content). " +
    "Ask me investigation-grade questions and I'll surface evidence with cited sources.\n\n" +
    "**How to get the most from me:**\n" +
    "- Be specific: include a **handle**, **keyword**, **platform**, or **time window**\n" +
    "- Stack questions: I keep context across the conversation\n" +
    "- For deeper dives, ask for **profile activity, content samples, network amplifiers, or sentiment breakdowns**\n\n" +
    "Pick a starter below or type your own question.",
};

// Categorised quick prompts for police investigations. Each tile has an icon + tone.
const PROMPT_CATEGORIES = [
  {
    title: 'Triage',
    tone: 'red',
    icon: AlertTriangle,
    prompts: [
      'Top HIGH-risk alerts in the last 24 hours with platform & author',
      'Any escalation-worthy posts pending review right now?',
      'Show alerts mentioning communal, hate-speech or incitement language',
    ],
  },
  {
    title: 'Trends',
    tone: 'amber',
    icon: TrendingUp,
    prompts: [
      'What narratives are trending across X and Facebook this week?',
      'Top 10 keywords by velocity, with dominant sentiment',
      'Compare alert volume this week vs last week, by category',
    ],
  },
  {
    title: 'Profiles',
    tone: 'violet',
    icon: Users,
    prompts: [
      'Top 10 most active threat actors in the last 7 days',
      'Profile activity for @<handle> — recent posts, sentiment, reach',
      'Which accounts are amplifying farmer-protest content?',
    ],
  },
  {
    title: 'Grievances',
    tone: 'blue',
    icon: MessageCircle,
    prompts: [
      'How many grievances are unresolved and which are oldest?',
      'Break down grievances by category (criticism, suggestion, query)',
      'Departments with the highest pending grievance backlog',
    ],
  },
  {
    title: 'Viral / Velocity',
    tone: 'orange',
    icon: Activity,
    prompts: [
      'Top 5 viral posts in the last 24 hours and what is driving them',
      'Posts crossing engagement velocity thresholds, with reach',
      'Show me viral content geo-tagged to Hyderabad / Telangana',
    ],
  },
  {
    title: 'Network',
    tone: 'emerald',
    icon: Network,
    prompts: [
      'Who are the top engagers on the latest HIGH-risk alert?',
      'Cluster of accounts repeatedly amplifying anti-government content',
      'Find connections between [profile A] and [profile B]',
    ],
  },
];

const TONE_CLS = {
  red:     { wrap: 'border-rose-200 bg-rose-50/60 hover:bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30',     icon: 'text-rose-600 bg-rose-100/70 dark:bg-rose-900/40',     title: 'text-rose-700 dark:text-rose-300' },
  amber:   { wrap: 'border-amber-200 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30', icon: 'text-amber-600 bg-amber-100/70 dark:bg-amber-900/40',  title: 'text-amber-700 dark:text-amber-300' },
  violet:  { wrap: 'border-violet-200 bg-violet-50/60 hover:bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/30', icon: 'text-violet-600 bg-violet-100/70 dark:bg-violet-900/40', title: 'text-violet-700 dark:text-violet-300' },
  blue:    { wrap: 'border-blue-200 bg-blue-50/60 hover:bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30',     icon: 'text-blue-600 bg-blue-100/70 dark:bg-blue-900/40',     title: 'text-blue-700 dark:text-blue-300' },
  orange:  { wrap: 'border-orange-200 bg-orange-50/60 hover:bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/30', icon: 'text-orange-600 bg-orange-100/70 dark:bg-orange-900/40', title: 'text-orange-700 dark:text-orange-300' },
  emerald: { wrap: 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30', icon: 'text-emerald-600 bg-emerald-100/70 dark:bg-emerald-900/40', title: 'text-emerald-700 dark:text-emerald-300' },
};

// Follow-up suggestions surfaced under assistant replies for natural drill-down.
const FOLLOWUPS_FOR = (text) => {
  const t = (text || '').toLowerCase();
  const set = new Set();
  if (t.includes('alert') || t.includes('high-risk') || t.includes('risk')) {
    set.add('Show the top engagers on these alerts');
    set.add('Group these alerts by category and platform');
  }
  if (t.includes('grievance') || t.includes('complaint')) {
    set.add('Which departments have the highest pending backlog?');
    set.add('Break this down by criticism / suggestion / grievance');
  }
  if (t.includes('keyword') || t.includes('topic') || t.includes('trend')) {
    set.add('What sentiment dominates each of these keywords?');
    set.add('Which accounts are pushing this narrative the most?');
  }
  if (t.includes('@') || t.includes('profile') || t.includes('account') || t.includes('handle')) {
    set.add('Summarise this profile’s activity in the last 7 days');
    set.add('Who are this profile’s most frequent engagers?');
  }
  if (t.includes('viral') || t.includes('velocity') || t.includes('engagement')) {
    set.add('What is driving the engagement on these posts?');
    set.add('Show similar viral posts from last week');
  }
  if (set.size === 0) {
    set.add('Drill into the highest-risk item from this answer');
    set.add('Summarise this for an evening briefing');
  }
  return Array.from(set).slice(0, 3);
};

export default function AiAssistant() {
  const [activeTab, setActiveTab] = useState('chat');
  const [windowDays, setWindowDays] = useState(7);
  // When false, the backend skips MongoDB + vector search and answers as a
  // general-purpose conversational LLM (like Claude / ChatGPT).
  const [useDb, setUseDb] = useState(() => {
    try {
      const v = window.localStorage.getItem('soceye.ai.useDb');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('soceye.ai.useDb', String(useDb)); } catch { /* ignore */ }
  }, [useDb]);

  // Chat state — rehydrate from localStorage so officers don't lose context on refresh.
  const [messages, setMessages] = useState(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore parse errors */ }
    return [WELCOME_MESSAGE];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    api.get('/rag/health')
      .then((r) => setHealth(r.data))
      .catch(() => setHealth({ healthy: false }));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Persist chat to localStorage (capped to recent N messages so storage stays small).
  useEffect(() => {
    try {
      const trimmed = messages.slice(-MAX_PERSISTED_MESSAGES);
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* quota or privacy mode — skip */ }
  }, [messages]);

  // Auto-grow the textarea up to ~6 lines, then scroll inside it.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const sendQuery = useCallback(async (question) => {
    const q = (question || '').trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: q, ts: Date.now() }]);
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await api.post('/rag/query', {
          question: q,
          collection: 'all',
          top_k: 12,
          time_window_days: useDb ? (windowDays || null) : null,
          use_db: useDb,
        signal: ctrl.signal,
      }).then((r) => r.data);
      const answer = data.answer || '_(no answer)_';
      setMessages((m) => [...m, {
        role: 'assistant',
        content: answer,
        sources: data.sources || [],
        window: data.window_doc_count,
        followups: FOLLOWUPS_FOR(answer + ' ' + q),
        ts: Date.now(),
      }]);
    } catch (e) {
      if (e.name === 'AbortError') {
        setMessages((m) => [...m, { role: 'assistant', content: '_(generation stopped)_', ts: Date.now() }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: `Error: ${e.message}`, ts: Date.now() }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [loading, windowDays, useDb]);

  const send = useCallback(() => sendQuery(input), [sendQuery, input]);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const clearChat = useCallback(() => {
    if (messages.length <= 1) return;
    if (!window.confirm('Clear the entire chat history?')) return;
    setMessages([WELCOME_MESSAGE]);
    try { window.localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
  }, [messages.length]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const showStarter = useMemo(
    () => messages.length === 1 && messages[0]?.role === 'assistant',
    [messages]
  );

  const TABS = [
    { id: 'chat', label: 'AI Chat',  icon: MessageSquare },
    { id: 'dsr',  label: 'Soceye Daily Report', icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20">
      {/* Top tab bar */}
      <div className="flex items-center gap-1 px-5 pt-4 pb-0 border-b border-slate-200/60 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-2.5 mr-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/10">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-100 tracking-tight">SOC-EYE AI</span>
            {health && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${health.healthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-[10px] font-medium ${health.healthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {health.healthy ? 'Online' : 'Degraded'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === id
                  ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* ── Chat Tab ── */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full min-h-0">
            {/* Top action bar */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-200/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm flex-shrink-0 flex-wrap">
              {/* Mode toggle: DB-grounded vs general chat */}
              <label
                title={useDb
                  ? 'Answers are grounded in the live SOC-EYE database (alerts, grievances, POIs, events…)'
                  : 'Answers come from general AI knowledge — no database lookup. Like ChatGPT / Claude.'}
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border cursor-pointer text-[11px] font-medium select-none transition ${
                  useDb
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={useDb}
                  onChange={(e) => setUseDb(e.target.checked)}
                  className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
                />
                {useDb
                  ? <><Database className="w-3.5 h-3.5" /> Use database</>
                  : <><MessageCircle className="w-3.5 h-3.5" /> General chat</>}
              </label>

              {useDb && (
                <>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500">Data window:</span>
                  <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}
                    className="border rounded-md px-2 py-1 text-xs bg-white dark:bg-slate-800 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400">
                    {TIME_WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </>
              )}

              <span className="text-[11px] text-slate-400 hidden md:inline">
                {useDb
                  ? '· Tip: include @handle, keyword or platform for sharper answers'
                  : '· No database lookups — ask anything (general knowledge, casual chat, code, drafting…)'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={clearChat}
                  disabled={messages.length <= 1}
                  title="Clear chat history"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
            </div>

            {/* Messages — flex-1 + min-h-0 ensures it never pushes the input off-screen */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-slate-50/50 to-white/50 dark:from-slate-950/50 dark:to-slate-900/50">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 shadow-sm'
                  }`}>
                    {renderMessage(m.content, m.role === 'user')}
                    {m.window != null && (
                      <div className="mt-1.5 text-[10px] opacity-60 flex items-center gap-1">
                        <Database className="w-3 h-3" /> {m.window} docs scanned in window
                      </div>
                    )}
                    {m.sources?.length > 0 && (
                      <details className="mt-2 text-xs opacity-80">
                        <summary className="cursor-pointer hover:underline">sources ({m.sources.length})</summary>
                        <ul className="mt-1 space-y-1">
                          {m.sources.slice(0, 8).map((src, j) => (
                            <li key={j} className="border-l-2 border-blue-400 pl-2 py-0.5">
                              <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300">{src.collection}/{src.document_id}</span>
                              {src.preview ? <>{' — '}<span className="text-slate-500">{src.preview}</span></> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {m.role === 'assistant' && Array.isArray(m.followups) && m.followups.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Try next</div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.followups.map((f) => (
                            <button
                              key={f}
                              onClick={() => sendQuery(f)}
                              className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-blue-950/30 dark:hover:border-blue-800 transition"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && <ThinkingIndicator />}

              {/* Investigation starter — only when chat is fresh */}
              {showStarter && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PROMPT_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const cls = TONE_CLS[cat.tone];
                    return (
                      <div
                        key={cat.title}
                        className={`rounded-xl border p-3 transition-all shadow-sm ${cls.wrap}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${cls.icon}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className={`text-[12px] font-semibold uppercase tracking-wider ${cls.title}`}>
                            {cat.title}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {cat.prompts.map((p) => (
                            <button
                              key={p}
                              onClick={() => sendQuery(p)}
                              className="block w-full text-left text-[12px] leading-snug px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 transition"
                              title="Click to ask this question"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Input — sticky bottom, never clipped */}
            <div className="border-t border-slate-200/60 dark:border-slate-700/50 p-3 sm:p-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl flex-shrink-0">
              <div className="flex gap-2 sm:gap-3 items-end">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder={useDb
                    ? 'Ask about alerts, grievances, POIs, events, trending topics, threats…   (Shift+Enter for new line)'
                    : 'Ask anything — general knowledge, casual chat, drafting, code help…   (Shift+Enter for new line)'}
                  className="flex-1 resize-none border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all max-h-40 overflow-y-auto"
                />
                {loading ? (
                  <button
                    onClick={stopGenerating}
                    title="Stop generating"
                    className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-rose-500/20 transition active:scale-95"
                  >
                    <Square className="w-4 h-4" fill="currentColor" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={!input.trim()}
                    className="bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 sm:px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition active:scale-95"
                  >
                    <Send className="w-4 h-4" /> <span className="hidden sm:inline">Send</span>
                  </button>
                )}
              </div>
              <div className="mt-1.5 px-1 text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
                <span>↵ to send · Shift+↵ for newline</span>
                {messages.length > 1 && <span>· {messages.length - 1} turns in this session</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Soceye Daily Report Tab ── */}
        {activeTab === 'dsr' && (
          <div className="h-full overflow-hidden">
            <SoceyeDailyReport />
          </div>
        )}
      </div>
    </div>
  );
}
