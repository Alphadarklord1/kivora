'use client';

import { useEffect, useRef, useState } from 'react';
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

/* Minimal markdown → HTML for chat bubbles */
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--surface-2);padding:1px 4px;border-radius:4px;font-size:0.88em">$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong style="display:block;margin:6px 0 2px">$1</strong>')
    .replace(/^[-*]\s+(.+)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}

const STARTER_QUESTIONS = [
  'Summarise the key points',
  'What are the main arguments?',
  'Define the key terms used',
  "What is the author's conclusion?",
];

const CHAT_TIPS = [
  'Ask for a summary, definitions, or a section-by-section explanation.',
  'You can load a different file at any time from this folder.',
  'Use Shift+Enter for a new line and Enter to send.',
] as const;

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
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastContextRef = useRef<string | null>(null);
  const hasContext = Boolean(extractedText);
  const canPickFile = files.length > 0 && onSelectFile && onLoadSelectedFile;
  const estimatedWords = hasContext
    ? (Math.round(extractedText.split(/\s+/).length / 100) * 100).toLocaleString()
    : null;

  function updateLastAssistant(content: string, sources?: MessageSource[]) {
    setMessages(prev => {
      const next = [...prev];
      next[next.length - 1] = {
        ...(next[next.length - 1] ?? { role: 'assistant' as const, content }),
        role: 'assistant',
        content,
        ...(sources ? { sources } : {}),
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const nextContext = fileId ?? null;
    if (lastContextRef.current && nextContext !== lastContextRef.current) {
      setMessages([]);
    }
    lastContextRef.current = nextContext;
  }, [fileId]);

  async function sendMessage(question?: string) {
    const q = (question ?? input).trim();
    if (!q || streaming) return;

    const userMsg: Message = { role: 'user', content: q };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Add assistant placeholder
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
          context: retrievedSources.length > 0 ? buildRagContext(retrievedSources) : extractedText,
          sources: retrievedSources.map((source) => ({ label: source.label, preview: source.preview, text: source.text })),
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
      const dec    = new TextDecoder();
      let buf      = '';
      let content  = '';

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
            if (Array.isArray(sources) && sources.length > 0) {
              updateLastAssistant(content, sources);
            }
            if (isDone) break;
            content += token;
            updateLastAssistant(content);
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        updateLastAssistant('Connection error. Is Ollama running?');
      }
    } finally {
      setStreaming(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>

      {/* Context bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {hasContext ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 6px #4ade8080' }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{fileName ?? 'Document'}</strong> in context
              <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                ≈{estimatedWords} words
              </span>
            </span>
          </>
        ) : (
          <>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {canPickFile ? (
                <>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                    No document loaded —
                  </span>
                  <select
                    value={selectedFileId ?? ''}
                    onChange={(event) => onSelectFile(event.target.value)}
                    style={{
                      minWidth: 180,
                      maxWidth: 280,
                      padding: '4px 8px',
                      fontSize: 'var(--text-xs)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="" disabled>Choose a file from this folder…</option>
                    {files.map((file) => (
                      <option key={file.id} value={file.id}>{file.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-secondary btn-sm" disabled={!selectedFileId || extracting} onClick={onLoadSelectedFile}>
                    {extracting ? 'Loading…' : 'Load into chat'}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  No document loaded — open a file in <strong style={{ color: 'var(--text-2)' }}>Files</strong> and click <strong style={{ color: 'var(--accent)' }}>💬 Chat</strong>
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
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }} onClick={() => setMessages([])}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Messages list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--text-2)', marginBottom: 6 }}>
              Chat with your document
            </div>
            <div style={{ fontSize: 'var(--text-sm)', marginBottom: 20 }}>
              Ask anything — explanations, definitions, summaries, key arguments
            </div>
            <div
              style={{
                maxWidth: 480,
                margin: '0 auto 18px',
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                Best results
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {CHAT_TIPS.map((tip) => (
                  <div key={tip} style={{ fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {STARTER_QUESTIONS.map(q => (
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
          <div
            key={i}
            style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}
          >
            {msg.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                K
              </div>
            )}
            <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
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
                      (streaming && i === messages.length - 1 ? '<span class="stream-cursor">▍</span>' : '')
                  }} />
                ) : msg.content}
              </div>
              {msg.role === 'assistant' && msg.content && !streaming && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <button
                    style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                    onClick={() => copyMessage(msg.content, i)}
                  >
                    {copiedIdx === i ? '✓ copied' : '📋 copy'}
                  </button>
                  {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                    <div style={{ display: 'grid', gap: 6, width: '100%' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Retrieved sources
                      </div>
                      {msg.sources.map((source) => (
                        <div
                          key={`${i}-${source.label}`}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            fontSize: 11,
                            color: 'var(--text-2)',
                            lineHeight: 1.5,
                          }}
                        >
                          <strong style={{ color: 'var(--accent)' }}>{source.label}</strong>
                          <span style={{ marginLeft: 6 }}>{source.preview}</span>
                        </div>
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

      {/* Input bar */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={hasContext ? 'Ask a question about your document… (Enter to send)' : 'Load a file first to start chatting…'}
            rows={2}
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
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="btn btn-primary"
              disabled={!input.trim() || streaming}
              onClick={() => sendMessage()}
              style={{ height: streaming ? 'calc(50% - 2px)' : '100%', minWidth: 64, fontSize: 'var(--text-sm)' }}
            >
              {streaming ? '⏳' : '↑ Send'}
            </button>
            {streaming && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => abortRef.current?.abort()}
                style={{ fontSize: 11 }}
              >
                ■ Stop
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
          Shift+Enter for new line · uses your current AI runtime setting
        </div>
      </div>
    </div>
  );
}
