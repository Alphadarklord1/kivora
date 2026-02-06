'use client';

import { StudyPlanner } from '@/components/tools/StudyPlanner';

export default function PlannerPage() {
  return (
    <div className="planner-page">
      <div className="planner-container">
        <StudyPlanner />
      </div>

      <style jsx>{`
        .planner-page {
          max-width: 800px;
          margin: 0 auto;
          padding: var(--space-4);
        }

        .planner-container {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
        }

        @media (max-width: 600px) {
          .planner-page {
            padding: var(--space-2);
          }

          .planner-container {
            padding: var(--space-3);
          }
        }
      `}</style>
    </div>
  );
}
