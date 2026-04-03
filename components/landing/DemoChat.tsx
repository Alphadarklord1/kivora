'use client';

import { useRef, useState } from 'react';

const EXAMPLES = [
  'Explain how photosynthesis works',
  'What caused the French Revolution?',
  'How does integration work in calculus?',
  'What is quantum entanglement?',
  'Explain DNA replication simply',
  'What is Newton\'s second law?',
];

export function DemoChat() {
  const [question, setQuestion] = useState('');
  const [answer,   setAnswer]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [asked,    setAsked]    = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function submit(q: string) {
    const text = q.trim();
    if (!text || loading) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setAnswer('');
    setAsked(text);

    try {
      const res = await fetch('/api/demo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        setError('Rate limit reached — try again in a minute.');
        return;
      }

      if (!res.ok || !res.body) {
        setError('AI unavailable right now. Try again shortly.');
        return;
      }

      // Parse the SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              setAnswer(prev => prev + delta);
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(question);
    }
  }

  return (
    <div className="demo-shell">
      {/* Header */}
      <div className="demo-head">
        <div className="demo-head-left">
          <span className="demo-eyebrow">Live demo</span>
          <h2 className="demo-title">Ask Kivora's AI anything.</h2>
          <p className="demo-subtitle">
            Powered by <strong>Groq</strong> · <code>llama-3.3-70b-versatile</code> · Streamed in real time
          </p>
        </div>
        <div className="demo-model-badge">
          <span className="demo-pulse" />
          AI Online
        </div>
      </div>

      {/* Example chips */}
      <div className="demo-chips">
        {EXAMPLES.map(ex => (
          <button
            key={ex}
            className="demo-chip"
            onClick={() => { setQuestion(ex); void submit(ex); }}
            disabled={loading}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="demo-input-row">
        <textarea
          className="demo-textarea"
          placeholder="Ask a study question… (Enter to send)"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          rows={2}
          disabled={loading}
          maxLength={400}
        />
        <button
          className="demo-send-btn"
          onClick={() => void submit(question)}
          disabled={loading || !question.trim()}
          aria-label="Send"
        >
          {loading ? (
            <span className="demo-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      {/* Response */}
      {(asked || loading) && (
        <div className="demo-response">
          {asked && (
            <div className="demo-question-bubble">
              <span className="demo-q-icon">💬</span>
              <span>{asked}</span>
            </div>
          )}
          {error ? (
            <div className="demo-error">{error}</div>
          ) : (
            <div className="demo-answer-bubble">
              <span className="demo-a-icon">🤖</span>
              <div className="demo-answer-text">
                {answer || (loading && <span className="demo-thinking">Thinking…</span>)}
                {loading && answer && <span className="demo-cursor" />}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="demo-note">
        8 requests / minute per visitor · No account needed · Responses are not stored
      </p>

      <style jsx>{`
        .demo-shell {
          background: rgba(6, 12, 24, 0.85);
          border: 1px solid rgba(91, 140, 255, 0.22);
          border-radius: 1.5rem;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          backdrop-filter: blur(16px);
        }

        .demo-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .demo-eyebrow {
          display: inline-flex;
          align-items: center;
          height: 1.7rem;
          padding: 0 0.75rem;
          border-radius: 999px;
          background: rgba(91, 140, 255, 0.1);
          border: 1px solid rgba(91, 140, 255, 0.24);
          color: #7ea8ff;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 0.7rem;
        }

        .demo-title {
          margin: 0 0 0.4rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: #dce9ff;
          letter-spacing: -0.02em;
        }

        .demo-subtitle {
          margin: 0;
          font-size: 0.88rem;
          color: #5a7296;
        }

        .demo-subtitle strong { color: #7ea8ff; }
        .demo-subtitle code {
          font-size: 0.82rem;
          color: #6b9adf;
          background: rgba(91, 140, 255, 0.08);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }

        .demo-model-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
          padding: 0.45rem 0.9rem;
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #4ade80;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .demo-pulse {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }

        .demo-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .demo-chip {
          display: inline-flex;
          align-items: center;
          height: 2rem;
          padding: 0 0.85rem;
          border-radius: 999px;
          border: 1px solid rgba(91, 140, 255, 0.18);
          background: rgba(91, 140, 255, 0.06);
          color: #8fb4e8;
          font-size: 0.82rem;
          cursor: pointer;
          transition: border-color 150ms, background 150ms, color 150ms;
        }

        .demo-chip:hover:not(:disabled) {
          border-color: rgba(91, 140, 255, 0.4);
          background: rgba(91, 140, 255, 0.12);
          color: #c4dcff;
        }

        .demo-chip:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .demo-input-row {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
        }

        .demo-textarea {
          flex: 1;
          resize: none;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          border: 1px solid rgba(91, 140, 255, 0.2);
          background: rgba(4, 8, 18, 0.7);
          color: #e2eaf8;
          font-size: 0.97rem;
          line-height: 1.6;
          outline: none;
          transition: border-color 150ms;
          font-family: inherit;
        }

        .demo-textarea::placeholder { color: #3a5070; }

        .demo-textarea:focus {
          border-color: rgba(91, 140, 255, 0.5);
          box-shadow: 0 0 0 3px rgba(91, 140, 255, 0.1);
        }

        .demo-textarea:disabled { opacity: 0.6; }

        .demo-send-btn {
          width: 2.9rem;
          height: 2.9rem;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #5b8cff 0%, #3262e8 100%);
          color: #fff;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(50, 98, 232, 0.4);
          transition: transform 150ms, box-shadow 150ms;
        }

        .demo-send-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(50, 98, 232, 0.55);
        }

        .demo-send-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .demo-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 999px;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .demo-response {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.1rem;
          border-radius: 12px;
          background: rgba(4, 8, 18, 0.55);
          border: 1px solid rgba(91, 140, 255, 0.12);
        }

        .demo-question-bubble {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          font-size: 0.92rem;
          color: #8fa5c8;
        }

        .demo-q-icon { flex-shrink: 0; font-size: 1rem; }

        .demo-answer-bubble {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
        }

        .demo-a-icon { flex-shrink: 0; font-size: 1rem; margin-top: 2px; }

        .demo-answer-text {
          font-size: 0.97rem;
          color: #c8dcff;
          line-height: 1.75;
          flex: 1;
        }

        .demo-thinking {
          color: #4a6a96;
          font-style: italic;
          animation: blink 1.2s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        .demo-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #5b8cff;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink 1s step-end infinite;
        }

        .demo-error {
          font-size: 0.88rem;
          color: #f87171;
          padding: 0.6rem 0.8rem;
          border-radius: 8px;
          background: rgba(248, 113, 113, 0.08);
          border: 1px solid rgba(248, 113, 113, 0.2);
        }

        .demo-note {
          margin: 0;
          text-align: center;
          font-size: 0.78rem;
          color: #2e4460;
        }
      `}</style>
    </div>
  );
}
