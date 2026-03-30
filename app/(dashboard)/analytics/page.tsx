'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

const StudyAnalytics = dynamic(
  () => import('@/components/analytics/StudyAnalytics').then((mod) => mod.StudyAnalytics),
  { ssr: false, loading: () => <div className="tool-loading">Loading analytics…</div> },
);

export default function AnalyticsPage() {
  useEffect(() => { document.title = 'Analytics — Kivora'; }, []);
  return <StudyAnalytics />;
}
