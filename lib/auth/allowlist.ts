function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const allowedEmails = parseList(process.env.ALLOWED_EMAILS);
  const allowedDomains = parseList(process.env.ALLOWED_EMAIL_DOMAINS);
  if (allowedEmails.length === 0 && allowedDomains.length === 0) {
    return false;
  }

  const normalized = email.toLowerCase();
  if (allowedEmails.includes(normalized)) {
    return true;
  }

  const domain = normalized.split('@')[1];
  return domain !== undefined && allowedDomains.includes(domain);
}
