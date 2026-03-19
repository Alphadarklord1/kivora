'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacySharedPageRedirect() {
  const router = useRouter();
  const params = useParams<{ shareToken: string }>();

  useEffect(() => {
    if (!params?.shareToken) return;
    router.replace(`/share/${params.shareToken}`);
  }, [params?.shareToken, router]);

  return (
    <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
      Redirecting to the shared page…
    </div>
  );
}
