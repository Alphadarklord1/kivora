import Link from 'next/link';
import { and, count, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { libraryItems, shares, users } from '@/lib/db/schema';
import { PublicProfileActions } from '@/components/profile/PublicProfileActions';

function parseInterests(value: string | null) {
  if (!value) return [] as string[];
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function modeLabel(mode: string) {
  if (mode === 'flashcards') return 'Review set';
  if (mode === 'mcq') return 'Quiz';
  if (mode === 'summarize') return 'Notes';
  return mode.replace(/-/g, ' ');
}

function previewText(content: string) {
  return content
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export default async function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const profile = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      bio: users.bio,
      studyInterests: users.studyInterests,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!profile.length) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ marginBottom: 8 }}>Profile not found</h1>
        <p style={{ color: 'var(--text-3)' }}>This student profile is not available.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>Back to Kivora</Link>
      </div>
    );
  }

  const [shareCount] = await db
    .select({ total: count() })
    .from(shares)
    .where(and(
      eq(shares.ownerId, userId),
      eq(shares.shareType, 'link'),
      or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())),
    ));

  const [itemCount] = await db
    .select({ total: count() })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId));

  const publicLinks = await db.query.shares.findMany({
    where: and(
      eq(shares.ownerId, userId),
      eq(shares.shareType, 'link'),
      or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())),
    ),
    orderBy: [desc(shares.createdAt)],
  });

  const publishedLibraryItems = await db.query.libraryItems.findMany({
    where: eq(libraryItems.userId, userId),
    orderBy: [desc(libraryItems.createdAt)],
  });

  const shareByItemId = new Map(
    publicLinks
      .filter((share) => Boolean(share.libraryItemId))
      .map((share) => [share.libraryItemId as string, share]),
  );

  const featuredItems = publishedLibraryItems
    .filter((item) => {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      return Boolean(metadata.publicProfile);
    })
    .slice(0, 8)
    .map((item) => {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      const linkedShare = shareByItemId.get(item.id);
      return {
        id: item.id,
        mode: item.mode,
        title: String(metadata.title ?? `${modeLabel(item.mode)} item`),
        description: String(metadata.description ?? ''),
        preview: previewText(item.content),
        cardCount: Number(metadata.cardCount ?? 0),
        shareUrl: linkedShare?.shareToken ? `/share/${linkedShare.shareToken}` : null,
        createdAt: item.createdAt,
      };
    });

  const user = profile[0];
  const interests = parseInterests(user.studyInterests);
  const initials = (user.name || 'K').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const profileUrl = `/profile/${user.id}`;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '48px 24px 72px', display: 'grid', gap: 24 }}>
      <div style={{ display: 'grid', gap: 18, padding: 28, borderRadius: 24, background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--bg)) 0%, var(--surface) 100%)', border: '1px solid var(--border-2)' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name || 'Profile picture'} style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-2)' }} />
          ) : (
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>
              {initials}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 260 }}>
            <span className="badge">Public profile</span>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 2.8vw, 2.4rem)' }}>{user.name || 'Kivora student'}</h1>
            <p style={{ margin: 0, color: 'var(--text-3)', maxWidth: 620 }}>
              {user.bio || 'Using Kivora to study, write stronger reports, and keep review material organized.'}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
              <span>Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <span>•</span>
              <span>{itemCount?.total ?? 0} study items</span>
              <span>•</span>
              <span>{shareCount?.total ?? 0} public links</span>
            </div>
          </div>
        </div>

        {interests.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {interests.map((interest) => (
              <span key={interest} className="badge badge-accent">{interest}</span>
            ))}
          </div>
        ) : null}

        <PublicProfileActions profileId={user.id} profileUrl={profileUrl} />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>About this student</h2>
        <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.7 }}>
          This is Kivora&apos;s lightweight social layer: a simple profile card, public study identity, and selected shared outputs without turning the whole product into a feed.
        </p>
      </div>

      <section style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ margin: 0 }}>Published study items</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)' }}>
              Notes, quizzes, and review sets this student chose to show on their public profile.
            </p>
          </div>
          <span className="badge">{featuredItems.length} featured</span>
        </div>

        {featuredItems.length === 0 ? (
          <div style={{ padding: 24, borderRadius: 18, border: '1px solid var(--border-2)', background: 'var(--surface-2)' }}>
            <strong>No public study items yet</strong>
            <p style={{ margin: '8px 0 0', color: 'var(--text-3)' }}>
              This profile exists, but no notes, quizzes, or review sets have been published here yet.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
            {featuredItems.map((item) => (
              <article key={item.id} style={{ padding: 18, borderRadius: 18, border: '1px solid var(--border-2)', background: 'var(--surface)', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
                      {modeLabel(item.mode)} • {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="badge">{modeLabel(item.mode)}</span>
                </div>
                {item.description ? (
                  <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.6 }}>{item.description}</p>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.6 }}>
                    {item.mode === 'flashcards' && item.cardCount > 0
                      ? `${item.cardCount} cards ready for review.`
                      : `${item.preview}${item.preview.length >= 180 ? '…' : ''}`}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {item.shareUrl ? (
                    <Link href={item.shareUrl} className="btn btn-primary btn-sm">
                      Open shared item
                    </Link>
                  ) : (
                    <span className="badge">Visible on profile only</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
