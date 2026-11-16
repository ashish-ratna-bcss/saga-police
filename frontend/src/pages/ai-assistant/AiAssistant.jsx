import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Menu,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  ExternalLink,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiAssistantApi } from '../../api/aiAssistant.api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

const SUGGESTIONS = [
  'What are the major events reported recently?',
  'Find posts related to protests or rallies',
  'Summarize recent alerts',
  'How many social media posts are in the database?',
];

const HTML_PURIFY = {
  ADD_TAGS: ['style'],
  ADD_ATTR: ['target', 'rel', 'class', 'style'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta'],
  FORBID_ATTR: [/^on/i],
  ALLOW_DATA_ATTR: false,
};

/** Prefer LLM-authored HTML view; fall back to markdown / legacy ui JSON. */
function parseAssistantContent(raw) {
  const text = String(raw || '');
  const htmlMatch = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch) {
    const preface = text.replace(htmlMatch[0], '').trim();
    return { html: htmlMatch[1].trim(), markdown: preface, uiCards: [] };
  }
  const uiMatch = text.match(/```ui\s*([\s\S]*?)```/i);
  if (uiMatch) {
    let uiCards = [];
    try {
      const parsed = JSON.parse(uiMatch[1].trim());
      uiCards = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      uiCards = [];
    }
    return { html: '', markdown: text.replace(uiMatch[0], '').trim(), uiCards };
  }
  return { html: '', markdown: text.trim(), uiCards: [] };
}

function LlmHtmlView({ html }) {
  const iframeRef = useRef(null);
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html || '', {
        ...HTML_PURIFY,
        WHOLE_DOCUMENT: false,
      }),
    [html]
  );

  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<base target="_blank" rel="noopener noreferrer"/>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  a{color:#2563eb}
  img{max-width:100%;height:auto;border-radius:12px}
</style>
</head><body>${clean}</body></html>`,
    [clean]
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    const resize = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) return;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0);
        if (h > 0) iframe.style.height = `${h + 4}px`;
      } catch {
        /* ignore */
      }
    };

    const onLoad = () => {
      resize();
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const mo = new MutationObserver(resize);
        mo.observe(doc.body, { childList: true, subtree: true, attributes: true });
        iframe._mo = mo;
      } catch {
        /* ignore */
      }
    };

    iframe.addEventListener('load', onLoad);
    const tick = window.setInterval(resize, 400);
    resize();
    return () => {
      iframe.removeEventListener('load', onLoad);
      window.clearInterval(tick);
      try {
        iframe._mo?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [srcDoc]);

  if (!clean) return null;

  return (
    <iframe
      ref={iframeRef}
      title="AI designed view"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      className="w-full rounded-xl border-0 bg-transparent"
      style={{ minHeight: 80, width: '100%' }}
    />
  );
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

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

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
      setMessages(data.messages || []);
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
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? data.conversation : c))
      );
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
          setStreamingText(assembled);
        }
        if (event === 'done') {
          const assistant = data.assistantMessage;
          const userMsg = data.userMessage;
          setStreamingText('');
          setMessages((prev) => {
            const withoutTmp = prev.filter((m) => m.id !== optimisticUser.id);
            return [
              ...withoutTmp,
              userMsg,
              { ...assistant, sources: data.sources || assistant?.sources || [] },
            ];
          });
          refreshConversations();
        }
        if (event === 'error') {
          toast.error(data?.message || 'Chat error');
        }
      });
    } catch (err) {
      try {
        const result = await aiAssistantApi.sendMessage(convId, body);
        setStreamingText('');
        setMessages((prev) => {
          const withoutTmp = prev.filter((m) => m.id !== optimisticUser.id);
          return [
            ...withoutTmp,
            result.userMessage,
            {
              ...result.assistantMessage,
              sources: result.sources || result.assistantMessage?.sources || [],
            },
          ];
        });
        refreshConversations();
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
        if (idx < 0) return [...prev, result.assistantMessage];
        const next = [...prev];
        next[idx] = {
          ...result.assistantMessage,
          sources: result.sources || result.assistantMessage?.sources || [],
        };
        return next;
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Regenerate failed');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!activeId) return;
    await handleDelete(activeId);
  };

  const HistoryList = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4" />
          AI Assistant
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={handleNewChat} title="New chat">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loadingList && (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loadingList && conversations.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">No chats yet.</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => loadMessages(c.id)}
            onKeyDown={(e) => e.key === 'Enter' && loadMessages(c.id)}
            className={cn(
              'group mb-1 flex cursor-pointer items-start gap-1 rounded-lg px-2 py-2 text-left text-sm transition-colors',
              activeId === c.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted'
            )}
          >
            <span className="line-clamp-2 flex-1 text-xs leading-snug">{c.title}</span>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => handleRename(c.id, e)}
              aria-label="Rename"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => handleDelete(c.id, e)}
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative flex h-[calc(100dvh-6.5rem)] min-h-[420px] overflow-hidden rounded-xl border border-border bg-background md:h-[calc(100vh-7rem)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
        {HistoryList}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-30 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[min(18rem,85vw)] flex-col border-r border-border bg-background shadow-xl">
            {HistoryList}
          </aside>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
          <Button
            size="sm"
            variant="ghost"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open chats"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            />
          </label>
          {activeId && (
            <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={handleClear}>
              Clear chat
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
          {messages.length === 0 && !streamingText && (
            <div className="mx-auto max-w-xl px-1 py-8 text-center sm:py-10">
              <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h2 className="text-base font-semibold sm:text-lg">Ask about your tenant data</h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Answers use your records. Sources appear only when the answer cites them.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:flex-wrap sm:justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="rounded-full border border-border bg-muted/40 px-3 py-2 text-left text-xs hover:bg-muted sm:py-1.5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onCopy={() => handleCopy(m.content)}
              onRegenerate={
                m.role === 'assistant' ? () => handleRegenerate(m.id) : undefined
              }
            />
          ))}

          {streamingText && (
            <div className="flex justify-start">
              <div className="w-full max-w-[min(100%,52rem)] rounded-2xl bg-muted/80 px-3 py-2.5 text-sm sm:px-4 sm:py-3">
                <AssistantBody content={streamingText} streaming />
              </div>
            </div>
          )}

          {sending && !streamingText && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Drafting an answer…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-border p-2 sm:p-3"
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
              placeholder="Ask a question about your records…"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()} className="h-11 w-11 shrink-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AssistantBody({ content, streaming }) {
  const { html, markdown, uiCards } = useMemo(() => parseAssistantContent(content), [content]);

  // While streaming an incomplete ```html fence, show a light preview instead of broken markup
  const streamingHtmlIncomplete =
    streaming && /```html/i.test(content || '') && !/```html[\s\S]*```/i.test(content || '');

  if (html && !streamingHtmlIncomplete) {
    return (
      <div className="space-y-2">
        {markdown ? (
          <div className="text-sm text-muted-foreground">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        ) : null}
        <LlmHtmlView html={html} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {uiCards.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {uiCards.map((card, i) => (
            <div
              key={`${card.label || card.type || 'card'}-${i}`}
              className="rounded-xl border border-border/70 bg-background/80 px-3 py-2"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {card.label || card.type || 'Metric'}
              </div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">
                {card.value ?? '—'}
              </div>
            </div>
          ))}
        </div>
      )}
      {streamingHtmlIncomplete ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Designing a custom view…
        </div>
      ) : markdown ? (
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-3">
          <ReactMarkdown>{markdown}</ReactMarkdown>
          {streaming && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-foreground/60 align-middle" />
          )}
        </div>
      ) : streaming ? (
        <span className="inline-block h-4 w-1 animate-pulse bg-foreground/60" />
      ) : null}
    </div>
  );
}

function MessageBubble({ message, onCopy, onRegenerate }) {
  const isUser = message.role === 'user';
  const sources = message.sources || [];
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-2xl px-3 py-2.5 text-sm sm:px-4 sm:py-3',
          isUser
            ? 'max-w-[90%] bg-primary text-primary-foreground sm:max-w-[75%]'
            : 'w-full max-w-[min(100%,52rem)] bg-muted/80'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
        ) : (
          <AssistantBody content={message.content} />
        )}

        {!isUser && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            )}
          </div>
        )}

        {!isUser && sources.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Sources ({sources.length})
              {sourcesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {sourcesOpen && (
              <div className="mt-2 space-y-2">
                {sources.map((s, i) => {
                  const meta = s.metadata || {};
                  const href = meta.href;
                  return (
                    <div
                      key={s.id || `${s.source_table}-${s.source_id}-${i}`}
                      className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2 text-xs"
                    >
                      <div className="font-medium break-words">
                        [{i + 1}] {meta.title || `${s.source_table} #${s.source_id}`}
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {s.source_table}
                        {meta.platform ? ` · ${meta.platform}` : ''}
                        {meta.published_at
                          ? ` · ${new Date(meta.published_at).toLocaleDateString()}`
                          : ''}
                      </div>
                      {s.excerpt && (
                        <p className="mt-1 line-clamp-3 text-muted-foreground">{s.excerpt}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {meta.url && (
                          <a
                            href={meta.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Original <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {href && (
                          <Link to={href} className="text-primary hover:underline">
                            Open in app
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
