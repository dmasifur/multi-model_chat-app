const PUBLIC_PATHS = ['/sign-in'];
const AUTH_API_PREFIX = '/api/auth';

export function isPublicPath(pathname: string): boolean {
  if (pathname === AUTH_API_PREFIX || pathname.startsWith(`${AUTH_API_PREFIX}/`)) {
    return true;
  }
  return PUBLIC_PATHS.includes(pathname);
}
