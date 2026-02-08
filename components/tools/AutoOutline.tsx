'use client';

import { useState } from 'react';
import { generateSmartContent } from '@/lib/offline/generate';

export function AutoOutline() {
  const [text, setText] = useState('');
  const [outline, setOutline] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleGenerate = () => {
    if (!text.trim()) return;
    const content = generateSmartContent('summarize', text);
    const lines = [
      'CHAPTER OUTLINE',
      '================',
      '',
      'Learning Objectives:',
      ...content.learningObjectives?.map((o, i) => `${i + 1}. ${o}`) || [],
      '',
      'Key Topics:',
      ...content.keyTopics.map((k, i) => `- ${k}`),
      '',
      'Study Questions:',
      ...content.keyTopics.slice(0, 4).map(k => `- Explain ${k} in your own words.`),
    ];
    setOutline(lines.join('\n'));
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
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste chapter text here..." />
      <div className="actions">
        <button className="btn" onClick={handleGenerate} disabled={!text.trim()}>Generate Outline</button>
        <button className="btn secondary" onClick={handleSave} disabled={!outline || saving}>{saving ? 'Saving...' : 'Save to Library'}</button>
      </div>
      {outline && <pre className="output">{outline}</pre>}

      <style jsx>{`
        .outline-tool { display: grid; gap: var(--space-3); }
        p { color: var(--text-muted); font-size: var(--font-meta); margin: 0; }
        textarea { padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); }
        .actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .output { background: var(--bg-inset); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--font-meta); white-space: pre-wrap; }
      `}</style>
    </div>
  );
}
