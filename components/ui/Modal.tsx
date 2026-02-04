'use client';

import React, { useEffect, useCallback, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  footer?: React.ReactNode;
}

const SIZES = {
  sm: '400px',
  md: '500px',
  lg: '640px',
  xl: '800px',
  full: '95vw',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  // Focus trap and body scroll lock
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      modalRef.current?.focus();
    } else {
      document.body.style.overflow = '';
      previousActiveElement.current?.focus();
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnOverlayClick && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        animation: 'modalFadeIn 0.2s ease-out',
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--bg-primary, white)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: SIZES[size],
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalSlideIn 0.2s ease-out',
          outline: 'none',
        }}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color, #e5e7eb)',
            }}
          >
            <div>
              {title && (
                <h2
                  id="modal-title"
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary, #1f2937)',
                  }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="modal-description"
                  style={{
                    margin: '4px 0 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary, #6b7280)',
                  }}
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                style={{
                  padding: '8px',
                  marginLeft: '16px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary, #9ca3af)',
                  fontSize: '20px',
                  lineHeight: 1,
                  transition: 'background-color 0.15s, color 0.15s',
                }}
                aria-label="Close modal"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f3f4f6)';
                  e.currentTarget.style.color = 'var(--text-primary, #1f2937)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary, #9ca3af)';
                }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color, #e5e7eb)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
            }}
          >
            {footer}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes modalSlideIn {
          from {
            transform: translateY(-20px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// Button components for modal footer
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    opacity: disabled || loading ? 0.6 : 1,
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 12px', fontSize: '13px' },
    md: { padding: '10px 16px', fontSize: '14px' },
    lg: { padding: '12px 20px', fontSize: '15px' },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--accent-color, #3b82f6)',
      color: 'white',
    },
    secondary: {
      backgroundColor: 'var(--bg-secondary, #f3f4f6)',
      color: 'var(--text-primary, #1f2937)',
    },
    danger: {
      backgroundColor: '#ef4444',
      color: 'white',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-primary, #1f2937)',
    },
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
    >
      {loading && (
        <span
          style={{
            width: '14px',
            height: '14px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}

// Confirm Dialog
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const iconColors = {
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  const icons = {
    danger: '⚠',
    warning: '⚠',
    info: 'ℹ',
  };

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 16px',
            borderRadius: '50%',
            backgroundColor: `${iconColors[variant]}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}
        >
          <span style={{ color: iconColors[variant] }}>{icons[variant]}</span>
        </div>

        <h3
          style={{
            margin: '0 0 8px',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary, #1f2937)',
          }}
        >
          {title}
        </h3>

        <p
          style={{
            margin: '0 0 24px',
            fontSize: '14px',
            color: 'var(--text-secondary, #6b7280)',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Modal>
  );
}
