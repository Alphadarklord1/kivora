'use client';

import { useEffect } from 'react';
import { StudyAnalytics } from '@/components/analytics/StudyAnalytics';

export default function AnalyticsPage() {
  useEffect(() => { document.title = 'Analytics — Kivora'; }, []);
  return <StudyAnalytics />;
}
