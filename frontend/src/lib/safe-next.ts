/**
 * Validate a `?next=` redirect target. Only same-site paths are allowed, so a crafted
 * link like /login?next=https://evil.example can't bounce users off-site after login.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
