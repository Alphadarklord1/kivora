'use client';

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius = '4px',
  className,
  style,
}: SkeletonProps) {
  return (
    <>
      <div
        className={className}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
          borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
          backgroundColor: 'var(--skeleton-bg, #e5e7eb)',
          animation: 'skeletonPulse 1.5s ease-in-out infinite',
          ...style,
        }}
      />
      <style jsx global>{`
        @keyframes skeletonPulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        [data-theme='dark'] {
          --skeleton-bg: #374151;
        }
      `}</style>
    </>
  );
}

// Pre-built skeleton patterns
export function SkeletonText({ lines = 3, lastLineWidth = '60%' }: { lines?: number; lastLineWidth?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          height="14px"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #e5e7eb)',
        backgroundColor: 'var(--bg-primary, white)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Skeleton width={40} height={40} borderRadius="50%" />
        <div style={{ flex: 1 }}>
          <Skeleton width="60%" height="16px" style={{ marginBottom: '8px' }} />
          <Skeleton width="40%" height="12px" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '16px',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-secondary, #f9fafb)',
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} width="80%" height="14px" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: '16px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color, #e5e7eb)',
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              width={colIndex === 0 ? '70%' : '50%'}
              height="14px"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ items = 5 }: { items?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #e5e7eb)',
          }}
        >
          <Skeleton width={32} height={32} borderRadius="6px" />
          <div style={{ flex: 1 }}>
            <Skeleton width="50%" height="14px" style={{ marginBottom: '6px' }} />
            <Skeleton width="30%" height="12px" />
          </div>
          <Skeleton width={60} height={28} borderRadius="4px" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonQuiz() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #e5e7eb)',
          }}
        >
          <Skeleton width="80%" height="18px" style={{ marginBottom: '16px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Skeleton width={20} height={20} borderRadius="50%" />
                <Skeleton width="60%" height="14px" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonFolderTree() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}>
            <Skeleton width={16} height={16} borderRadius="2px" />
            <Skeleton width={16} height={16} borderRadius="2px" />
            <Skeleton width={`${100 - i * 10}px`} height="14px" />
          </div>
          {i < 2 && (
            <div style={{ marginLeft: '32px' }}>
              {Array.from({ length: 2 }).map((_, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                  }}
                >
                  <Skeleton width={14} height={14} borderRadius="2px" />
                  <Skeleton width={`${80 - j * 15}px`} height="12px" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
