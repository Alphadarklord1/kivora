import { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
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
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
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
        if (!user.email) return false;

        try {
          // Check if user exists
          let existingUser = await db.query.users.findFirst({
            where: eq(users.email, user.email),
          });

          if (!existingUser) {
            // Create new user
            const userId = uuidv4();
            await db.insert(users).values({
              id: userId,
              email: user.email,
              name: user.name || profile?.name || user.email.split('@')[0],
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
                eq(accounts.provider, account.provider)
              ),
            });

            if (!existingAccount) {
              // Link account to user
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
            }

            // Update user.id to match our database
            user.id = existingUser.id;
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/workspace') ||
        nextUrl.pathname.startsWith('/tools') ||
        nextUrl.pathname.startsWith('/library') ||
        nextUrl.pathname.startsWith('/analytics') ||
        nextUrl.pathname.startsWith('/settings') ||
        nextUrl.pathname.startsWith('/sharing') ||
        nextUrl.pathname.startsWith('/planner') ||
        nextUrl.pathname.startsWith('/podcast');
      const isOnAuth = nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/register');

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }

      if (isOnAuth && isLoggedIn) {
        return Response.redirect(new URL('/workspace', nextUrl));
      }

      return true;
    },
  },
};
