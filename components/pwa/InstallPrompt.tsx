'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  });
  const [isStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  });

  useEffect(() => {

    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const dismissedAt = dismissed ? parseInt(dismissed, 10) : 0;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Don't show if dismissed less than a week ago
    if (Date.now() - dismissedAt < oneWeek) {
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show manual install instructions after a delay
    if (isIOS && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isIOS, isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already installed
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="install-prompt">
      <div className="install-content">
        <div className="install-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="install-text">
          <strong>Install StudyHarbor</strong>
          {isIOS ? (
            <span>
              Tap <span className="share-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 5l-1.42 1.42-1.59-1.59V16h-2V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V10a2 2 0 012-2h3v2H6v11h12V10h-3V8h3a2 2 0 012 2z"/>
                </svg>
              </span> then &ldquo;Add to Home Screen&rdquo;
            </span>
          ) : (
            <span>Add to your home screen for quick access</span>
          )}
        </div>
        <div className="install-actions">
          {!isIOS && (
            <button className="install-btn primary" onClick={handleInstall}>
              Install
            </button>
          )}
          <button className="install-btn secondary" onClick={handleDismiss}>
            {isIOS ? 'Got it' : 'Not now'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .install-prompt {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          padding: var(--space-4);
          padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .install-content {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          max-width: 600px;
          margin: 0 auto;
        }

        .install-icon {
          width: 48px;
          height: 48px;
          background: var(--primary-muted);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          flex-shrink: 0;
        }

        .install-text {
          flex: 1;
          min-width: 0;
        }

        .install-text strong {
          display: block;
          font-size: var(--font-body);
          font-weight: var(--weight-semibold);
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .install-text span {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .share-icon {
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
          color: var(--primary);
        }

        .install-actions {
          display: flex;
          gap: var(--space-2);
          flex-shrink: 0;
        }

        .install-btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          font-weight: var(--weight-medium);
          cursor: pointer;
          transition: all 0.15s;
          border: none;
        }

        .install-btn.primary {
          background: var(--primary);
          color: white;
        }

        .install-btn.primary:hover {
          background: var(--primary-hover);
        }

        .install-btn.secondary {
          background: var(--bg-inset);
          color: var(--text-secondary);
        }

        .install-btn.secondary:hover {
          background: var(--bg-hover);
        }

        @media (max-width: 480px) {
          .install-content {
            flex-wrap: wrap;
          }

          .install-text {
            flex: 1 1 calc(100% - 64px);
          }

          .install-actions {
            width: 100%;
            justify-content: flex-end;
            margin-top: var(--space-2);
          }
        }
      `}</style>
    </div>
  );
}
