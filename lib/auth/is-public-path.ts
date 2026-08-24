const PUBLIC_PATHS = ['/sign-in'];

export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/api/auth')) {
    return true;
  }
  return PUBLIC_PATHS.includes(pathname);
}
