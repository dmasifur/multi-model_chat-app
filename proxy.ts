import { auth } from '@/auth';
import { proxyHandler } from '@/lib/auth/proxy-handler';

export const proxy = auth(proxyHandler);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
