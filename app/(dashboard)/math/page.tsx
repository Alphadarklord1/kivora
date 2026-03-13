'use client';

import dynamic from 'next/dynamic';

const MathSolverPage = dynamic(
  () => import('@/components/math/MathSolverPage'),
  { ssr: false, loading: () => <div className="math-loading">Loading Math Solver…</div> }
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
