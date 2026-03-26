'use client';

import { useEffect, useRef } from 'react';
import { RevisionCoachPage } from '@/components/coach/RevisionCoachPage';

interface ScholarHubDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function ScholarHubDrawer({ open, onClose }: ScholarHubDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
          animation: 'scholarBackdropIn 0.2s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Scholar Hub"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 1001,
          width: 'min(720px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border-2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
          animation: 'scholarDrawerIn 0.22s cubic-bezier(0.32,0,0.12,1)',
        }}
      >
        {/* Drawer header bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-2)',
          flexShrink: 0,
          background: 'var(--surface)',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎓</span>
            <strong style={{ fontSize: 'var(--text-sm)' }}>Scholar Hub</strong>
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close Scholar Hub"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-3)',
              fontSize: 20,
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scholar Hub content — scrollable */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <RevisionCoachPage drawerMode onClose={onClose} />
        </div>
      </div>

      <style>{`
        @keyframes scholarBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scholarDrawerIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
