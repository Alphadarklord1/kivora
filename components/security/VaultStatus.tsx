'use client';

import { useState } from 'react';
import { useVault } from '@/providers/VaultProvider';
import { ENCRYPTION_DISABLED } from '@/lib/crypto/vault';
import { useSettings } from '@/providers/SettingsProvider';

export function VaultStatus() {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = (key: string) => {
    const ar: Record<string, string> = {
      'Encryption paused': 'التشفير متوقف مؤقتًا',
      'Encryption Paused': 'التشفير متوقف مؤقتًا',
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
        <button className="vault-indicator paused" aria-label={t('Encryption paused')}>
          <span className="vault-icon">⏸️</span>
          <span className="vault-text">{t('Encryption Paused')}</span>
        </button>
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
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="vault-status"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        className={`vault-indicator ${isUnlocked ? 'unlocked' : 'locked'}`}
        onClick={isUnlocked ? lock : undefined}
        aria-label={isUnlocked ? t('Lock vault') : t('Vault locked')}
      >
        <span className="vault-icon">{isUnlocked ? '🔓' : '🔐'}</span>
        <span className="vault-text">
          {!isSetup ? t('Not Set Up') : isUnlocked ? t('Encrypted') : t('Locked')}
        </span>
      </button>

      {showTooltip && (
        <div className="vault-tooltip">
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
          position: absolute;
          top: calc(100% + var(--space-2));
          right: 0;
          width: 280px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          box-shadow: var(--shadow-lg);
          z-index: 1000;
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

          .vault-tooltip {
            right: -50px;
            width: 260px;
          }
        }
      `}</style>
    </div>
  );
}
