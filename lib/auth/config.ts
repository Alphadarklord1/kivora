import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import bcrypt from 'bcryptjs';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { syncSupabaseAuthUser } from '@/lib/supabase/auth-admin';
import { isDatabaseUnreachableError, verifyLocalAuthCredentials } from '@/lib/auth/local-auth-store';

const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'kivora-local-dev-secret' : undefined);

const microsoftClientId =
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID ||
  process.env.MICROSOFT_CLIENT_ID;

const microsoftClientSecret =
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ||
  process.env.MICROSOFT_CLIENT_SECRET;

const microsoftIssuer =
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ||
  (process.env.MICROSOFT_TENANT_ID
    ? `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/v2.0`
    : undefined);

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getOAuthEmail(userEmail: string | null | undefined, profile: unknown): string | null {
  const direct = normalizeEmail(userEmail);
  if (direct) return direct;

  if (!profile || typeof profile !== 'object') return null;

  const record = profile as Record<string, unknown>;
  const candidates = [
    record.email,
    record.preferred_username,
    record.upn,
    record.unique_name,
    record.verified_primary_email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = normalizeEmail(candidate);
      if (normalized) return normalized;
    }

    if (Array.isArray(candidate)) {
      for (const value of candidate) {
        if (typeof value === 'string') {
          const normalized = normalizeEmail(value);
          if (normalized) return normalized;
        }
      }
    }
  }

  return null;
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: authSecret,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    newUser: '/register',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const normalizedEmail = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const localAuthUser = await verifyLocalAuthCredentials(normalizedEmail, password);

        if (!isDatabaseConfigured) {
          return localAuthUser
            ? { id: localAuthUser.id, email: localAuthUser.email, name: localAuthUser.name, image: localAuthUser.image }
            : null;
        }

        try {
          const user = await db.query.users.findFirst({
            where: eq(users.email, normalizedEmail),
          });

          if (user?.passwordHash) {
            const valid = await bcrypt.compare(password, user.passwordHash);
            if (valid) {
              const syncedAuthId = await syncSupabaseAuthUser({
                supabaseAuthId: user.supabaseAuthId,
                email: user.email,
                name: user.name,
                image: user.image,
                bio: user.bio,
                emailConfirmed: true,
              });

              if (syncedAuthId && syncedAuthId !== user.supabaseAuthId) {
                await db.update(users)
                  .set({ supabaseAuthId: syncedAuthId, updatedAt: new Date() })
                  .where(eq(users.id, user.id));
              }

              return { id: user.id, email: user.email, name: user.name, image: user.image };
            }
          }

          return localAuthUser
            ? { id: localAuthUser.id, email: localAuthUser.email, name: localAuthUser.name, image: localAuthUser.image }
            : null;
        } catch (error) {
          if (isDatabaseUnreachableError(error) && localAuthUser) {
            return {
              id: localAuthUser.id,
              email: localAuthUser.email,
              name: localAuthUser.name,
              image: localAuthUser.image,
            };
          }

          console.error('[auth] credentials sign-in failed', error);
          return null;
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
      : []),
    ...(microsoftClientId && microsoftClientSecret
      ? [MicrosoftEntraID({
          clientId: microsoftClientId,
          clientSecret: microsoftClientSecret,
          ...(microsoftIssuer ? { issuer: microsoftIssuer } : {}),
        })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.type === 'oauth') {
        if (!isDatabaseConfigured) return false;

        const email = getOAuthEmail(user.email, profile);
        if (!email) return false;

        try {
          // Check if this OAuth account already exists
          const existingAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.provider, account.provider),
              eq(accounts.providerAccountId, account.providerAccountId),
            ),
          });

          if (existingAccount) {
            // Account already linked — update user id so JWT is correct
            const existingUser = await db.query.users.findFirst({
              where: eq(users.id, existingAccount.userId),
            });
            if (existingUser) {
              const syncedAuthId = await syncSupabaseAuthUser({
                supabaseAuthId: existingUser.supabaseAuthId,
                email,
                name: user.name ?? existingUser.name,
                image: user.image ?? existingUser.image,
                bio: existingUser.bio,
                emailConfirmed: true,
              });

              if (syncedAuthId && syncedAuthId !== existingUser.supabaseAuthId) {
                await db.update(users)
                  .set({ supabaseAuthId: syncedAuthId, updatedAt: new Date() })
                  .where(eq(users.id, existingUser.id));
              }

              user.id = existingUser.id;
            }
            return true;
          }

          // Find or create the user record
          let dbUser = await db.query.users.findFirst({
            where: eq(users.email, email),
          });

          if (!dbUser) {
            const syncedAuthId = await syncSupabaseAuthUser({
              email,
              name: user.name ?? email.split('@')[0],
              image: user.image ?? null,
              emailConfirmed: true,
            });
            const [inserted] = await db.insert(users).values({
              id: uuidv4(),
              email,
              name: user.name ?? email.split('@')[0],
              image: user.image ?? null,
              supabaseAuthId: syncedAuthId,
            }).returning();
            dbUser = inserted;
          } else {
            const syncedAuthId = await syncSupabaseAuthUser({
              supabaseAuthId: dbUser.supabaseAuthId,
              email,
              name: user.name ?? dbUser.name,
              image: user.image ?? dbUser.image,
              bio: dbUser.bio,
              emailConfirmed: true,
            });

            if (syncedAuthId && syncedAuthId !== dbUser.supabaseAuthId) {
              const [updatedUser] = await db.update(users)
                .set({ supabaseAuthId: syncedAuthId, updatedAt: new Date() })
                .where(eq(users.id, dbUser.id))
                .returning();
              dbUser = updatedUser ?? dbUser;
            }
          }

          // Link the OAuth account
          await db.insert(accounts).values({
            id: uuidv4(),
            userId: dbUser.id,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
            tokenType: account.token_type ?? null,
            scope: account.scope ?? null,
            idToken: account.id_token ?? null,
          }).onConflictDoNothing();

          user.id = dbUser.id;
        } catch (err) {
          console.error(`[auth] ${account.provider} sign-in error:`, err);
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },

    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isGuestMode = isGuestModeEnabled();

      const isDashboard =
        pathname.startsWith('/workspace') ||
        pathname.startsWith('/library') ||
        pathname.startsWith('/coach') ||
        pathname.startsWith('/study') ||
        pathname.startsWith('/decks') ||
        pathname.startsWith('/settings') ||
        pathname.startsWith('/planner') ||
        pathname.startsWith('/math') ||
        pathname.startsWith('/analytics') ||
        pathname.startsWith('/models') ||
        pathname.startsWith('/sharing') ||
        pathname.startsWith('/account') ||
        pathname.startsWith('/report');

      const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

      if (isDashboard) {
        if (isLoggedIn || isGuestMode) return true;
        return false; // middleware will redirect to /login
      }

      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL('/workspace', request.nextUrl));
      }

      return true;
    },
  },
};
