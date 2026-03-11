'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { SettingsProvider } from './SettingsProvider';
import { ToastProvider } from './ToastProvider';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SettingsProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </SettingsProvider>
    </NextAuthSessionProvider>
  );
}
