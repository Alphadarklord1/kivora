'use client';

import dynamic from 'next/dynamic';

function loadingLabel() {
  if (typeof document !== 'undefined') {
    if (document.documentElement.lang === 'ar') return 'جارٍ تحميل مساحة الرياضيات…';
    if (document.documentElement.lang === 'fr') return 'Chargement de Mathématiques…';
  }
  return 'Loading Math…';
}

const MathSolverPage = dynamic(
  () => import('@/components/math/MathSolverPage'),
  { ssr: false, loading: () => <div className="math-loading">{loadingLabel()}</div> }
);

export default function MathPage() {
  return (
    <>
      <MathSolverPage />
      <style jsx global>{`
        .math-loading {
          display: flex; align-items: center; justify-content: center;
          height: 100dvh; font-size: 16px; color: var(--text-muted);
        }
      `}</style>
    </>
  );
}
