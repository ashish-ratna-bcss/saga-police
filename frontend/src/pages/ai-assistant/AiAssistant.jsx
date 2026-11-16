import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Copy,
  ExternalLink,
  Loader2,
  Menu,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiAssistantApi } from '../../api/aiAssistant.api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

const SUGGESTIONS = [
  'Latest posts',
  'Summarize recent alerts',
  'Find posts about protests',
  'How many posts are in the database?',
];

const platformTone = (platform) => {
  const p = String(platform || '').toLowerCase();
  if (p.includes('you')) return 'bg-red-50 text-red-700 ring-red-100';
  if (p.includes('twit') || p.includes('x')) return 'bg-sky-50 text-sky-700 ring-sky-100';
  if (p.includes('face')) return 'bg-indigo-50 text-indigo-700 ring-indigo-100';
  if (p.includes('insta')) return 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
};

const formatWhen = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Strip old LLM HTML dumps / tags so they never blow up layout. */
const safeText = (raw) =>
  String(raw || '')
    .replace(/```html[\s\S]*?```/gi, '')
    .replace(/```ui[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);

const cleanTitle = (text) =>
  safeText(text)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function resolveView(message) {
  const text = String(message.content || '');
  // Never show record cards under error / support replies
  if (/uuid|prisma|executeRawUnsafe|invalid input syntax|database query/i.test(text)) {
    return { layout: 'text' };
  }
  const fromApi = message.view || message.token_usage?.view;
  if (fromApi?.layout === 'text') return fromApi;
  if (fromApi?.layout && (fromApi.items?.length || fromApi.stats?.length)) return fromApi;
  const sources = message.sources || [];
  if (sources.length && fromApi?.layout && fromApi.layout !== 'text') {
    return { layout: fromApi.layout || 'cards', title: 'Results', items: sources };
  }
  // Don't invent cards from stale sources when view says text / missing
  if (fromApi?.layout === 'stats' && fromApi.stats?.length) return fromApi;
  return { layout: 'text' };
}

export default function AiAssistant() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);
  const listRef = useRef(null);

  // Scroll only the message list — never the whole page / never grow layout
  const scrollListToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollListToBottom();
  }, [messages.length, sending, scrollListToBottom]);

  const refreshConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await aiAssistantApi.listConversations();
      setConversations(data.conversations || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to load chats');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const loadMessages = async (id) => {
    try {
      const data = await aiAssistantApi.listMessages(id);
      const msgs = (data.messages || []).map((m) => ({
        ...m,
        view: m.view || m.token_usage?.view,
        content: safeText(m.content),
      }));
      setMessages(msgs);
      setActiveId(id);
      setSidebarOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load messages');
    }
  };

  const handleNewChat = async () => {
    try {
      const data = await aiAssistantApi.createConversation('New chat');
      const conv = data.conversation;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
      setStreamingText('');
      setSidebarOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not create chat');
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation?.();
    try {
      await aiAssistantApi.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  const handleRename = async (id, e) => {
    e?.stopPropagation?.();
    const current = conversations.find((c) => c.id === id);
    const title = window.prompt('Rename chat', current?.title || '');
    if (title == null || !String(title).trim()) return;
    try {
      const data = await aiAssistantApi.renameConversation(id, title.trim());
      setConversations((prev) => prev.map((c) => (c.id === id ? data.conversation : c)));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Rename failed');
    }
  };

  const ensureConversation = async () => {
    if (activeId) return activeId;
    const data = await aiAssistantApi.createConversation('New chat');
    const conv = data.conversation;
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv.id;
  };

  const appendDone = (userMsg, assistantMsg, sources, view) => {
    setStreamingText('');
    setMessages((prev) => {
      const withoutTmp = prev.filter((m) => !String(m.id).startsWith('tmp-user-'));
      return [
        ...withoutTmp,
        userMsg,
        {
          ...assistantMsg,
          content: safeText(assistantMsg?.content),
          sources: sources || assistantMsg?.sources || [],
          view: view || assistantMsg?.view || assistantMsg?.token_usage?.view,
        },
      ];
    });
    refreshConversations();
  };

  const handleSend = async (textOverride) => {
    const text = String(textOverride ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setStreamingText('');
    setInput('');

    let convId;
    try {
      convId = await ensureConversation();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not start chat');
      setSending(false);
      return;
    }

    const optimisticUser = {
      id: `tmp-user-${Date.now()}`,
      role: 'user',
      content: text,
      sources: [],
    };
    setMessages((prev) => [...prev, optimisticUser]);

    const body = {
      content: text,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };

    try {
      let assembled = '';
      await aiAssistantApi.sendMessageStream(convId, body, (event, data) => {
        if (event === 'delta' && data?.text) {
          assembled += data.text;
          // Never stream raw HTML into the UI (causes layout blowups)
          if (!/```html|<style/i.test(assembled)) {
            setStreamingText(safeText(assembled).slice(0, 280));
          } else {
            setStreamingText('Preparing results…');
          }
        }
        if (event === 'done') {
          appendDone(data.userMessage, data.assistantMessage, data.sources, data.view);
        }
        if (event === 'error') toast.error(data?.message || 'Chat error');
      });
    } catch (err) {
      try {
        const result = await aiAssistantApi.sendMessage(convId, body);
        appendDone(result.userMessage, result.assistantMessage, result.sources, result.view);
      } catch (err2) {
        toast.error(err2?.response?.data?.message || err.message || 'Chat failed');
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      }
    } finally {
      setSending(false);
      setStreamingText('');
    }
  };

  const handleCopy = async (content) => {
    try {
      await navigator.clipboard.writeText(content || '');
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleRegenerate = async (messageId) => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      const result = await aiAssistantApi.regenerate(activeId, messageId);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        const nextMsg = {
          ...result.assistantMessage,
          content: safeText(result.assistantMessage?.content),
          sources: result.sources || result.assistantMessage?.sources || [],
          view: result.view || result.assistantMessage?.view,
        };
        if (idx < 0) return [...prev, nextMsg];
        const next = [...prev];
        next[idx] = nextMsg;
        return next;
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Regenerate failed');
    } finally {
      setSending(false);
    }
  };

  const HistoryPane = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Bot className="h-4 w-4" />
          </span>
          AI Assistant
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={handleNewChat} title="New chat">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loadingList && (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loadingList && conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-slate-400">Start a new chat</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => loadMessages(c.id)}
            onKeyDown={(e) => e.key === 'Enter' && loadMessages(c.id)}
            className={cn(
              'group mb-1 flex cursor-pointer items-start gap-1 rounded-xl px-2.5 py-2 text-left text-sm transition',
              activeId === c.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            )}
          >
            <span className="line-clamp-2 flex-1 text-xs leading-snug">{c.title}</span>
            <button type="button" className="opacity-0 group-hover:opacity-100" onClick={(e) => handleRename(c.id, e)}>
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" className="opacity-0 group-hover:opacity-100" onClick={(e) => handleDelete(c.id, e)}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative flex h-[calc(100dvh-6.5rem)] min-h-[440px] max-h-[calc(100dvh-6.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm md:h-[calc(100vh-7rem)] md:max-h-[calc(100vh-7rem)]">
      <aside className="hidden w-[15.5rem] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white md:flex">
        {HistoryPane}
      </aside>

      {sidebarOpen && (
        <div className="absolute inset-0 z-30 flex md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} aria-label="Close" />
          <aside className="relative z-10 flex h-full w-[min(17rem,88vw)] flex-col overflow-hidden bg-white shadow-2xl">
            {HistoryPane}
          </aside>
        </div>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          {activeId && (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800"
              onClick={() => handleDelete(activeId)}
            >
              Clear chat
            </button>
          )}
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {messages.length === 0 && !streamingText && (
              <div className="rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Bot className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Ask about your records</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  Layout adapts to your question — counts as stats, lists as cards, chat as plain text.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm text-slate-700 hover:bg-white"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <MessageBlock
                key={m.id}
                message={m}
                onCopy={() => handleCopy(safeText(m.content))}
                onRegenerate={m.role === 'assistant' ? () => handleRegenerate(m.id) : undefined}
              />
            ))}

            {streamingText && (
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
                {streamingText}
                <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-slate-400 align-middle" />
              </div>
            )}

            {sending && !streamingText && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Working…
              </div>
            )}
            <div ref={bottomRef} className="h-px w-full shrink-0" />
          </div>
        </div>

        <form
          className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Ask about posts, alerts, counts…"
              className="min-h-[48px] max-h-32 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
              disabled={sending}
            />
            <Button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-12 w-12 shrink-0 rounded-2xl bg-slate-900 hover:bg-slate-800"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MessageBlock({ message, onCopy, onRegenerate }) {
  const isUser = message.role === 'user';
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-sm leading-relaxed text-white sm:max-w-[70%]">
          {safeText(message.content)}
        </div>
      </div>
    );
  }

  const view = resolveView(message);
  const text = safeText(message.content);

  return (
    <div className="space-y-3">
      {text && (
        <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200">
          <p>{text}</p>
          <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-100 pt-2">
            <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-700">
              <Copy className="h-3 w-3" /> Copy
            </button>
            {onRegenerate && (
              <button type="button" onClick={onRegenerate} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-700">
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            )}
          </div>
        </div>
      )}
      <AdaptiveView view={view} />
    </div>
  );
}

function AdaptiveView({ view }) {
  if (!view || view.layout === 'text') return null;

  if (view.layout === 'stats' && view.stats?.length) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {view.stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{Number(s.value).toLocaleString()}</div>
          </div>
        ))}
      </div>
    );
  }

  const items = view.items || [];
  if (!items.length) return null;

  if (view.layout === 'feed') {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {view.title || 'Feed'}
        </div>
        <ul className="divide-y divide-slate-100">
          {items.map((s, i) => (
            <li key={s.id || `${s.source_id}-${i}`} className="px-4 py-3">
              <ResultRow source={s} index={i} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((s, i) => (
        <ResultCard key={s.id || `${s.source_id}-${i}`} source={s} index={i} />
      ))}
    </div>
  );
}

function ResultRow({ source, index }) {
  const meta = source.metadata || {};
  const title = cleanTitle(meta.title) || cleanTitle(source.excerpt) || `${source.source_table} #${source.source_id}`;
  const when = formatWhen(meta.published_at);
  const platform = meta.platform || 'record';
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold text-slate-400">[{index + 1}]</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1', platformTone(platform))}>
            {platform}
          </span>
          {when && <span className="text-[11px] text-slate-400">{when}</span>}
        </div>
        <p className="line-clamp-2 text-sm font-medium text-slate-900">{title}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {meta.url && (
          <a href={meta.url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
            Open
          </a>
        )}
        {meta.href && (
          <Link to={meta.href} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
            In app
          </Link>
        )}
      </div>
    </div>
  );
}

function ResultCard({ source, index }) {
  const meta = source.metadata || {};
  const title = cleanTitle(meta.title) || cleanTitle(source.excerpt) || `${source.source_table} #${source.source_id}`;
  const when = formatWhen(meta.published_at);
  const platform = meta.platform || source.source_table?.replace(/^social_media_/, '') || 'record';
  const excerpt = cleanTitle(source.excerpt || '').slice(0, 140);

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">[{index + 1}]</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1', platformTone(platform))}>
          {platform}
        </span>
        {when && <span className="text-[11px] text-slate-400">{when}</span>}
      </div>
      <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-slate-900">{title}</h3>
      {excerpt && excerpt !== title && <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{excerpt}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        {meta.url && (
          <a
            href={meta.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {meta.href && (
          <Link to={meta.href} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
            In app
          </Link>
        )}
      </div>
    </article>
  );
}
