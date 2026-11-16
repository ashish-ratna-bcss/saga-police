import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
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
  if (p.includes('you')) return 'bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/20';
  if (p.includes('twit') || p.includes('x')) return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20';
  if (p.includes('face')) return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20';
  if (p.includes('insta')) return 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/20';
  return 'bg-muted text-muted-foreground ring-border';
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

const safeText = (raw) =>
  String(raw || '')
    .replace(/```html[\s\S]*?```/gi, '')
    .replace(/```ui[\s\S]*?```/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .trim();

const cleanTitle = (text) =>
  String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Theme-token markdown (no @tailwindcss/typography — matches EventSummaryBrief style). */
const mdComponents = {
  p: ({ children }) => <p className="my-2 text-sm leading-relaxed text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-sm text-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-foreground">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold text-foreground">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold text-foreground">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold text-foreground">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted/50 p-2 text-xs text-foreground">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">{children}</blockquote>
  ),
};

function MarkdownBody({ children }) {
  return <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>;
}

function resolveView(message) {
  const text = String(message.content || '');
  if (/uuid|prisma|executeRawUnsafe|invalid input syntax|database query/i.test(text)) {
    return { layout: 'text' };
  }
  const fromApi = message.view || message.token_usage?.view;
  if (fromApi?.layout === 'text') return fromApi;
  if (fromApi?.layout && (fromApi.items?.length || fromApi.stats?.length)) return fromApi;
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
  const listRef = useRef(null);

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
          if (!/```html|<style/i.test(assembled)) {
            setStreamingText(assembled.slice(0, 4000));
          } else {
            setStreamingText('Preparing answer…');
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loadingList && conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Start a new chat</p>
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
              activeId === c.id
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted'
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
    <div className="relative flex h-[calc(100dvh-6.5rem)] min-h-[440px] max-h-[calc(100dvh-6.5rem)] overflow-hidden rounded-2xl border border-border bg-background shadow-sm md:h-[calc(100vh-7rem)] md:max-h-[calc(100vh-7rem)]">
      <aside className="hidden w-[15.5rem] shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
        {HistoryPane}
      </aside>

      {sidebarOpen && (
        <div className="absolute inset-0 z-30 flex md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} aria-label="Close" />
          <aside className="relative z-10 flex h-full w-[min(17rem,88vw)] flex-col overflow-hidden bg-card shadow-2xl">
            {HistoryPane}
          </aside>
        </div>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/20">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card/80 px-3 py-2.5 backdrop-blur sm:px-4">
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            />
          </label>
          {activeId && (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => handleDelete(activeId)}
            >
              Clear chat
            </button>
          )}
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {messages.length === 0 && !streamingText && (
              <div className="rounded-3xl border border-border bg-card px-5 py-10 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Bot className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Ask about your records</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Ask in plain language — alerts, posts, events, or grievances. I’ll answer clearly and show matching cards below.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="rounded-2xl border border-border bg-muted/40 px-3 py-3 text-left text-sm text-foreground hover:bg-muted"
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
              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm text-foreground shadow-sm ring-1 ring-border">
                <MarkdownBody>{streamingText}</MarkdownBody>
              </div>
            )}

            {sending && !streamingText && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Working…
              </div>
            )}
          </div>
        </div>

        <form
          className="shrink-0 border-t border-border bg-card px-3 py-3 sm:px-5"
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
              placeholder="Ask about alerts, posts, events…"
              className="min-h-[48px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()} className="h-12 w-12 shrink-0 rounded-2xl">
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
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground sm:max-w-[70%]">
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
        <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm ring-1 ring-border">
          <MarkdownBody>{text}</MarkdownBody>
          <div className="mt-2 flex flex-wrap gap-3 border-t border-border pt-2">
            <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              <Copy className="h-3 w-3" /> Copy
            </button>
            {onRegenerate && (
              <button type="button" onClick={onRegenerate} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
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
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{Number(s.value).toLocaleString()}</div>
          </div>
        ))}
      </div>
    );
  }

  const items = view.items || [];
  if (!items.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((s, i) => (
        <ResultCard key={s.id || `${s.source_id}-${i}`} source={s} index={i} />
      ))}
    </div>
  );
}

function ResultCard({ source, index }) {
  const meta = source.metadata || {};
  const title = cleanTitle(meta.title) || cleanTitle(source.excerpt) || `${source.source_table} #${source.source_id}`;
  const when = formatWhen(meta.published_at);
  const platform = meta.platform || source.source_table?.replace(/^social_media_/, '') || 'record';
  const excerpt = cleanTitle(source.excerpt || '').slice(0, 140);
  const risk = meta.risk_level;

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-3.5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">[{index + 1}]</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1', platformTone(platform))}>
          {platform}
        </span>
        {risk && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive ring-1 ring-destructive/20">
            {risk}
          </span>
        )}
        {when && <span className="text-[11px] text-muted-foreground">{when}</span>}
      </div>
      <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">{title}</h3>
      {excerpt && excerpt !== title && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{excerpt}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        {meta.url && (
          <a
            href={meta.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {meta.href && (
          <Link to={meta.href} className="rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground">
            In app
          </Link>
        )}
      </div>
    </article>
  );
}
