'use client';

import { ReactNode } from 'react';
import { SessionProvider } from '@/providers/SessionProvider';
import { SettingsProvider } from '@/providers/SettingsProvider';
import { VaultProvider, VaultGate } from '@/providers/VaultProvider';
import { ToastProvider } from '@/components/ui/Toast';

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <SessionProvider>
      <SettingsProvider>
        <ToastProvider>
          <VaultProvider>
            <VaultGate>
              {children}
            </VaultGate>
          </VaultProvider>
        </ToastProvider>
      </SettingsProvider>
    </SessionProvider>
  );
}
