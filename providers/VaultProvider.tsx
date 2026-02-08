'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  hasVault,
  createVault,
  unlockVault,
  lockVault,
  restoreVaultFromSession,
  changeVaultPassword,
  deleteVault,
} from '@/lib/crypto/vault';

interface VaultContextType {
  // State
  isSetup: boolean; // Has vault been created
  isUnlocked: boolean; // Is vault currently accessible
  isLoading: boolean;

  // Actions
  setupVault: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  changePassword: (current: string, newPass: string) => Promise<boolean>;
  destroyVault: () => void;
}

const VaultContext = createContext<VaultContextType>({
  isSetup: false,
  isUnlocked: false,
  isLoading: true,
  setupVault: async () => {},
  unlock: async () => false,
  lock: () => {},
  changePassword: async () => false,
  destroyVault: () => {},
});

export function useVault() {
  return useContext(VaultContext);
}

interface VaultProviderProps {
  children: ReactNode;
}

export function VaultProvider({ children }: VaultProviderProps) {
  const [isSetup, setIsSetup] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check vault status on mount
  useEffect(() => {
    const checkVault = async () => {
      setIsLoading(true);

      // Check if vault exists
      const vaultExists = hasVault();
      setIsSetup(vaultExists);

      if (vaultExists) {
        // Try to restore from session
        const restored = await restoreVaultFromSession();
        setIsUnlocked(restored);
      }

      setIsLoading(false);
    };

    checkVault();
  }, []);

  const lock = useCallback(() => {
    lockVault();
    setIsUnlocked(false);
  }, []);

  // Auto-lock after inactivity (15 minutes)
  useEffect(() => {
    if (!isUnlocked) return;

    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        lock();
      }, 15 * 60 * 1000); // 15 minutes
    };

    // Reset timer on user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      clearTimeout(timeout);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isUnlocked, lock]);

  const setupVault = useCallback(async (password: string) => {
    await createVault(password);
    setIsSetup(true);
    setIsUnlocked(true);
  }, []);

  const unlock = useCallback(async (password: string) => {
    const success = await unlockVault(password);
    setIsUnlocked(success);
    return success;
  }, []);

  const changePassword = useCallback(async (current: string, newPass: string) => {
    try {
      await changeVaultPassword(current, newPass);
      return true;
    } catch {
      return false;
    }
  }, []);

  const destroyVault = useCallback(() => {
    deleteVault();
    setIsSetup(false);
    setIsUnlocked(false);
  }, []);

  return (
    <VaultContext.Provider
      value={{
        isSetup,
        isUnlocked,
        isLoading,
        setupVault,
        unlock,
        lock,
        changePassword,
        destroyVault,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

/**
 * Component that requires vault to be unlocked
 * Shows unlock prompt if vault is locked
 */
interface VaultGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function VaultGate({ children, fallback }: VaultGateProps) {
  const { isSetup, isUnlocked, isLoading, setupVault, unlock } = useVault();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoading) {
    return fallback || <div className="vault-loading">Loading...</div>;
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!isSetup) {
        // Setting up new vault
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          return;
        }
        await setupVault(password);
      } else {
        // Unlocking existing vault
        const success = await unlock(password);
        if (!success) {
          setError('Incorrect password');
        }
      }
    } catch {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vault-unlock">
      <div className="vault-card">
        <div className="vault-icon">🔐</div>
        <h2>{isSetup ? 'Unlock Your Data' : 'Set Up Encryption'}</h2>
        <p>
          {isSetup
            ? 'Enter your encryption password to access your data'
            : 'Create a password to encrypt your data. This password is never sent to our servers.'}
        </p>

        <form onSubmit={handleUnlock}>
          {error && <div className="vault-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="vault-password">
              {isSetup ? 'Password' : 'Create Password'}
            </label>
            <input
              id="vault-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSetup ? 'Enter password' : 'At least 8 characters'}
              required
              autoFocus
            />
          </div>

          {!isSetup && (
            <div className="form-group">
              <label htmlFor="vault-confirm">Confirm Password</label>
              <input
                id="vault-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>
          )}

          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Please wait...' : isSetup ? 'Unlock' : 'Set Up Encryption'}
          </button>
        </form>

        <div className="vault-info">
          <strong>Important:</strong>
          <ul>
            <li>Your data is encrypted on your device</li>
            <li>We cannot recover your password</li>
            <li>If you forget it, your data cannot be recovered</li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        .vault-unlock {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          background: var(--bg-base);
        }

        .vault-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          padding: var(--space-8);
          max-width: 400px;
          width: 100%;
          text-align: center;
        }

        .vault-icon {
          font-size: 48px;
          margin-bottom: var(--space-4);
        }

        .vault-card h2 {
          margin-bottom: var(--space-2);
        }

        .vault-card > p {
          color: var(--text-muted);
          margin-bottom: var(--space-6);
          font-size: var(--font-meta);
        }

        .vault-error {
          background: var(--error-muted);
          color: var(--error);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }

        .form-group {
          text-align: left;
          margin-bottom: var(--space-4);
        }

        .form-group label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .btn {
          width: 100%;
          margin-top: var(--space-2);
        }

        .vault-info {
          margin-top: var(--space-6);
          padding: var(--space-4);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          text-align: left;
          font-size: var(--font-tiny);
        }

        .vault-info strong {
          display: block;
          margin-bottom: var(--space-2);
          color: var(--warning);
        }

        .vault-info ul {
          margin: 0;
          padding-left: var(--space-4);
          color: var(--text-muted);
        }

        .vault-info li {
          margin-bottom: var(--space-1);
        }
      `}</style>
    </div>
  );
}
