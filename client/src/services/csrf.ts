/**
 * Reads the non-httpOnly `csrf` cookie (double-submit pattern, F-4) so it can be
 * echoed as the `X-CSRF-Token` header on mutations. The `at`/`rt` session cookies
 * are httpOnly and are intentionally NOT readable from JS.
 */
export function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]*)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
