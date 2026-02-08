'use client';

import { useState, useEffect } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { useVault } from '@/providers/VaultProvider';

type SettingsTab = 'profile' | 'appearance' | 'security' | 'account';

interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
  connectedAccounts: string[];
  stats: {
    folders: number;
    files: number;
    libraryItems: number;
  };
}

interface UserSettings {
  theme: string;
  fontSize: string;
  lineHeight: string;
  density: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Delete confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Vault encryption
  const vault = useVault();
  const [vaultCurrentPassword, setVaultCurrentPassword] = useState('');
  const [vaultNewPassword, setVaultNewPassword] = useState('');
  const [vaultConfirmPassword, setVaultConfirmPassword] = useState('');
  const [showResetVaultModal, setShowResetVaultModal] = useState(false);

  // OAuth linking
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

  useEffect(() => {
    fetchData();

    // Check URL params for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const linkedProvider = params.get('linked');
    const tabParam = params.get('tab');

    if (tabParam && ['profile', 'appearance', 'security', 'account'].includes(tabParam)) {
      setTab(tabParam as SettingsTab);
    }

    if (linkedProvider) {
      setMessage({ type: 'success', text: `${linkedProvider.charAt(0).toUpperCase() + linkedProvider.slice(1)} account connected successfully!` });
      setTimeout(() => setMessage(null), 3000);
      // Clean up URL
      window.history.replaceState({}, '', '/settings?tab=account');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accountRes, settingsRes] = await Promise.all([
        fetch('/api/account', { credentials: 'include' }),
        fetch('/api/settings', { credentials: 'include' }),
      ]);

      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAccount(accountData);
        setName(accountData.name || '');
        setEmail(accountData.email || '');
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
        applySettings(settingsData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applySettings = (s: UserSettings) => {
    const resolveTheme = (theme: string) => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme;
    };

    // Apply theme (resolve system to actual theme)
    const resolvedTheme = resolveTheme(s.theme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('studypilot_theme', s.theme);

    // Apply font size
    document.documentElement.style.setProperty('--font-scale', s.fontSize);
    localStorage.setItem('studypilot_fontSize', s.fontSize);

    // Apply line height scale
    document.documentElement.style.setProperty('--line-scale', s.lineHeight);
    localStorage.setItem('studypilot_lineHeight', s.lineHeight);

    // Apply density
    document.documentElement.setAttribute('data-density', s.density);
    localStorage.setItem('studypilot_density', s.density);
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email }),
      });

      if (res.ok) {
        const data = await res.json();
        setAccount(prev => prev ? { ...prev, ...data } : null);
        showMessage('success', 'Profile updated successfully');
      } else {
        const error = await res.json();
        showMessage('error', error.error || 'Failed to update profile');
      }
    } catch {
      showMessage('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (newSettings: Partial<UserSettings>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newSettings),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        applySettings(data);
        showMessage('success', 'Settings saved');
      } else {
        showMessage('error', 'Failed to save settings');
      }
    } catch {
      showMessage('error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showMessage('error', 'Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        showMessage('success', 'Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const error = await res.json();
        showMessage('error', error.error || 'Failed to change password');
      }
    } catch {
      showMessage('error', 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeVaultPassword = async () => {
    if (vaultNewPassword !== vaultConfirmPassword) {
      showMessage('error', 'Encryption passwords do not match');
      return;
    }

    if (vaultNewPassword.length < 8) {
      showMessage('error', 'Encryption password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const success = await vault.changePassword(vaultCurrentPassword, vaultNewPassword);
      if (success) {
        showMessage('success', 'Encryption password changed successfully');
        setVaultCurrentPassword('');
        setVaultNewPassword('');
        setVaultConfirmPassword('');
      } else {
        showMessage('error', 'Failed to change encryption password');
      }
    } catch {
      showMessage('error', 'Current encryption password is incorrect');
    } finally {
      setSaving(false);
    }
  };

  const handleResetVault = () => {
    vault.destroyVault();
    setShowResetVaultModal(false);
    showMessage('success', 'Encryption has been reset. Your encrypted data is now inaccessible.');
  };

  const handleLinkAccount = async (provider: 'google' | 'github') => {
    setLinkingProvider(provider);
    try {
      // Redirect to OAuth provider - when they come back, the account will be linked
      await signIn(provider, { callbackUrl: '/settings?tab=account&linked=' + provider });
    } catch {
      showMessage('error', `Failed to connect ${provider}`);
      setLinkingProvider(null);
    }
  };

  const handleUnlinkAccount = async (provider: string) => {
    setUnlinkingProvider(provider);
    try {
      const res = await fetch(`/api/account/link?provider=${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        showMessage('success', `${provider.charAt(0).toUpperCase() + provider.slice(1)} account disconnected`);
        // Refresh account data
        fetchData();
      } else {
        const error = await res.json();
        showMessage('error', error.error || `Failed to disconnect ${provider}`);
      }
    } catch {
      showMessage('error', `Failed to disconnect ${provider}`);
    } finally {
      setUnlinkingProvider(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      showMessage('error', 'Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      if (res.ok) {
        await signOut({ callbackUrl: '/login' });
      } else {
        const error = await res.json();
        showMessage('error', error.error || 'Failed to delete account');
      }
    } catch {
      showMessage('error', 'Failed to delete account');
    } finally {
      setSaving(false);
      setShowDeleteModal(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'account', label: 'Account', icon: '⚙️' },
  ];

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <h1>Settings</h1>
          <p>Manage your account and preferences</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="settings-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`settings-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {/* Profile Tab */}
          {tab === 'profile' && (
            <div className="settings-section">
              <h2>Profile Information</h2>
              <p className="section-description">Update your personal information</p>

              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              <button
                className="btn"
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              {/* Stats */}
              {account?.stats && (
                <div className="profile-stats">
                  <h3>Your Stats</h3>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-value">{account.stats.folders}</span>
                      <span className="stat-label">Folders</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{account.stats.files}</span>
                      <span className="stat-label">Files</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{account.stats.libraryItems}</span>
                      <span className="stat-label">Library Items</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Appearance Tab */}
          {tab === 'appearance' && settings && (
            <div className="settings-section">
              <h2>Appearance</h2>
              <p className="section-description">Customize how StudyPilot looks</p>

              {/* Theme */}
              <div className="form-group">
                <label>Theme</label>
                <div className="option-buttons">
                  {[
                    { value: 'light', label: 'Light', icon: '☀️' },
                    { value: 'dark', label: 'Dark', icon: '🌙' },
                    { value: 'system', label: 'System', icon: '💻' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn ${settings.theme === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ theme: option.value })}
                      disabled={saving}
                    >
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="form-group">
                <label>Font Size</label>
                <p className="option-description">Adjust the text size across the app</p>
                <div className="option-buttons">
                  {[
                    { value: '0.875', label: 'Small', preview: 'Aa' },
                    { value: '1', label: 'Normal', preview: 'Aa' },
                    { value: '1.125', label: 'Large', preview: 'Aa' },
                    { value: '1.25', label: 'Extra Large', preview: 'Aa' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn font-option ${settings.fontSize === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ fontSize: option.value })}
                      disabled={saving}
                      style={{ '--preview-scale': option.value } as React.CSSProperties}
                    >
                      <span className="font-preview">{option.preview}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Density */}
              <div className="form-group">
                <label>UI Density</label>
                <p className="option-description">Control spacing between elements</p>
                <div className="option-buttons density-buttons">
                  {[
                    { value: 'compact', label: 'Compact', icon: '▪️', desc: 'Tighter spacing' },
                    { value: 'normal', label: 'Normal', icon: '◾', desc: 'Balanced spacing' },
                    { value: 'comfortable', label: 'Comfortable', icon: '⬛', desc: 'More breathing room' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn density-option ${settings.density === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ density: option.value })}
                      disabled={saving}
                    >
                      <span className="density-icon">{option.icon}</span>
                      <span className="density-label">{option.label}</span>
                      <span className="density-desc">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Height */}
              <div className="form-group">
                <label>Line Height</label>
                <p className="option-description">Increase or decrease reading comfort</p>
                <div className="option-buttons">
                  {[
                    { value: '0.95', label: 'Tight' },
                    { value: '1', label: 'Normal' },
                    { value: '1.1', label: 'Relaxed' },
                    { value: '1.2', label: 'Extra' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn ${settings.lineHeight === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ lineHeight: option.value })}
                      disabled={saving}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Section */}
              <div className="appearance-preview">
                <label>Preview</label>
                <div className="preview-card">
                  <div className="preview-header">
                    <span className="preview-icon">📁</span>
                    <span className="preview-title">Sample Folder</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-file-icon">📄</span>
                    <div className="preview-file-info">
                      <span className="preview-file-name">Study Notes.pdf</span>
                      <span className="preview-file-meta">Added today</span>
                    </div>
                  </div>
                  <div className="preview-item">
                    <span className="preview-file-icon">📝</span>
                    <div className="preview-file-info">
                      <span className="preview-file-name">Quiz Questions</span>
                      <span className="preview-file-meta">Generated content</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {tab === 'security' && (
            <div className="settings-section">
              <h2>Security</h2>
              <p className="section-description">Manage your password, encryption, and security settings</p>

              {/* End-to-End Encryption Section */}
              <div className="security-card encryption-card">
                <div className="encryption-header">
                  <div className="encryption-status">
                    <span className="encryption-icon">{vault.isUnlocked ? '🔓' : '🔐'}</span>
                    <div>
                      <h3>End-to-End Encryption</h3>
                      <span className={`encryption-badge ${vault.isSetup ? (vault.isUnlocked ? 'active' : 'locked') : 'inactive'}`}>
                        {!vault.isSetup ? 'Not Set Up' : vault.isUnlocked ? 'Active & Unlocked' : 'Locked'}
                      </span>
                    </div>
                  </div>
                  {vault.isUnlocked && (
                    <button className="btn secondary small" onClick={vault.lock}>
                      Lock Now
                    </button>
                  )}
                </div>

                <div className="encryption-features">
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>AES-256 encryption (military grade)</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>Zero-knowledge architecture</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>Data encrypted before leaving your device</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>We cannot access your encrypted data</span>
                  </div>
                </div>

                {vault.isSetup && vault.isUnlocked && (
                  <>
                    <div className="encryption-divider"></div>
                    <h4>Change Encryption Password</h4>
                    <p className="helper-text">
                      This is separate from your login password. It&apos;s used to encrypt your data.
                    </p>

                    <div className="form-group">
                      <label htmlFor="vaultCurrentPassword">Current Encryption Password</label>
                      <input
                        id="vaultCurrentPassword"
                        type="password"
                        value={vaultCurrentPassword}
                        onChange={(e) => setVaultCurrentPassword(e.target.value)}
                        placeholder="Enter current encryption password"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="vaultNewPassword">New Encryption Password</label>
                      <input
                        id="vaultNewPassword"
                        type="password"
                        value={vaultNewPassword}
                        onChange={(e) => setVaultNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="vaultConfirmPassword">Confirm New Encryption Password</label>
                      <input
                        id="vaultConfirmPassword"
                        type="password"
                        value={vaultConfirmPassword}
                        onChange={(e) => setVaultConfirmPassword(e.target.value)}
                        placeholder="Confirm new encryption password"
                      />
                    </div>

                    <button
                      className="btn"
                      onClick={handleChangeVaultPassword}
                      disabled={saving || !vaultCurrentPassword || !vaultNewPassword || !vaultConfirmPassword}
                    >
                      {saving ? 'Changing...' : 'Change Encryption Password'}
                    </button>
                  </>
                )}

                {vault.isSetup && (
                  <>
                    <div className="encryption-divider danger"></div>
                    <div className="encryption-danger">
                      <h4>Reset Encryption</h4>
                      <p>
                        If you&apos;ve forgotten your encryption password, you can reset it.
                        <strong> Warning: This will make all your encrypted data permanently inaccessible.</strong>
                      </p>
                      <button
                        className="btn danger small"
                        onClick={() => setShowResetVaultModal(true)}
                      >
                        Reset Encryption
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Login Password Section */}
              <div className="security-card">
                <h3>{account?.hasPassword ? 'Change Login Password' : 'Set Login Password'}</h3>
                <p>
                  {account?.hasPassword
                    ? 'Update your login password (separate from encryption)'
                    : 'Set a password to login with email and password'}
                </p>

                {account?.hasPassword && (
                  <div className="form-group">
                    <label htmlFor="currentPassword">Current Login Password</label>
                    <input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="newPassword">New Login Password</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm New Login Password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                <button
                  className="btn"
                  onClick={handleChangePassword}
                  disabled={saving || !newPassword || !confirmPassword}
                >
                  {saving ? 'Saving...' : account?.hasPassword ? 'Change Login Password' : 'Set Login Password'}
                </button>
              </div>
            </div>
          )}

          {/* Account Tab */}
          {tab === 'account' && (
            <div className="settings-section">
              <h2>Account</h2>
              <p className="section-description">Manage your account and connected services</p>

              {/* Connected Accounts */}
              <div className="account-card">
                <h3>Connected Accounts</h3>
                <p>Sign in methods linked to your account</p>

                <div className="connected-accounts">
                  {/* Email/Password */}
                  <div className="connected-item">
                    <div className="connected-info">
                      <span className="connected-icon email-icon">📧</span>
                      <div>
                        <strong>Email & Password</strong>
                        <span>{account?.email}</span>
                      </div>
                    </div>
                    <div className="connected-actions">
                      {account?.hasPassword ? (
                        <span className="connected-status active">Active</span>
                      ) : (
                        <button
                          className="btn small"
                          onClick={() => setTab('security')}
                        >
                          Set Password
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Google */}
                  <div className="connected-item">
                    <div className="connected-info">
                      <span className="connected-icon google-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      </span>
                      <div>
                        <strong>Google</strong>
                        <span>Sign in with Google</span>
                      </div>
                    </div>
                    <div className="connected-actions">
                      {account?.connectedAccounts.includes('google') ? (
                        <>
                          <span className="connected-status active">Connected</span>
                          <button
                            className="btn small secondary"
                            onClick={() => handleUnlinkAccount('google')}
                            disabled={unlinkingProvider === 'google'}
                          >
                            {unlinkingProvider === 'google' ? 'Disconnecting...' : 'Disconnect'}
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn small google-btn"
                          onClick={() => handleLinkAccount('google')}
                          disabled={linkingProvider === 'google'}
                        >
                          {linkingProvider === 'google' ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* GitHub */}
                  <div className="connected-item">
                    <div className="connected-info">
                      <span className="connected-icon github-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </span>
                      <div>
                        <strong>GitHub</strong>
                        <span>Sign in with GitHub</span>
                      </div>
                    </div>
                    <div className="connected-actions">
                      {account?.connectedAccounts.includes('github') ? (
                        <>
                          <span className="connected-status active">Connected</span>
                          <button
                            className="btn small secondary"
                            onClick={() => handleUnlinkAccount('github')}
                            disabled={unlinkingProvider === 'github'}
                          >
                            {unlinkingProvider === 'github' ? 'Disconnecting...' : 'Disconnect'}
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn small github-btn"
                          onClick={() => handleLinkAccount('github')}
                          disabled={linkingProvider === 'github'}
                        >
                          {linkingProvider === 'github' ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Member Since */}
              <div className="account-card">
                <h3>Account Info</h3>
                <div className="account-info-item">
                  <span>Member since</span>
                  <strong>{account?.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'N/A'}</strong>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="account-card danger">
                <h3>Danger Zone</h3>
                <p>Once you delete your account, there is no going back. Please be certain.</p>
                <button
                  className="btn danger"
                  onClick={() => setShowDeleteModal(true)}
                >
                  Delete Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset Vault Modal */}
      {showResetVaultModal && (
        <div className="modal-overlay" onClick={() => setShowResetVaultModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Reset Encryption</h2>
            <p>
              <strong>This action is irreversible.</strong> All your encrypted data
              (folder names, file names, file content, library items) will become
              permanently inaccessible.
            </p>
            <p>Are you sure you want to continue?</p>

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setShowResetVaultModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={handleResetVault}
              >
                Yes, Reset Encryption
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Account</h2>
            <p>This action cannot be undone. All your data will be permanently deleted.</p>
            <p>Type <strong>DELETE MY ACCOUNT</strong> to confirm:</p>

            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
            />

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={handleDeleteAccount}
                disabled={saving || deleteConfirmation !== 'DELETE MY ACCOUNT'}
              >
                {saving ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .settings-page {
          padding: var(--space-6);
          max-width: 800px;
          margin: 0 auto;
        }

        .settings-loading {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-muted);
        }

        .settings-header {
          margin-bottom: var(--space-6);
        }

        .settings-header h1 {
          font-size: var(--font-2xl);
          margin-bottom: var(--space-2);
        }

        .settings-header p {
          color: var(--text-muted);
        }

        .settings-message {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }

        .settings-message.success {
          background: var(--success-muted);
          color: var(--success);
        }

        .settings-message.error {
          background: var(--error-muted);
          color: var(--error);
        }

        .settings-tabs {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-6);
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: var(--space-2);
          overflow-x: auto;
          background: var(--bg-base);
          position: sticky;
          top: 0;
          z-index: 5;
        }

        .settings-tab {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border: none;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: var(--radius-md);
          transition: all 0.2s;
          white-space: nowrap;
        }

        .settings-tab:hover {
          background: var(--bg-inset);
          color: var(--text-primary);
        }

        .settings-tab.active {
          background: var(--primary-muted);
          color: var(--primary);
        }

        .settings-section {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .settings-section h2 {
          font-size: var(--font-lg);
          margin-bottom: var(--space-1);
        }

        .section-description {
          color: var(--text-muted);
          margin-bottom: var(--space-6);
        }

        .form-group {
          margin-bottom: var(--space-4);
        }

        .form-group label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .option-buttons {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .option-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s;
        }

        .option-btn:hover {
          border-color: var(--primary);
        }

        .option-btn.active {
          background: var(--primary-muted);
          border-color: var(--primary);
          color: var(--primary);
        }

        .option-description {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-bottom: var(--space-3);
          margin-top: calc(-1 * var(--space-1));
        }

        /* Font size options */
        .option-btn.font-option {
          flex-direction: column;
          gap: var(--space-1);
          padding: var(--space-3) var(--space-4);
          min-width: 80px;
        }

        .font-preview {
          font-size: calc(18px * var(--preview-scale, 1));
          font-weight: 600;
          line-height: 1;
        }

        /* Density options */
        .density-buttons {
          flex-direction: column;
        }

        .option-btn.density-option {
          width: 100%;
          justify-content: flex-start;
          padding: var(--space-3) var(--space-4);
        }

        .density-icon {
          font-size: 12px;
          opacity: 0.7;
        }

        .density-label {
          flex: 0 0 auto;
          font-weight: 500;
        }

        .density-desc {
          flex: 1;
          text-align: right;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .option-btn.density-option.active .density-desc {
          color: var(--primary-text);
        }

        /* Appearance Preview */
        .appearance-preview {
          margin-top: var(--space-6);
          padding-top: var(--space-5);
          border-top: 1px solid var(--border-subtle);
        }

        .appearance-preview label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-3);
          color: var(--text-secondary);
        }

        .preview-card {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-4);
        }

        .preview-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: var(--space-3);
        }

        .preview-icon {
          font-size: 20px;
        }

        .preview-title {
          font-weight: 600;
          font-size: var(--font-body);
        }

        .preview-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) 0;
        }

        .preview-item + .preview-item {
          border-top: 1px solid var(--border-subtle);
        }

        .preview-file-icon {
          font-size: 16px;
        }

        .preview-file-info {
          display: flex;
          flex-direction: column;
        }

        .preview-file-name {
          font-size: var(--font-meta);
          font-weight: 500;
        }

        .preview-file-meta {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .profile-stats {
          margin-top: var(--space-8);
          padding-top: var(--space-6);
          border-top: 1px solid var(--border-subtle);
        }

        .profile-stats h3 {
          font-size: var(--font-body);
          margin-bottom: var(--space-4);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-4);
        }

        .stat-item {
          text-align: center;
          padding: var(--space-4);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .stat-value {
          display: block;
          font-size: var(--font-2xl);
          font-weight: 700;
          color: var(--primary);
        }

        .stat-label {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .security-card,
        .account-card {
          padding: var(--space-5);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-4);
        }

        .security-card h3,
        .account-card h3 {
          font-size: var(--font-body);
          margin-bottom: var(--space-2);
        }

        .security-card h4 {
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .encryption-card {
          border-color: var(--success);
        }

        .encryption-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-4);
        }

        .encryption-status {
          display: flex;
          gap: var(--space-3);
          align-items: center;
        }

        .encryption-icon {
          font-size: 32px;
        }

        .encryption-badge {
          font-size: var(--font-tiny);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
        }

        .encryption-badge.active {
          background: var(--success-muted);
          color: var(--success);
        }

        .encryption-badge.locked {
          background: var(--warning-muted);
          color: var(--warning);
        }

        .encryption-badge.inactive {
          background: var(--bg-inset);
          color: var(--text-muted);
        }

        .encryption-features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-2);
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-meta);
        }

        .feature-check {
          color: var(--success);
        }

        .encryption-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-5) 0;
        }

        .encryption-divider.danger {
          background: var(--error);
          opacity: 0.3;
        }

        .encryption-danger {
          padding: var(--space-4);
          background: var(--error-muted);
          border-radius: var(--radius-md);
        }

        .encryption-danger h4 {
          color: var(--error);
        }

        .encryption-danger p {
          font-size: var(--font-meta);
          color: var(--text-secondary);
          margin-bottom: var(--space-3);
        }

        .helper-text {
          font-size: var(--font-meta);
          color: var(--text-muted);
          margin-bottom: var(--space-4);
        }

        .btn.small {
          padding: var(--space-2) var(--space-3);
          font-size: var(--font-meta);
        }

        .btn.secondary {
          background: var(--bg-inset);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
        }

        .btn.secondary:hover {
          background: var(--bg-hover);
        }

        .security-card > p,
        .account-card > p {
          color: var(--text-muted);
          font-size: var(--font-meta);
          margin-bottom: var(--space-4);
        }

        .account-card.danger {
          border-color: var(--error);
          background: var(--error-muted);
        }

        .account-card.danger h3 {
          color: var(--error);
        }

        .connected-accounts {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .connected-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .connected-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .connected-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border-radius: var(--radius-md);
        }

        .connected-info div {
          display: flex;
          flex-direction: column;
        }

        .connected-info span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .connected-status {
          font-size: var(--font-tiny);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-muted);
        }

        .connected-status.active {
          background: var(--success-muted);
          color: var(--success);
        }

        .connected-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .btn.small {
          padding: var(--space-1) var(--space-3);
          font-size: var(--font-tiny);
        }

        .btn.google-btn {
          background: #4285F4;
          color: white;
        }

        .btn.google-btn:hover {
          background: #3367d6;
        }

        .btn.github-btn {
          background: #24292e;
          color: white;
        }

        .btn.github-btn:hover {
          background: #1b1f23;
        }

        .connected-icon {
          font-size: 20px;
        }

        .connected-icon svg {
          display: block;
        }

        .account-info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .account-info-item span {
          color: var(--text-muted);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: var(--bg-surface);
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          max-width: 400px;
          width: 90%;
        }

        .modal h2 {
          color: var(--error);
          margin-bottom: var(--space-3);
        }

        .modal p {
          margin-bottom: var(--space-3);
          color: var(--text-secondary);
        }

        .modal input {
          margin-bottom: var(--space-4);
        }

        .modal-actions {
          display: flex;
          gap: var(--space-2);
          justify-content: flex-end;
        }

        .btn.danger {
          background: var(--error);
          color: white;
        }

        .btn.danger:hover {
          background: color-mix(in srgb, var(--error) 85%, black);
        }

        @media (max-width: 600px) {
          .settings-page {
            padding: var(--space-4);
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .connected-item {
            flex-direction: column;
            gap: var(--space-3);
            text-align: center;
          }

          .connected-info {
            flex-direction: column;
          }

          .connected-actions {
            flex-direction: column;
            width: 100%;
          }

          .connected-actions .btn {
            width: 100%;
          }

          .encryption-features {
            grid-template-columns: 1fr;
          }

          .encryption-header {
            flex-direction: column;
            gap: var(--space-3);
          }

          .settings-tabs {
            padding-top: var(--space-2);
          }

          .option-buttons {
            flex-direction: column;
          }

          .option-btn {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}
