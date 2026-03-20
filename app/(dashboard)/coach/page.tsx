import { Suspense } from 'react';
import { RevisionCoachPage } from '@/components/coach/RevisionCoachPage';

export default function CoachPage() {
  return (
    <Suspense fallback={<div style={{ padding: '1rem' }}>Loading Revision Coach…</div>}>
      <RevisionCoachPage />
    </Suspense>
  );
}
