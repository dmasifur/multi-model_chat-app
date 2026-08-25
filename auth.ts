import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema';
import { signInCallback, jwtCallback } from '@/lib/auth/callbacks';

if (!process.env.AUTH_SECRET) {
  throw new Error(
    'AUTH_SECRET is not set. Generate one with `openssl rand -base64 33` and add it to .env.',
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [GitHub, Google],
  session: { strategy: 'jwt' },
  // Required on any deploy target other than Vercel, which sets this
  // implicitly. If self-hosting behind a reverse proxy, the proxy must
  // strip any client-supplied Host/X-Forwarded-Host before this app sees it.
  trustHost: true,
  callbacks: {
    signIn: signInCallback,
    jwt: jwtCallback,
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
