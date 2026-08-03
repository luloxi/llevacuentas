/**
 * Solo estos emails pueden entrar a LlevaCuentas.
 * Configurable con ALLOWED_EMAILS (coma-separado) en Vercel.
 * Default: dueño del portfolio + espacio para pareja.
 */
const DEFAULT_ALLOWED = [
  "lucianoolivabianco@gmail.com",
  "kathonejo@gmail.com",
];

export function getAllowedEmails(): string[] {
  const fromEnv = process.env.ALLOWED_EMAILS;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED.map((e) => e.toLowerCase());
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getAllowedEmails();
  // Empty allowlist = open (not recommended for prod)
  if (list.length === 0) return true;
  return list.includes(email.trim().toLowerCase());
}
