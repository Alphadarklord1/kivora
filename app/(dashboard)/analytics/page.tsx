'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalFiles: number;
  totalLibraryItems: number;
  quizAttempts: number;
  avgScore: number;
}

export default function AnalyticsPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.ok ? r.json() : null)
      .then(data => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Files uploaded',     value: stats?.totalFiles        ?? 0,  icon: '📁' },
    { label: 'Library items',      value: stats?.totalLibraryItems ?? 0,  icon: '🗂️' },
    { label: 'Quiz attempts',      value: stats?.quizAttempts      ?? 0,  icon: '✏️' },
    { label: 'Avg quiz score',     value: stats?.avgScore ? `${stats.avgScore}%` : '—', icon: '📊' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Analytics</h1>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
            {cards.map(card => (
              <div key={card.label} className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
                <div className="stat-label">{card.label}</div>
                <div className="stat-value">{card.value}</div>
              </div>
            ))}
          </div>

          {(!stats || stats.totalFiles === 0) && (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>No data yet</h3>
              <p>Use the Workspace to upload files and generate study content — your activity will appear here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
