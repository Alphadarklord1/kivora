'use client';

import { useState } from 'react';
import { useVault } from '@/providers/VaultProvider';

export function VaultStatus() {
  const { isSetup, isUnlocked, lock, isLoading } = useVault();
  const [showTooltip, setShowTooltip] = useState(false);

  if (isLoading) {
    return (
      <div className="vault-status loading">
        <span className="vault-icon">...</span>
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
        aria-label={isUnlocked ? 'Lock vault' : 'Vault locked'}
      >
        <span className="vault-icon">{isUnlocked ? '🔓' : '🔐'}</span>
        <span className="vault-text">
          {!isSetup ? 'Not Set Up' : isUnlocked ? 'Encrypted' : 'Locked'}
        </span>
      </button>

      {showTooltip && (
        <div className="vault-tooltip">
          <div className="tooltip-header">
            {isUnlocked ? 'End-to-End Encrypted' : 'Vault Locked'}
          </div>
          <p className="tooltip-content">
            {!isSetup
              ? 'Set up encryption to protect your data'
              : isUnlocked
              ? 'Your data is encrypted before leaving your device. Click to lock.'
              : 'Enter your password to access your encrypted data'}
          </p>
          <div className="tooltip-features">
            <div className="feature">
              <span className="check">✓</span>
              <span>Client-side encryption</span>
            </div>
            <div className="feature">
              <span className="check">✓</span>
              <span>Zero-knowledge architecture</span>
            </div>
            <div className="feature">
              <span className="check">✓</span>
              <span>AES-256 encryption</span>
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
          border-color: var(--success);
          color: var(--success);
        }

        .vault-indicator.locked {
          border-color: var(--warning);
          color: var(--warning);
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
          color: var(--success);
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
