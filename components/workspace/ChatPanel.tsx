'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { buildRagContext } from '@/lib/rag/retrieve';
import { queryIndexedDocument } from '@/lib/rag/index-store';

interface MessageSource {
  label: string;
  preview: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: MessageSource[];
  followUps?: string[];
}

interface Props {
  extractedText: string;
  fileName?: string;
  fileId?: string;
  files?: Array<{ id: string; name: string }>;
  selectedFileId?: string | null;
  onSelectFile?: (fileId: string) => void;
  onLoadSelectedFile?: () => void;
  onClearContext?: () => void;
  extracting?: boolean;
}

/* ─── Markdown → HTML ─────────────────────────────────────────────────────── */
function mdToHtml(md: string): string {
  // 1. Protect fenced code blocks
  const blocks: string[] = [];
  let s = md.replace(/```[\w]*\n?([\s\S]*?)```/gm, (_, code) => {
    const esc = code.trim()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    blocks.push(
      `<pre style="background:var(--surface);border:1px solid var(--border);border-radius:8px;` +
      `padding:10px 12px;overflow-x:auto;margin:8px 0;font-size:0.85em;line-height:1.55;white-space:pre-wrap">` +
      `<code style="font-family:monospace">${esc}</code></pre>`
    );
    return `\x02BLK${blocks.length - 1}\x03`;
  });

  // 2. Escape remaining HTML
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 3. Process line-by-line (lists, blockquotes, headings)
  const lines = s.split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) { out.push(listType === 'ul' ? '</ul>' : '</ol>'); listType = null; }
  };

  for (const line of lines) {
    const t = line.trim();

    if (/^[-*•]\s+/.test(t)) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul style="margin:6px 0 6px 18px;padding:0;list-style:disc">');
        listType = 'ul';
      }
      out.push(`<li style="margin:3px 0">${t.replace(/^[-*•]\s+/, '')}</li>`);

    } else if (/^\d+\.\s+/.test(t)) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol style="margin:6px 0 6px 18px;padding:0">');
        listType = 'ol';
      }
      out.push(`<li style="margin:3px 0">${t.replace(/^\d+\.\s+/, '')}</li>`);

    } else if (t.startsWith('&gt;')) {
      closeList();
      const inner = t.replace(/^&gt;\s*/, '');
      out.push(
        `<blockquote style="border-left:3px solid var(--accent);padding:4px 10px;margin:6px 0;` +
        `color:var(--text-2);font-style:italic">${inner}</blockquote>`
      );

    } else if (/^#{1,3}\s/.test(t)) {
      closeList();
      const level = (t.match(/^(#{1,3})/)?.[1].length ?? 1) - 1;
      const sizes = ['1.05em', '1em', '0.95em'];
      out.push(
        `<strong style="display:block;margin:10px 0 3px;font-size:${sizes[level]}">` +
        `${t.replace(/^#{1,3}\s+/, '')}</strong>`
      );

    } else if (t === '---' || t === '***' || t === '___') {
      closeList();
      out.push('<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">');

    } else if (t === '') {
      if (!listType) out.push('<br>');

    } else {
      closeList();
      out.push(line + '<br>');
    }
  }
  closeList();

  // 4. Inline formatting
  s = out.join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g,
      '<code style="background:var(--surface-2);padding:1px 5px;border-radius:4px;' +
      'font-size:0.88em;font-family:monospace">$1</code>'
    );

  // 5. Restore code blocks
  return s.replace(/\x02BLK(\d+)\x03/g, (_, i) => blocks[parseInt(i)]);
}

/* ─── Follow-up chip generation ───────────────────────────────────────────── */
function deriveFollowUps(content: string, question: string): string[] {
  const lower = content.toLowerCase();
  const pool: string[] = [];

  if (/\d+\.|[-*]\s/.test(content))
    pool.push('Can you explain the first point in more detail?');
  if (lower.includes('mean') || lower.includes('defin') || lower.includes('refer'))
    pool.push('Can you give a real-world example?');
  if (lower.includes('step') || lower.includes('process') || lower.includes('method'))
    pool.push('What are common mistakes to avoid?');
  if (lower.includes('theor') || lower.includes('concept') || lower.includes('principl'))
    pool.push('How would this come up in an exam?');
  if (lower.includes('however') || lower.includes('although') || lower.includes('contrast'))
    pool.push('What are the counter-arguments?');

  // Generic fallbacks
  const generic = [
    'Can you simplify this further?',
    'What should I memorize from this?',
    'Quiz me on this topic',
    'Summarise that in one paragraph',
    'How does this relate to the rest of the document?',
  ];
  for (const g of generic) {
    if (pool.length >= 3) break;
    pool.push(g);
  }

  return pool.slice(0, 3);
}

/* ─── Constants ───────────────────────────────────────────────────────────── */
const STARTER_QUESTIONS_DOC = [
  'Summarise the key points',
  'What are the main arguments?',
  'Define the key terms used',
  "What is the author's conclusion?",
];

const STARTER_QUESTIONS_GENERAL = [
  'Explain a concept to me',
  'Help me create a study plan',
  'How do I write a strong essay?',
  'Quiz me on any topic',
];

function chatKey(fileId?: string) {
  return `kivora_chat_${fileId ?? 'general'}`;
}

/* ─── Saved-to-notes toast ─────────────────────────────────────────────────── */
let savedToastTimer: ReturnType<typeof setTimeout> | null = null;

export function ChatPanel({
  extractedText,
  fileName,
  fileId,
  files = [],
  selectedFileId = null,
  onSelectFile,
  onLoadSelectedFile,
  onClearContext,
  extracting = false,
}: Props) {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [streaming,  setStreaming]  = useState(false);
  const [copiedIdx,  setCopiedIdx]  = useState<number | null>(null);
  const [savedIdx,   setSavedIdx]   = useState<number | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  const abortRef      = useRef<AbortController | null>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const lastContextRef = useRef<string | null>(null);
  const persistKey    = useRef<string>(chatKey(fileId));

  const hasContext      = Boolean(extractedText);
  const canPickFile     = files.length > 0 && onSelectFile && onLoadSelectedFile;
  const estimatedWords  = hasContext
    ? (Math.round(extractedText.split(/\s+/).length / 100) * 100).toLocaleString()
    : null;

  /* ── Persistence: load on mount / fileId change ─────────────────────────── */
  useEffect(() => {
    const key = chatKey(fileId);
    persistKey.current = key;

    // Clear messages if switching file context
    const nextCtx = fileId ?? null;
    if (lastContextRef.current !== null && nextCtx !== lastContextRef.current) {
      setMessages([]);
    }
    lastContextRef.current = nextCtx;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  /* ── Persistence: save on messages change ──────────────────────────────── */
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(persistKey.current, JSON.stringify(messages));
    } catch { /* quota exceeded — ignore */ }
  }, [messages]);

  /* ── Auto-scroll ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Auto-resize textarea ────────────────────────────────────────────────── */
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  /* ── Message helpers ─────────────────────────────────────────────────────── */
  function updateLastAssistant(content: string, extras?: Partial<Message>) {
    setMessages(prev => {
      const next = [...prev];
      next[next.length - 1] = {
        ...(next[next.length - 1] ?? { role: 'assistant' as const, content }),
        role: 'assistant',
        content,
        ...extras,
      };
      return next;
    });
  }

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    }).catch(() => {});
  }

  async function saveToNotes(content: string, idx: number) {
    const title = content.replace(/[*#`]/g, '').split('\n')[0].trim().slice(0, 80) || 'Chat note';
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'note', content, metadata: { title, source: 'chat', fileId } }),
      });
      if (res.ok) {
        setSavedIdx(idx);
        setSavedToast(true);
        if (savedToastTimer) clearTimeout(savedToastTimer);
        savedToastTimer = setTimeout(() => {
          setSavedIdx(null);
          setSavedToast(false);
        }, 2200);
      }
    } catch { /* ignore */ }
  }

  /* ── Send message ────────────────────────────────────────────────────────── */
  const sendMessage = useCallback(async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || streaming) return;

    const userMsg: Message = { role: 'user', content: q };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setStreaming(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const ai = loadAiRuntimePreferences();
      const privacyMode = loadClientAiDataMode();

      const retrievedSources = extractedText && fileId
        ? await queryIndexedDocument(fileId, extractedText, q, 5).catch(() => [])
        : [];

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          fileId: fileId ?? null,
          context: retrievedSources.length > 0
            ? buildRagContext(retrievedSources)
            : (extractedText || null),
          sources: retrievedSources.map(src => ({
            label: src.label, preview: src.preview, text: src.text,
          })),
          ai,
          privacyMode,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        updateLastAssistant('Could not connect. Is Ollama running?');
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let content = '';
      let finalSources: MessageSource[] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          try {
            const { token, done: isDone, sources } = JSON.parse(t.slice(6));
            if (Array.isArray(sources) && sources.length > 0) finalSources = sources;
            if (isDone) break;
            content += token;
            updateLastAssistant(content);
          } catch { /* skip */ }
        }
      }

      // Finalise with follow-ups
      updateLastAssistant(content, {
        sources: finalSources,
        followUps: content.length > 20 ? deriveFollowUps(content, q) : undefined,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        updateLastAssistant('Connection error. Is Ollama running?');
      }
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming, extractedText, fileId]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function clearChat() {
    setMessages([]);
    try { localStorage.removeItem(persistKey.current); } catch { /* ignore */ }
  }

  /* ── Render ────────────────────────────────────────────────────────────────── */
  const starterQs = hasContext ? STARTER_QUESTIONS_DOC : STARTER_QUESTIONS_GENERAL;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden', position: 'relative' }}>

      {/* Saved-to-notes toast */}
      {savedToast && (
        <div style={{
          position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: '#fff', padding: '6px 16px',
          borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 20,
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)', pointerEvents: 'none',
        }}>
          ✓ Saved to Library
        </div>
      )}

      {/* Context bar */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {hasContext ? (
          <>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#4ade80', flexShrink: 0,
              boxShadow: '0 0 6px #4ade8080',
            }} />
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-2)',
              flex: 1, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <strong>{fileName ?? 'Document'}</strong>
              <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                ≈{estimatedWords} words in context
              </span>
            </span>
          </>
        ) : (
          <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {canPickFile ? (
                <>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>No document —</span>
                  <select
                    value={selectedFileId ?? ''}
                    onChange={e => onSelectFile!(e.target.value)}
                    style={{
                      minWidth: 160, maxWidth: 260, padding: '3px 8px',
                      fontSize: 'var(--text-xs)', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="" disabled>Choose a file…</option>
                    {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!selectedFileId || extracting}
                    onClick={onLoadSelectedFile}
                  >
                    {extracting ? 'Loading…' : 'Load'}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  General assistant mode — or open a file and click <strong style={{ color: 'var(--accent)' }}>💬 Chat</strong>
                </span>
              )}
            </div>
          </>
        )}

        {extractedText && onClearContext && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={onClearContext}>
            Remove file
          </button>
        )}
        {messages.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}
            onClick={clearChat}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>{hasContext ? '📄' : '💬'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-2)', marginBottom: 4 }}>
              {hasContext ? `Chat with "${fileName ?? 'Document'}"` : 'Study Assistant'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', marginBottom: 18, maxWidth: 380, margin: '0 auto 18px' }}>
              {hasContext
                ? 'Ask questions, get summaries, definitions, key arguments — sourced from your document.'
                : 'Ask me anything — concepts, essay help, study plans, exam prep. Load a document for source-cited answers.'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {starterQs.map(q => (
                <button
                  key={q}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, borderRadius: 20 }}
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>

            {msg.role === 'assistant' && (
              <div style={{
                width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)',
                color: '#fff', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
              }}>
                K
              </div>
            )}

            <div style={{
              maxWidth: '80%', display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4,
            }}>
              {/* Bubble */}
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.65,
                wordBreak: 'break-word',
              }}>
                {msg.role === 'assistant' ? (
                  <div dangerouslySetInnerHTML={{
                    __html: mdToHtml(msg.content) +
                      (streaming && i === messages.length - 1
                        ? '<span class="stream-cursor">▍</span>'
                        : ''),
                  }} />
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>

              {/* Action row for assistant messages */}
              {msg.role === 'assistant' && msg.content && !streaming && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                      onClick={() => copyMessage(msg.content, i)}
                    >
                      {copiedIdx === i ? '✓ copied' : '📋 copy'}
                    </button>
                    <button
                      style={{ fontSize: 10, color: savedIdx === i ? 'var(--accent)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                      onClick={() => saveToNotes(msg.content, i)}
                    >
                      {savedIdx === i ? '✓ saved' : '📌 save to notes'}
                    </button>
                  </div>

                  {/* Sources */}
                  {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                    <div style={{ display: 'grid', gap: 5 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Sources
                      </div>
                      {msg.sources.map(src => (
                        <div
                          key={`${i}-${src.label}`}
                          style={{
                            padding: '7px 10px', borderRadius: 10,
                            border: '1px solid var(--border)', background: 'var(--surface)',
                            fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5,
                          }}
                        >
                          <strong style={{ color: 'var(--accent)' }}>{src.label}</strong>
                          <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>{src.preview}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Follow-up suggestions */}
                  {Array.isArray(msg.followUps) && msg.followUps.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                      {msg.followUps.map(fu => (
                        <button
                          key={fu}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, borderRadius: 20, padding: '3px 10px' }}
                          onClick={() => sendMessage(fu)}
                        >
                          {fu}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={e => {
              setInput(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKey}
            placeholder={
              hasContext
                ? 'Ask about your document… (Enter to send, Shift+Enter for newline)'
                : 'Ask me anything… (Enter to send)'
            }
            style={{
              flex: 1,
              padding: '9px 12px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 10,
              color: 'var(--text)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              minHeight: 38,
              maxHeight: 160,
              overflowY: 'auto',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              disabled={!input.trim() || streaming}
              onClick={() => sendMessage()}
              style={{ minWidth: 60, fontSize: 'var(--text-sm)', height: streaming ? 32 : 38 }}
            >
              {streaming ? '⏳' : '↑ Send'}
            </button>
            {streaming && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => abortRef.current?.abort()}
                style={{ fontSize: 11, height: 28 }}
              >
                ■ Stop
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
          Shift+Enter for new line · uses your AI runtime setting
          {messages.length > 0 && (
            <span style={{ marginLeft: 8, opacity: 0.7 }}>· {messages.length} messages saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
