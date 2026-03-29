'use client';

import { useEffect, useRef } from 'react';
import { ScholarHubPage } from '@/components/coach/ScholarHubPage';
import styles from './ScholarHubDrawer.module.css';

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
        className={styles.backdrop}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Scholar Hub"
        className={styles.panel}
      >
        {/* Drawer header bar */}
        <div className={styles.header}>
          <div className={styles.title}>
            <span style={{ fontSize: 18 }}>🎓</span>
            <strong>Scholar Hub</strong>
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close Scholar Hub"
            className={styles.closeButton}
          >
            ✕
          </button>
        </div>

        {/* Scholar Hub content — scrollable */}
        <div className={styles.content}>
          <ScholarHubPage drawerMode onClose={onClose} />
        </div>
      </div>
    </>
  );
}
