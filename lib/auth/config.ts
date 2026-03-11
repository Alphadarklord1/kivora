import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'kivora-local-dev-secret' : undefined);

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
        if (!isDatabaseConfigured) return null;
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, (credentials.email as string).toLowerCase().trim()),
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        if (!isDatabaseConfigured || !user.email) return false;

        const email = user.email.toLowerCase().trim();

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
            if (existingUser) user.id = existingUser.id;
            return true;
          }

          // Find or create the user record
          let dbUser = await db.query.users.findFirst({
            where: eq(users.email, email),
          });

          if (!dbUser) {
            const [inserted] = await db.insert(users).values({
              id: uuidv4(),
              email,
              name: user.name ?? email.split('@')[0],
              image: user.image ?? null,
            }).returning();
            dbUser = inserted;
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
          console.error('[auth] Google sign-in error:', err);
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
      const isGuestMode = process.env.AUTH_GUEST_MODE === '1';

      const isDashboard =
        pathname.startsWith('/workspace') ||
        pathname.startsWith('/library') ||
        pathname.startsWith('/settings') ||
        pathname.startsWith('/planner');

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
