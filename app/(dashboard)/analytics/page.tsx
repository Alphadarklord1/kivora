'use client';

import { StudyAnalytics } from '@/components/analytics/StudyAnalytics';

export default function AnalyticsPage() {
  return (
    <div className="analytics-page">
      <StudyAnalytics />

      <style jsx>{`
        .analytics-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        @media (max-width: 600px) {
          .analytics-page {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
