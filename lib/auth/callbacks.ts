import type { JWT } from 'next-auth/jwt';
import { isEmailAllowed } from '@/lib/auth/allowlist';

export function signInCallback({ user }: { user: { email?: string | null } }): boolean {
  return isEmailAllowed(user.email);
}

/**
 * Runs on every request, not just at sign-in. Re-checking the allowlist here
 * is what makes removing someone from ALLOWED_EMAILS take effect immediately:
 * with the JWT session strategy the signIn callback fires once, so without
 * this a revoked user would keep a valid token until it expired.
 * Returning null invalidates the session.
 */
export function jwtCallback({
  token,
  user,
}: {
  token: JWT;
  user?: { id?: string; email?: string | null };
}): JWT | null {
  if (user) {
    token.id = user.id;
    token.email = user.email;
  }

  if (!isEmailAllowed(token.email)) {
    return null;
  }

  return token;
}
