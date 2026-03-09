import { NextAuthConfig } from 'next-auth';
import { randomBytes } from 'crypto';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { getAuthCapabilities, normalizeAuthEmail } from '@/lib/auth/capabilities';
import { hasValidTwoFactorSession, TWO_FACTOR_COOKIE_NAME } from '@/lib/auth/two-factor';

const authCapabilities = getAuthCapabilities();
const isGuestMode = isGuestModeEnabled();
const configuredAuthSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const guestRuntimeSecret =
  !configuredAuthSecret && process.env.NODE_ENV === 'production' && isGuestMode
    ? randomBytes(32).toString('hex')
    : undefined;

const authSecret =
  configuredAuthSecret ||
  guestRuntimeSecret ||
  ((process.env.NODE_ENV !== 'production')
    ? 'studypilot-local-dev-secret'
    : undefined);

function logAuthDiagnosticsOnce() {
  const marker = '__studypilotAuthDiagnosticsLogged';
  const scope = globalThis as typeof globalThis & { [key: string]: boolean | undefined };
  if (scope[marker]) return;
  scope[marker] = true;

  if (!authCapabilities.googleConfigured) {
    console.warn('[auth] Google provider disabled (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).');
  }
  if (authCapabilities.oauthDisabled) {
    console.warn('[auth] OAuth providers disabled for this runtime:', authCapabilities.oauthDisabledReason || 'no reason provided');
  }
  if (guestRuntimeSecret) {
    console.warn('[auth] Using an ephemeral guest-only auth secret because AUTH_SECRET/NEXTAUTH_SECRET is missing in production.');
  }
  if (!authSecret && process.env.NODE_ENV === 'production') {
    console.error('[auth] AUTH_SECRET/NEXTAUTH_SECRET is missing in production.');
  }
}

logAuthDiagnosticsOnce();

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: 'jwt',
  },
  secret: authSecret,
  providers: [
    ...(!authCapabilities.authDisabled
      ? [
          Credentials({
            name: 'credentials',
            credentials: {
              email: { label: 'Email', type: 'email' },
              password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
              if (!credentials?.email || !credentials?.password) {
                return null;
              }

              const email = credentials.email as string;

              const user = await db.query.users.findFirst({
                where: eq(users.email, email),
              });

              if (!user || !user.passwordHash) {
                return null;
              }

              const isValid = await bcrypt.compare(credentials.password as string, user.passwordHash);
              if (!isValid) {
                return null;
              }

              return {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                twoFactorEnabled: user.twoFactorEnabled,
              };
            },
          }),
        ]
      : []),
    ...(!authCapabilities.oauthDisabled && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(!authCapabilities.oauthDisabled && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: '/login',
    newUser: '/register',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle OAuth sign in - create user if doesn't exist
      if (account?.provider === 'google' || account?.provider === 'github') {
        const normalizedEmail = normalizeAuthEmail(user.email);
        if (!normalizedEmail) return false;

        try {
          const existingProviderAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.provider, account.provider),
              eq(accounts.providerAccountId, account.providerAccountId)
            ),
          });

          let existingUser = null;
          if (existingProviderAccount) {
            existingUser = await db.query.users.findFirst({
              where: eq(users.id, existingProviderAccount.userId),
            });
          } else {
            existingUser = await db.query.users.findFirst({
              where: eq(users.email, normalizedEmail),
            });
          }

          if (!existingUser) {
            // Create new user
            const userId = uuidv4();
            await db.insert(users).values({
              id: userId,
              email: normalizedEmail,
              name: user.name || profile?.name || normalizedEmail.split('@')[0],
              image: user.image || null,
            });
            existingUser = await db.query.users.findFirst({
              where: eq(users.id, userId),
            });
          }

          if (existingUser) {
            // Check if account link exists
            const existingAccount = await db.query.accounts.findFirst({
              where: and(
                eq(accounts.userId, existingUser.id),
                eq(accounts.provider, account.provider),
                eq(accounts.providerAccountId, account.providerAccountId)
              ),
            });

            if (!existingAccount) {
              try {
                // Link account to user (idempotent, race-safe via unique indexes).
                await db.insert(accounts).values({
                  id: uuidv4(),
                  userId: existingUser.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  accessToken: account.access_token || null,
                  refreshToken: account.refresh_token || null,
                  expiresAt: account.expires_at || null,
                  tokenType: account.token_type || null,
                  scope: account.scope || null,
                  idToken: account.id_token || null,
                });
              } catch {
                // Ignore duplicate race insert and continue.
              }
            }

            // Update user.id to match our database
            user.id = existingUser.id;
            user.email = existingUser.email;
            (user as typeof user & { twoFactorEnabled?: boolean }).twoFactorEnabled = Boolean(existingUser.twoFactorEnabled);
          }
        } catch (error) {
          console.error('OAuth sign in error:', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.twoFactorEnabled = Boolean((user as { twoFactorEnabled?: boolean }).twoFactorEnabled);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session.user as typeof session.user & { twoFactorEnabled?: boolean }).twoFactorEnabled = Boolean(token.twoFactorEnabled);
      }
      return session;
    },
    async authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const sessionUser = auth?.user as ({ id?: string; twoFactorEnabled?: boolean } | undefined);
      const userId = sessionUser?.id;
      const requiresTwoFactor = Boolean(sessionUser?.twoFactorEnabled);
      const twoFactorCookie = request.cookies.get(TWO_FACTOR_COOKIE_NAME)?.value;
      const hasVerifiedTwoFactor = requiresTwoFactor && userId
        ? await hasValidTwoFactorSession(userId, twoFactorCookie)
        : false;
      const isOnDashboard = nextUrl.pathname.startsWith('/workspace') ||
        nextUrl.pathname.startsWith('/tools') ||
        nextUrl.pathname.startsWith('/library') ||
        nextUrl.pathname.startsWith('/analytics') ||
        nextUrl.pathname.startsWith('/settings') ||
        nextUrl.pathname.startsWith('/sharing') ||
        nextUrl.pathname.startsWith('/planner') ||
        nextUrl.pathname.startsWith('/podcast');
      const isOnTwoFactor = nextUrl.pathname.startsWith('/verify-2fa');
      const isOnAuth = nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/register');

      if (isOnTwoFactor) {
        if (!isLoggedIn) {
          return Response.redirect(new URL('/login', nextUrl));
        }
        if (!requiresTwoFactor || hasVerifiedTwoFactor) {
          return Response.redirect(new URL('/workspace', nextUrl));
        }
        return true;
      }

      if (isOnDashboard) {
        if (!isLoggedIn) {
          return isGuestMode ? true : false;
        }
        if (requiresTwoFactor && !hasVerifiedTwoFactor) {
          return Response.redirect(new URL('/verify-2fa', nextUrl));
        }
        return true;
      }

      if (isOnAuth && isLoggedIn) {
        if (requiresTwoFactor && !hasVerifiedTwoFactor) {
          return Response.redirect(new URL('/verify-2fa', nextUrl));
        }
        return Response.redirect(new URL('/workspace', nextUrl));
      }

      return true;
    },
  },
};
