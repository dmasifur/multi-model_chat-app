import { NextResponse } from 'next/server';
import { isPublicPath } from '@/lib/auth/is-public-path';

interface ProxyRequest {
  auth: unknown;
  nextUrl: URL;
}

export function proxyHandler(req: ProxyRequest) {
  if (!req.auth && !isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl.origin));
  }
}
