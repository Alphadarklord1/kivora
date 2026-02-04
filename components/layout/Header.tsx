'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  const getActiveMode = () => {
    if (pathname.startsWith('/workspace')) return 'workspace';
    if (pathname.startsWith('/tools')) return 'tools';
    if (pathname.startsWith('/library')) return 'library';
    if (pathname.startsWith('/settings')) return 'settings';
    return 'workspace';
  };

  const activeMode = getActiveMode();

  return (
    <>
      <header className="header-bar">
        <div>
          <h1>StudyPilot</h1>
          <p>Welcome, {user.name || user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link
            href="/settings"
            className="icon-btn"
            title="Settings"
            style={{ textDecoration: 'none' }}
          >
            ⚙️
          </Link>
          <button
            className="btn secondary"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="panel-body">
        <div className="modebar">
          <Link
            href="/workspace"
            className={`mode ${activeMode === 'workspace' ? 'active' : ''}`}
          >
            Workspace
          </Link>
          <Link
            href="/tools"
            className={`mode ${activeMode === 'tools' ? 'active' : ''}`}
          >
            Tools
          </Link>
          <Link
            href="/library"
            className={`mode ${activeMode === 'library' ? 'active' : ''}`}
          >
            Library
          </Link>
          <Link
            href="/settings"
            className={`mode ${activeMode === 'settings' ? 'active' : ''}`}
          >
            Settings
          </Link>
        </div>
      </div>
    </>
  );
}
