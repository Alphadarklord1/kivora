import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ClientProviders } from '@/providers/ClientProviders';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isGuestMode =
    process.env.LOCAL_DEMO_MODE === '1' ||
    process.env.AUTH_GUEST_MODE === '1';
  const session = await auth();

  if (!session?.user && !isGuestMode) {
    redirect('/login');
  }

  const user = session?.user ?? {
    id: 'demo-user',
    name: 'Local Demo',
    email: 'demo@local.studypilot',
    image: null,
  };

  return (
    <ClientProviders>
      <AppShell user={user}>
        {children}
      </AppShell>
    </ClientProviders>
  );
}
