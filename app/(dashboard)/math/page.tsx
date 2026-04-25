'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const MathSolverPage = dynamic(
  () => import('@/components/math/MathSolverPage'),
  { ssr: false, loading: () => <div className="math-loading">Loading Math Solver…</div> }
);

type MathPanel = 'algebra' | 'graph' | 'formulas' | 'visual' | 'matlab' | 'units' | 'write';
const MATH_PANELS = new Set<MathPanel>(['algebra', 'graph', 'formulas', 'visual', 'matlab', 'units', 'write']);

function MathContent() {
  const params = useSearchParams();
  const requestedPanel = params.get('panel');
  const panel = requestedPanel && MATH_PANELS.has(requestedPanel as MathPanel)
    ? requestedPanel as MathPanel
    : undefined;
  return <MathSolverPage defaultPanel={panel} />;
}

export default function MathPage() {
  return (
    <>
      <Suspense fallback={<div className="math-loading">Loading Math Solver…</div>}>
        <MathContent />
      </Suspense>
      <style jsx global>{`
        .math-loading {
          display: flex; align-items: center; justify-content: center;
          height: 100dvh; font-size: 16px; color: var(--text-muted);
        }
      `}</style>
    </>
  );
}
