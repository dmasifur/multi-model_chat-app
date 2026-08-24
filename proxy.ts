import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isPublicPath } from '@/lib/auth/is-public-path';

export const proxy = auth((req) => {
  if (!req.auth && !isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl.origin));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
