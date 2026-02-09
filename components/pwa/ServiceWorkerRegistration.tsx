'use client';

import { useEffect, useState, useCallback } from 'react';

export function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage('skipWaiting');
      window.location.reload();
    }
  }, [waitingWorker]);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    let intervalId: number | null = null;
    let registrationRef: ServiceWorkerRegistration | null = null;

    const handleControllerChange = () => {
      window.location.reload();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef) {
        registrationRef.update();
      }
    };

    const registerWorker = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registrationRef = registration;
          console.log('SW registered:', registration.scope);

          // Detect updates immediately on load
          registration.update();

          // If an update is already waiting, surface it
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setUpdateAvailable(true);
          }

          // Check for updates periodically
          intervalId = window.setInterval(() => {
            registration.update();
          }, 5 * 60 * 1000);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  setWaitingWorker(newWorker);
                  setUpdateAvailable(true);
                }
              });
            }
          });
        })
        .catch((error) => {
          console.log('SW registration failed:', error);
        });
    };

    window.addEventListener('load', registerWorker);
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('load', registerWorker);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="update-banner">
      <div className="update-content">
        <div className="update-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </div>
        <span>A new version is available!</span>
        <button onClick={handleUpdate}>Update Now</button>
        <button className="dismiss" onClick={() => setUpdateAvailable(false)}>Later</button>
      </div>

      <style jsx>{`
        .update-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 9999;
          background: var(--primary);
          color: white;
          padding: var(--space-3) var(--space-4);
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .update-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          max-width: 600px;
          margin: 0 auto;
          font-size: var(--font-meta);
          font-weight: var(--weight-medium);
        }

        .update-icon {
          display: flex;
          align-items: center;
        }

        button {
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
          font-weight: var(--weight-medium);
          cursor: pointer;
          transition: all 0.15s;
          border: none;
          background: white;
          color: var(--primary);
        }

        button:hover {
          background: rgba(255, 255, 255, 0.9);
        }

        button.dismiss {
          background: transparent;
          color: rgba(255, 255, 255, 0.8);
        }

        button.dismiss:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        @media (max-width: 480px) {
          .update-content span {
            display: none;
          }

          .update-content::after {
            content: 'Update available';
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
