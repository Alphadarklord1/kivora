'use client';

import type { ReactNode } from 'react';
import { ClientProviders } from '@/providers/ClientProviders';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>;
}
