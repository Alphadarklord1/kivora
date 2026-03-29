import { Suspense } from 'react';
import { ScholarHubPage } from '@/components/coach/ScholarHubPage';

export default function CoachPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--text-3)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border-2)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite' }} />
        <span style={{ fontSize: 'var(--text-sm)' }}>Loading Scholar Hub…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ScholarHubPage />
    </Suspense>
  );
}
