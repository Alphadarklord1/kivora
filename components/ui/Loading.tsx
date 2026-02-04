'use client';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

export function Loading({ size = 'md', text, fullScreen = false }: LoadingProps) {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  const spinnerSize = sizeMap[size];

  const content = (
    <div className="loading-container">
      <div className="spinner" style={{ width: spinnerSize, height: spinnerSize }} />
      {text && <p className="loading-text">{text}</p>}

      <style jsx>{`
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          padding: var(--space-4);
        }

        .spinner {
          border: 3px solid var(--border-subtle);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .loading-text {
          color: var(--text-muted);
          font-size: var(--font-meta);
        }
      `}</style>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="loading-fullscreen">
        {content}
        <style jsx>{`
          .loading-fullscreen {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-base);
            z-index: 9999;
          }
        `}</style>
      </div>
    );
  }

  return content;
}

// Skeleton loading for cards
export function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius = 'var(--radius-sm)'
}: {
  width?: string;
  height?: string;
  borderRadius?: string;
}) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius }}
    >
      <style jsx>{`
        .skeleton {
          background: linear-gradient(
            90deg,
            var(--bg-inset) 25%,
            var(--bg-elevated) 50%,
            var(--bg-inset) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}

// Card skeleton
export function CardSkeleton() {
  return (
    <div className="card-skeleton">
      <Skeleton height="120px" borderRadius="var(--radius-lg)" />
      <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Skeleton height="16px" width="70%" />
        <Skeleton height="14px" width="40%" />
      </div>
    </div>
  );
}
