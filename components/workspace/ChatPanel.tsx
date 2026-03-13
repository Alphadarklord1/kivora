'use client';

import { useEffect, useRef, useState } from 'react';

interface Message { role: 'user' | 'assistant'; content: string }

interface Props {
  extractedText: string;
  fileName?: string;
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

export function ChatPanel({ extractedText, fileName }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      const ollamaModel = typeof window !== 'undefined'
        ? (localStorage.getItem('kivora_ollama_model') ?? 'mistral')
        : 'mistral';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, context: extractedText, model: ollamaModel }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: 'Could not connect. Is Ollama running?' };
          return next;
        });
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
            const { token, done: isDone } = JSON.parse(t.slice(6));
            if (isDone) break;
            content += token;
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', content };
              return next;
            });
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: 'Connection error. Is Ollama running?' };
          return next;
        });
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
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0 }}>
        {extractedText ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)' }}>
            💬 Chatting with: <strong>{fileName ?? 'document'}</strong>
            <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
              ≈{Math.round(extractedText.split(/\s+/).length / 100) * 100} words in context
            </span>
          </span>
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            ⚠ No document loaded — open a file in <strong>Files</strong> and click <strong>⚡ Use for Generate</strong> first
          </span>
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
            style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {msg.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                K
              </div>
            )}
            <div style={{
              maxWidth: '78%',
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
                    (streaming && i === messages.length - 1 && msg.content === ''
                      ? '<span class="stream-cursor">▍</span>'
                      : streaming && i === messages.length - 1
                        ? '<span class="stream-cursor">▍</span>'
                        : '')
                }} />
              ) : msg.content}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        {messages.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, marginBottom: 8, color: 'var(--text-3)' }}
            onClick={() => setMessages([])}
          >
            ✕ Clear conversation
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={extractedText ? 'Ask a question about your document… (Enter to send)' : 'Load a file first to start chatting…'}
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
          Shift+Enter for new line · powered by Ollama
        </div>
      </div>
    </div>
  );
}
