'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useVault } from '@/providers/VaultProvider';
import { ENCRYPTION_DISABLED } from '@/lib/crypto/vault';
import { useSettings } from '@/providers/SettingsProvider';

export function VaultStatus() {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = (key: string) => {
    const ar: Record<string, string> = {
      'Encryption paused': 'التشفير معطل في النسخة التجريبية',
      'Encryption Paused': 'التشفير معطل في النسخة التجريبية',
      'Encryption disabled for beta': 'التشفير معطل في النسخة التجريبية',
      'Local vault password prompts are turned off until encryption returns in a later beta update.': 'تم إيقاف مطالبات كلمة مرور الخزنة المحلية حتى يعود التشفير في تحديث تجريبي لاحق.',
      'Lock vault': 'قفل الخزنة',
      'Vault locked': 'الخزنة مقفلة',
      'Not Set Up': 'غير مُعد',
      Encrypted: 'مشفّر',
      Locked: 'مقفل',
      'End-to-End Encrypted': 'تشفير طرفي كامل',
      'Set up encryption to protect your data': 'قم بإعداد التشفير لحماية بياناتك',
      'Your data is encrypted before leaving your device. Click to lock.': 'تُشفّر بياناتك قبل مغادرة جهازك. انقر للقفل.',
      'Enter your password to access your encrypted data': 'أدخل كلمة المرور للوصول إلى بياناتك المشفرة',
      'Client-side encryption': 'تشفير على جهاز العميل',
      'Zero-knowledge architecture': 'بنية بدون معرفة مسبقة',
      'AES-256 encryption': 'تشفير AES-256',
      'Vault Locked': 'الخزنة مقفلة',
    };
    return isArabic ? (ar[key] || key) : key;
  };
  const { isSetup, isUnlocked, lock, isLoading } = useVault();
  const [showTooltip, setShowTooltip] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const indicatorRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const closeTooltip = useCallback(() => setShowTooltip(false), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouchDevice(mediaQuery.matches);
    update();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  const updateTooltipPosition = useCallback(() => {
    if (!indicatorRef.current) return;

    const rect = indicatorRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(320, Math.max(240, window.innerWidth - 24));
    const tooltipHeight = tooltipRef.current?.offsetHeight || 190;
    const horizontalPadding = 8;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, horizontalPadding),
      window.innerWidth - tooltipWidth - horizontalPadding
    );
    const aboveTop = rect.top - tooltipHeight - 10;
    const top = aboveTop >= horizontalPadding ? aboveTop : rect.bottom + 10;

    setTooltipStyle({
      position: 'fixed',
      top,
      left,
      width: tooltipWidth,
      zIndex: 1300,
    });
  }, []);

  useEffect(() => {
    if (!showTooltip) return;
    updateTooltipPosition();

    const handleResizeOrScroll = () => updateTooltipPosition();
    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);
    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [showTooltip, updateTooltipPosition]);

  useEffect(() => {
    if (!showTooltip) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (indicatorRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      closeTooltip();
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTooltip();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [closeTooltip, showTooltip]);

  if (isLoading) {
    return (
      <div className="vault-status loading">
        <span className="vault-icon">...</span>
      </div>
    );
  }

  if (ENCRYPTION_DISABLED) {
    return (
      <div className="vault-status">
        <button
          ref={indicatorRef}
          className="vault-indicator paused"
          aria-label={t('Encryption disabled for beta')}
          onClick={() => setShowTooltip((prev) => !prev)}
          onFocus={() => setShowTooltip(true)}
        >
          <span className="vault-icon">⏸️</span>
          <span className="vault-text">{t('Encryption Paused')}</span>
        </button>
        {showTooltip && (
          <div ref={tooltipRef} className="vault-tooltip beta-tooltip" style={tooltipStyle}>
            <div className="tooltip-header">{t('Encryption disabled for beta')}</div>
            <p className="tooltip-content">{t('Local vault password prompts are turned off until encryption returns in a later beta update.')}</p>
          </div>
        )}
        <style jsx>{`
          .vault-status {
            position: relative;
          }
          .vault-indicator {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            background: transparent;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-full);
            cursor: default;
            font-size: var(--font-meta);
            color: var(--text-secondary);
          }
          .vault-indicator.paused {
            border-color: var(--border-default);
            color: var(--text-secondary);
          }

          .beta-tooltip {
            padding: var(--space-3);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
            background: color-mix(in srgb, var(--bg-elevated) 96%, var(--bg-base));
            box-shadow: var(--shadow-lg);
          }

          .tooltip-header {
            font-weight: 600;
            margin-bottom: var(--space-2);
            color: var(--text-primary);
          }

          .tooltip-content {
            margin: 0;
            color: var(--text-muted);
            line-height: 1.5;
            font-size: var(--font-caption);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="vault-status"
      onMouseEnter={() => {
        if (!isTouchDevice) setShowTooltip(true);
      }}
      onMouseLeave={() => {
        if (!isTouchDevice) closeTooltip();
      }}
    >
      <button
        ref={indicatorRef}
        className={`vault-indicator ${isUnlocked ? 'unlocked' : 'locked'}`}
        onClick={() => {
          if (isTouchDevice) {
            setShowTooltip((prev) => !prev);
            return;
          }
          if (isUnlocked) {
            lock();
            closeTooltip();
          }
        }}
        onFocus={() => setShowTooltip(true)}
        aria-label={isUnlocked ? t('Lock vault') : t('Vault locked')}
      >
        <span className="vault-icon">{isUnlocked ? '🔓' : '🔐'}</span>
        <span className="vault-text">
          {!isSetup ? t('Not Set Up') : isUnlocked ? t('Encrypted') : t('Locked')}
        </span>
      </button>

      {showTooltip && (
        <div ref={tooltipRef} className="vault-tooltip" style={tooltipStyle}>
          <div className="tooltip-header">
            {isUnlocked ? t('End-to-End Encrypted') : t('Vault Locked')}
          </div>
          <p className="tooltip-content">
            {!isSetup
              ? t('Set up encryption to protect your data')
              : isUnlocked
              ? t('Your data is encrypted before leaving your device. Click to lock.')
              : t('Enter your password to access your encrypted data')}
          </p>
          <div className="tooltip-features">
            <div className="feature">
              <span className="check">✓</span>
              <span>{t('Client-side encryption')}</span>
            </div>
            <div className="feature">
              <span className="check">✓</span>
              <span>{t('Zero-knowledge architecture')}</span>
            </div>
            <div className="feature">
              <span className="check">✓</span>
              <span>{t('AES-256 encryption')}</span>
            </div>
          </div>
          {isUnlocked && (
            <button
              className="tooltip-action"
              onClick={() => {
                lock();
                closeTooltip();
              }}
            >
              {t('Lock vault')}
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .vault-status {
          position: relative;
        }

        .vault-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full);
          cursor: pointer;
          font-size: var(--font-meta);
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }

        .vault-indicator:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
        }

        .vault-indicator.unlocked {
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border-default));
          color: var(--primary);
        }

        .vault-indicator.locked {
          border-color: var(--border-default);
          color: var(--text-secondary);
        }

        .vault-icon {
          font-size: 14px;
        }

        .vault-text {
          font-weight: 500;
        }

        .vault-tooltip {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          box-shadow: var(--shadow-lg);
        }

        .tooltip-header {
          font-weight: 600;
          margin-bottom: var(--space-2);
          font-size: var(--font-base);
        }

        .tooltip-content {
          color: var(--text-muted);
          font-size: var(--font-meta);
          margin-bottom: var(--space-3);
          line-height: 1.5;
        }

        .tooltip-features {
          border-top: 1px solid var(--border-subtle);
          padding-top: var(--space-3);
        }

        .feature {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          margin-bottom: var(--space-1);
        }

        .feature .check {
          color: var(--primary);
        }

        .tooltip-action {
          margin-top: var(--space-3);
          width: 100%;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-base);
          color: var(--text-primary);
          padding: var(--space-2) var(--space-3);
          font-size: var(--font-meta);
          font-weight: 600;
          cursor: pointer;
        }

        .tooltip-action:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
        }

        .vault-status.loading .vault-icon {
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 768px) {
          .vault-text {
            display: none;
          }

          .vault-indicator {
            padding: var(--space-2);
          }
        }
      `}</style>
    </div>
  );
}
