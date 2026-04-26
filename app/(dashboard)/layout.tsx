import { ClientProviders } from '@/providers/ClientProviders';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import './dashboard-theme.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProviders>
      <AppShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppShell>
    </ClientProviders>
  );
}
