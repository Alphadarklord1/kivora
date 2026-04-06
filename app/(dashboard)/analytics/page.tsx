'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

function loadingLabel() {
  if (typeof document !== 'undefined') {
    if (document.documentElement.lang === 'ar') return 'جارٍ تحميل التحليلات…';
    if (document.documentElement.lang === 'fr') return 'Chargement des statistiques…';
  }
  return 'Loading analytics…';
}

const StudyAnalytics = dynamic(
  () => import('@/components/analytics/StudyAnalytics').then((mod) => mod.StudyAnalytics),
  { ssr: false, loading: () => <div className="tool-loading">{loadingLabel()}</div> },
);

export default function AnalyticsPage() {
  useEffect(() => { document.title = 'Analytics — Kivora'; }, []);
  return <StudyAnalytics />;
}
