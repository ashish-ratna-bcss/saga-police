import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import {
  X, Send, Loader2, Brain, ChevronDown,
  Database, Sparkles, Bot, Trash2,
  AlertCircle, FileText, Clock, History
} from 'lucide-react';
import { Button } from './ui/button';

// Ask the browser for permission to show desktop notifications when a long
// RAG query completes. We only ask once per session.
const ensureNotifyPermission = (() => {
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch { /* ignore */ }
    }
  };
})();

const desktopNotify = (title, body) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'rag-job' });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* ignore */ }
};

const STORAGE_KEY = 'rag_assistant_history';
const COLLECTION_KEY = 'rag_assistant_collection';

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveHistory = (msgs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-200)));
  } catch { /* quota exceeded — ignore */ }
};

const RAGAssistant = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(
    () => localStorage.getItem(COLLECTION_KEY) || ''
  );
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [serviceHealthy, setServiceHealthy] = useState(null);
  const [showCollectionDrop, setShowCollectionDrop] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Persist messages
  useEffect(() => { saveHistory(messages); }, [messages]);

  // Persist selected collection
  useEffect(() => {
    if (selectedCollection) localStorage.setItem(COLLECTION_KEY, selectedCollection);
  }, [selectedCollection]);

  // Scroll modal to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading, modalOpen]);

  // Close collection dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowCollectionDrop(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Escape to close modal
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setModalOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Fetch collections on mount
  const fetchCollections = useCallback(async () => {
    if (collections.length > 0) return;
    setCollectionsLoading(true);
    try {
      const { data } = await api.get('/rag/collections');
      const cols = data.collections || [];
      setCollections(cols);
      setServiceHealthy(true);
      if (cols.length > 0 && !selectedCollection) {
        setSelectedCollection(cols[0]);
      }
    } catch {
      setServiceHealthy(false);
    } finally {
      setCollectionsLoading(false);
    }
  }, [collections.length, selectedCollection]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  // ──────────── Async job tracking ────────────
  // Each pending question gets a job_id. We poll /rag/jobs/:id until status is
  // completed or failed. Jobs persist server-side, so refreshing the tab or
  // closing the modal doesn't lose the answer.
  const pollersRef = useRef(new Map()); // job_id → intervalId

  const stopPoller = (jobId) => {
    const id = pollersRef.current.get(jobId);
    if (id) {
      clearInterval(id);
      pollersRef.current.delete(jobId);
    }
  };

  const updateAssistantMsg = (jobId, patch) => {
    setMessages(prev => prev.map(m => (m.jobId === jobId ? { ...m, ...patch } : m)));
  };

  const startPolling = (jobId) => {
    if (pollersRef.current.has(jobId)) return;
    let consecutiveFailures = 0;
    const intId = setInterval(async () => {
      try {
        const { data } = await api.get(`/rag/jobs/${jobId}`);
        consecutiveFailures = 0; // reset on success
        if (data.status === 'completed') {
          updateAssistantMsg(jobId, {
            content: data.answer || 'No response generated.',
            sources: data.sources || [],
            pending: false,
            durationMs: data.duration_ms,
          });
          stopPoller(jobId);
          setIsLoading(false);

          // Notify the user. Find the matching question for the toast body.
          const q = (messages.find(m => m.role === 'user' && !m._notifiedJobId) || {}).content
            || data.question || 'Your AI question';
          const preview = (data.answer || '').replace(/[#*`_>-]+/g, '').trim().slice(0, 120);
          toast.success('AI response ready', {
            description: preview || q.slice(0, 120),
            duration: 6000,
            action: {
              label: 'View',
              onClick: () => setModalOpen(true),
            },
          });
          desktopNotify('SOC-EYE Assistant — answer ready', preview || q.slice(0, 120));
        } else if (data.status === 'failed') {
          updateAssistantMsg(jobId, {
            content: data.error || 'Query failed.',
            pending: false,
            isError: true,
          });
          stopPoller(jobId);
          setIsLoading(false);
          toast.error('AI query failed', { description: data.error || 'Unknown error' });
        } else {
          // still queued / running — refresh the spinner label
          updateAssistantMsg(jobId, { content: data.status === 'running'
            ? 'Thinking…'
            : 'Queued…' });
        }
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
          // Job was purged or doesn't exist — stop polling
          stopPoller(jobId);
          updateAssistantMsg(jobId, {
            content: 'Job not found. It may have expired. Please try again.',
            pending: false,
            isError: true,
          });
          setIsLoading(false);
          return;
        }
        // Transient error — allow a few retries before giving up
        consecutiveFailures += 1;
        if (consecutiveFailures >= 5) {
          stopPoller(jobId);
          updateAssistantMsg(jobId, {
            content: 'Lost connection to the AI service. Please try again.',
            pending: false,
            isError: true,
          });
          setIsLoading(false);
          toast.error('AI service unreachable', { description: 'Could not retrieve the answer after multiple attempts.' });
        }
      }
    }, 3000);
    pollersRef.current.set(jobId, intId);
  };

  // Stop all polling on unmount
  useEffect(() => () => {
    pollersRef.current.forEach(id => clearInterval(id));
    pollersRef.current.clear();
  }, []);

  // On mount / collection change, resume polling for any in-flight jobs we already know about
  useEffect(() => {
    messages.forEach(m => {
      if (m.role === 'assistant' && m.pending && m.jobId) startPolling(m.jobId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Submit from the top bar → queue question, open modal, fire request
  const handleBarSubmit = (e) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || isLoading) return;
    if (!selectedCollection) {
      setModalOpen(true);
      return;
    }
    setPendingQuestion(q);
    setModalOpen(true);
  };

  // When modal opens with a pending question, fire the query
  useEffect(() => {
    if (modalOpen && pendingQuestion) {
      fireQuery(pendingQuestion);
      setPendingQuestion(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, pendingQuestion]);

  const fireQuery = async (question) => {
    const userMsg = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
      collection: selectedCollection,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Enqueue the question — returns immediately with a job_id
      const { data } = await api.post('/rag/query/async', {
        question,
        collection: selectedCollection,
        top_k: 12,
      });
      const jobId = data.job_id;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Queued…',
        timestamp: new Date().toISOString(),
        sources: [],
        collection: data.collection || selectedCollection,
        jobId,
        pending: true,
      }]);
      ensureNotifyPermission();
      toast.message('Question queued', {
        description: 'You\'ll be notified when the answer is ready.',
        duration: 2500,
      });
      startPolling(jobId);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.error || 'Failed to enqueue request. Is the AI service running?',
        timestamp: new Date().toISOString(),
        isError: true,
      }]);
      setIsLoading(false);
    }
  };

  const handleModalSubmit = (e) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || isLoading || !selectedCollection) return;
    fireQuery(q);
  };

  const clearHistory = () => {
    setMessages([]);
    pollersRef.current.forEach(id => clearInterval(id));
    pollersRef.current.clear();
    localStorage.removeItem(STORAGE_KEY);
  };

  // Markdown-lite renderer
  const renderContent = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (line.startsWith('### '))
        return <h3 key={i} className="text-xs font-semibold text-foreground mt-3 mb-1">{line.slice(4)}</h3>;
      if (line.startsWith('## '))
        return <h2 key={i} className="text-sm font-bold text-foreground mt-3 mb-1">{line.slice(3)}</h2>;
      if (line.startsWith('- ') || line.startsWith('* '))
        return (
          <div key={i} className="flex items-start gap-1.5 my-1 pl-1">
            <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
            <span className="text-foreground/85 leading-relaxed text-xs">{renderInline(line.slice(2))}</span>
          </div>
        );
      if (!line.trim()) return <div key={i} className="h-1.5" />;
      return <p key={i} className="text-foreground/80 leading-relaxed text-xs my-1">{renderInline(line)}</p>;
    });
  };

  const renderInline = (text) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={j} className="px-1 py-0.5 bg-emerald-500/10 rounded text-[10px] font-mono text-emerald-600 dark:text-emerald-400">{part.slice(1, -1)}</code>;
      return <span key={j}>{part}</span>;
    });
  };

  return (
    <>
      {/* ───── TOP NAV SEARCH BAR (rendered inside header via Layout) ───── */}
      <form onSubmit={handleBarSubmit} className="hidden lg:flex items-center gap-2 flex-1 max-w-xl mx-4">
        {/* Collection dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            type="button"
            onClick={() => setShowCollectionDrop(!showCollectionDrop)}
            className="flex items-center gap-1.5 h-9 px-2.5 rounded-l-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white text-xs transition-colors min-w-[120px]"
          >
            <Database className="h-3 w-3 shrink-0 text-emerald-300" />
            <span className="truncate max-w-[100px]">
              {collectionsLoading ? 'Loading...' : selectedCollection || 'Collection'}
            </span>
            <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showCollectionDrop ? 'rotate-180' : ''}`} />
          </button>

          {showCollectionDrop && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-background border border-border rounded-lg shadow-2xl z-[60] max-h-64 overflow-y-auto">
              <div className="px-3 py-2 border-b border-border/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Select Collection</p>
              </div>
              {collections.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                  {serviceHealthy === false ? 'AI service offline' : 'No collections found'}
                </div>
              ) : (
                collections.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      setSelectedCollection(col);
                      setShowCollectionDrop(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-emerald-500/10 transition-colors flex items-center gap-2 ${
                      selectedCollection === col
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-foreground'
                    }`}
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{col}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="relative flex-1">
          <Brain className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-300" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedCollection ? `Ask AI about ${selectedCollection}...` : 'Select a collection first...'}
            disabled={isLoading}
            className="w-full h-9 pl-8 pr-9 bg-white/10 border border-white/20 border-l-0 rounded-r-lg text-xs text-white placeholder:text-white/40 focus:outline-none focus:bg-white/15 focus:border-emerald-400/50 transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !selectedCollection}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="h-3 w-3 text-white animate-spin" /> : <Send className="h-3 w-3 text-white" />}
          </button>
        </div>

        {/* History button */}
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 flex items-center justify-center transition-colors relative"
            title="View chat history"
          >
            <History className="h-3.5 w-3.5 text-emerald-300" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
              {messages.filter(m => m.role === 'assistant').length}
            </span>
          </button>
        )}
      </form>

      {/* ───── MODAL POPUP (shows after query or history click) ───── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />

          {/* Modal */}
          <div className="relative w-full max-w-2xl h-[80vh] max-h-[700px] bg-background rounded-2xl border border-border/60 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">AI Assistant</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-100/70">RAG Pipeline</span>
                    {selectedCollection && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/15 rounded text-emerald-100 font-medium">
                        {selectedCollection}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearHistory}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                  title="Clear all history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setModalOpen(false)}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Collection selector inside modal */}
            {!selectedCollection && (
              <div className="px-4 py-3 border-b border-border/50 bg-amber-500/5 shrink-0">
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Select a collection from the dropdown in the search bar above to start asking questions.</span>
                </div>
              </div>
            )}

            {serviceHealthy === false && (
              <div className="px-4 py-2 border-b border-border/50 bg-red-500/5 shrink-0">
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>RAG service unreachable — is api_server.py running?</span>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto min-h-0" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center px-6 py-10">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center mb-5 shadow-lg">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-base font-semibold mb-1">Ask anything about your data</h3>
                  <p className="text-xs text-muted-foreground text-center max-w-xs mb-6">
                    Select a collection from the top bar, type your question, and hit enter. Your full conversation history is saved here.
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                    {[
                      { q: 'How many records are there?', icon: '📊' },
                      { q: 'What are the most recent entries?', icon: '🕐' },
                      { q: 'Summarize this collection', icon: '📋' },
                      { q: 'What fields does this data have?', icon: '🔍' },
                    ].map(({ q, icon }, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (!selectedCollection) return;
                          fireQuery(q);
                        }}
                        disabled={!selectedCollection}
                        className="flex items-center gap-2 p-3 text-xs text-left bg-muted/50 hover:bg-emerald-500/10 border border-border/50 hover:border-emerald-500/30 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="text-base">{icon}</span>
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`px-5 py-3.5 ${msg.role === 'assistant' ? 'bg-emerald-500/[0.03]' : ''}`}
                    >
                      <div className="flex gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            msg.role === 'assistant'
                              ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
                              : 'bg-gradient-to-br from-slate-600 to-slate-700'
                          }`}
                        >
                          {msg.role === 'assistant'
                            ? <Bot className="h-3.5 w-3.5 text-white" />
                            : <span className="text-[10px] text-white font-bold">U</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              {msg.role === 'assistant' ? 'AI' : 'You'}
                            </span>
                            {msg.collection && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded font-medium">
                                {msg.collection}
                              </span>
                            )}
                            {msg.timestamp && (
                              <span className="text-[9px] text-muted-foreground/50 flex items-center gap-0.5">
                                <Clock className="h-2 w-2" />
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          {msg.role === 'user' ? (
                            <p className="text-sm text-foreground">{msg.content}</p>
                          ) : msg.isError ? (
                            <p className="text-xs text-red-500">{msg.content}</p>
                          ) : (
                            <div>{renderContent(msg.content)}</div>
                          )}

                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2.5 space-y-1.5">
                              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
                              {msg.sources.slice(0, 3).map((src, i) => (
                                <div key={i} className="px-2.5 py-2 bg-muted/50 rounded-md border border-border/50 text-[10px]">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                    <Database className="h-2.5 w-2.5" />
                                    <span>{src.collection}</span>
                                    <span className="text-emerald-500 font-mono">score: {src.score}</span>
                                  </div>
                                  <p className="text-foreground/70 line-clamp-2">{src.preview}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="px-5 py-3.5 bg-emerald-500/[0.03]">
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center animate-pulse">
                          <Bot className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Querying database & generating answer...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Input */}
            <div className="p-4 border-t border-border/50 bg-muted/20 shrink-0">
              <form onSubmit={handleModalSubmit}>
                <div className="relative flex items-center">
                  <Brain className="absolute left-3 h-4 w-4 text-emerald-500" />
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isLoading || !selectedCollection}
                    placeholder={selectedCollection ? `Ask about ${selectedCollection}...` : 'Select a collection first...'}
                    className="w-full h-11 pl-10 pr-12 bg-background border border-border hover:border-emerald-500/30 focus:border-emerald-500/50 rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!input.trim() || isLoading || !selectedCollection}
                    className="absolute right-1.5 h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 shadow-sm disabled:opacity-30"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[9px] text-center text-muted-foreground/50 mt-1.5">
                  Answers are generated from your database content. Verify critical information.
                </p>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RAGAssistant;
