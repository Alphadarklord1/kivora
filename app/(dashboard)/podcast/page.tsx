'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function loadingLabel() {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'ar') {
    return 'جارٍ تحميل الصوت الدراسي…';
  }
  return 'Loading Study Audio…';
}

const AudioPodcastPlayer = dynamic(
  () => import('@/components/tools/AudioPodcastPlayer').then(m => ({ default: m.AudioPodcastPlayer })),
  { ssr: false, loading: () => <div className="podcast-loading">{loadingLabel()}</div> }
);

function PodcastContent() {
  const params = useSearchParams();
  const initialText = params.get('text') ?? '';
  return <AudioPodcastPlayer initialText={initialText} />;
}

export default function PodcastPage() {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <Suspense fallback={<div className="podcast-loading">{loadingLabel()}</div>}>
          <PodcastContent />
        </Suspense>
      </div>
      <style jsx global>{`
        .podcast-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100dvh;
          font-size: 16px;
          color: var(--text-muted);
        }
      `}</style>
    </>
  );
}
