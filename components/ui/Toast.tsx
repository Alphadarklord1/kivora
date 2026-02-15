'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Convenience hooks for common toast types
export function useToastHelpers() {
  const { addToast } = useToast();

  return {
    success: (title: string, message?: string) =>
      addToast({ type: 'success', title, message }),
    error: (title: string, message?: string) =>
      addToast({ type: 'error', title, message, duration: 6000 }),
    warning: (title: string, message?: string) =>
      addToast({ type: 'warning', title, message }),
    info: (title: string, message?: string) =>
      addToast({ type: 'info', title, message }),
  };
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'var(--toast-success-bg, #ecfdf5)',
    border: 'var(--toast-success-border, #10b981)',
    icon: 'var(--toast-success-icon, #059669)',
  },
  error: {
    bg: 'var(--toast-error-bg, #fef2f2)',
    border: 'var(--toast-error-border, #ef4444)',
    icon: 'var(--toast-error-icon, #dc2626)',
  },
  warning: {
    bg: 'var(--toast-warning-bg, #fffbeb)',
    border: 'var(--toast-warning-border, #f59e0b)',
    icon: 'var(--toast-warning-icon, #d97706)',
  },
  info: {
    bg: 'var(--toast-info-bg, #eff6ff)',
    border: 'var(--toast-info-border, #3b82f6)',
    icon: 'var(--toast-info-icon, #2563eb)',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 4000;

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, handleDismiss]);

  const colors = COLORS[toast.type];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        backgroundColor: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        minWidth: '320px',
        maxWidth: '420px',
        position: 'relative',
        overflow: 'hidden',
        animation: isExiting ? 'toastSlideOut 0.2s ease-out' : 'toastSlideIn 0.3s ease-out',
      }}
      role="alert"
    >
      {/* Icon */}
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: colors.icon,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          flexShrink: 0,
        }}
      >
        {ICONS[toast.type]}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '14px',
            color: 'var(--text-primary, #1f2937)',
            marginBottom: toast.message ? '4px' : 0,
          }}
        >
          {toast.title}
        </div>
        {toast.message && (
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary, #6b7280)',
              lineHeight: 1.4,
            }}
          >
            {toast.message}
          </div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              handleDismiss();
            }}
            style={{
              marginTop: '8px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: colors.icon,
              backgroundColor: 'transparent',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        style={{
          padding: '4px',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary, #9ca3af)',
          fontSize: '18px',
          lineHeight: 1,
          borderRadius: '4px',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: '3px',
          backgroundColor: colors.border,
          width: `${progress}%`,
          transition: 'width 50ms linear',
          opacity: 0.5,
        }}
      />
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}

      {/* Toast container */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={toast} onDismiss={() => removeToast(toast.id)} />
          </div>
        ))}
      </div>

      {/* Animations */}
      <style jsx global>{`
        @keyframes toastSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes toastSlideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        /* Dark mode support */
        [data-theme='dark'],
        [data-theme='blue'],
        [data-theme='black'] {
          --toast-success-bg: #064e3b;
          --toast-success-border: #10b981;
          --toast-success-icon: #34d399;
          --toast-error-bg: #7f1d1d;
          --toast-error-border: #ef4444;
          --toast-error-icon: #f87171;
          --toast-warning-bg: #78350f;
          --toast-warning-border: #f59e0b;
          --toast-warning-icon: #fbbf24;
          --toast-info-bg: #1e3a5f;
          --toast-info-border: #3b82f6;
          --toast-info-icon: #60a5fa;
        }

        @media (max-width: 480px) {
          .toast-container {
            left: 10px;
            right: 10px;
            top: auto;
            bottom: 80px;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
