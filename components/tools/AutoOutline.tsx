'use client';

import { useState } from 'react';
import { generateSmartContent } from '@/lib/offline/generate';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

export function AutoOutline() {
  const [text, setText] = useState('');
  const [outline, setOutline] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [outlineSource, setOutlineSource] = useState<'ai' | 'offline' | null>(null);

  const buildOfflineOutline = (inputText: string): string => {
    const content = generateSmartContent('summarize', inputText);
    const lines = [
      'CHAPTER OUTLINE',
      '================',
      '',
      'Learning Objectives:',
      ...content.learningObjectives?.map((o, i) => `${i + 1}. ${o}`) || [],
      '',
      'Key Topics:',
      ...content.keyTopics.map((k) => `- ${k}`),
      '',
      'Study Questions:',
      ...content.keyTopics.slice(0, 4).map(k => `- Explain ${k} in your own words.`),
    ];
    return lines.join('\n');
  };

  const buildAiOutline = (displayText: string, objectives: string[], topics: string[]): string => {
    // Derive a title from the first topic or first sentence of displayText
    const title = topics.length > 0
      ? topics[0]
      : displayText.split(/[.\n]/)[0].trim().slice(0, 60);

    const lines: string[] = [
      `# ${title}`,
      '',
      '## Learning Objectives',
      ...(objectives.length > 0
        ? objectives.map((o, i) => `${i + 1}. ${o}`)
        : ['1. Understand the core concepts presented in the material.']),
      '',
      '## Main Topics',
    ];

    if (topics.length > 0) {
      topics.forEach((topic) => {
        lines.push(`### ${topic}`);
        // Pull a relevant sentence from displayText that mentions this topic keyword
        const keyword = topic.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0];
        const sentences = displayText.split(/(?<=[.!?])\s+/);
        const related = sentences.find(
          (s) => keyword.length > 3 && s.toLowerCase().includes(keyword)
        );
        lines.push(`- ${related ? related.trim() : `Key concept covered in this section.`}`);
        lines.push('');
      });
    } else {
      // No discrete topics — use a single section from displayText
      lines.push('### Overview');
      lines.push(`- ${displayText.split(/[.\n]/)[0].trim()}`);
      lines.push('');
    }

    lines.push('## Review Questions');
    if (topics.length > 0) {
      topics.slice(0, 4).forEach((topic) => {
        lines.push(`- Explain ${topic} in your own words.`);
      });
    } else {
      lines.push('- Review the overview and note key terms.');
    }

    return lines.join('\n');
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setGenerating(true);
    setOutlineSource(null);

    try {
      const res = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text, mode: 'notes' }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const content = data?.content;

      if (!content || !content.displayText) throw new Error('Empty AI response');

      const objectives: string[] = Array.isArray(content.learningObjectives)
        ? content.learningObjectives
        : [];
      const topics: string[] = Array.isArray(content.keyTopics)
        ? content.keyTopics
        : [];

      setOutline(buildAiOutline(content.displayText.trim(), objectives, topics));
      setOutlineSource('ai');
    } catch {
      setOutline(buildOfflineOutline(text));
      setOutlineSource('offline');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!outline) return;
    setSaving(true);
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: 'outline', content: outline }),
      });
      broadcastInvalidate(LIBRARY_CHANNEL);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="outline-tool">
      <div>
        <h3>Auto‑Outline</h3>
        <p>Generate a chapter outline + learning objectives from your text.</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste chapter text here..."
      />
      <div className="actions">
        <button className="btn primary" onClick={handleGenerate} disabled={generating || !text.trim()}>
          {generating ? (
            <span className="spinner-wrap">
              <span className="spinner" />
              Generating…
            </span>
          ) : (
            'Generate Outline'
          )}
        </button>
        <button className="btn secondary" onClick={handleSave} disabled={!outline || saving}>
          {saving ? 'Saving...' : 'Save to Library'}
        </button>
      </div>
      {outlineSource && (
        <p className="source-notice">
          {outlineSource === 'ai' ? '✦ AI-enhanced' : '⚙ Offline outline'}
        </p>
      )}
      {outline && <pre className="output">{outline}</pre>}

      <style jsx>{`
        .outline-tool { display: grid; gap: var(--space-3); }
        p { color: var(--text-muted); font-size: var(--font-meta); margin: 0; }
        textarea {
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          width: 100%;
          box-sizing: border-box;
          resize: vertical;
        }
        .actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
        .btn { cursor: pointer; border-radius: var(--radius-md); font-size: var(--font-meta); padding: var(--space-2) var(--space-3); border: none; }
        .btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .btn.primary {
          background: var(--primary-500, #6366f1);
          color: #fff;
        }
        .btn.secondary {
          background: var(--bg-surface);
          color: var(--text-default);
          border: 1px solid var(--border-subtle);
        }
        .spinner-wrap { display: inline-flex; align-items: center; gap: 6px; }
        .spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .source-notice {
          color: var(--text-muted);
          font-size: var(--font-meta);
          font-style: italic;
          margin: 0;
        }
        .output {
          background: var(--bg-inset);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}
