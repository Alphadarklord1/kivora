import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ClientProviders } from '@/providers/ClientProviders';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <ClientProviders>
      <AppShell user={session.user}>
        {children}
      </AppShell>
    </ClientProviders>
  );
}
