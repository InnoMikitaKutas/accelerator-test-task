/**
 * Resolve a user-uploaded asset URL for rendering (C1). User assets (avatars, logos)
 * live on a cookieless asset origin (`STORAGE_PUBLIC_BASE_URL` server-side). The
 * backend already returns absolute URLs there, so the common case is a pass-through;
 * a relative key is resolved against `VITE_ASSET_BASE_URL` so the contract holds even
 * if the server is later configured to return paths.
 *
 * Whatever the form, the asset is a FOREIGN origin — always render it via `<img src>`,
 * never by inlining markup into the DOM (an uploaded SVG is sanitized server-side, but
 * the client still treats it as untrusted foreign content). `blob:`/`data:` (local
 * previews) pass straight through.
 */
const ABSOLUTE = /^(https?:|blob:|data:)/i;

export function assetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (ABSOLUTE.test(url)) return url;

  const base = import.meta.env.VITE_ASSET_BASE_URL?.replace(/\/+$/, '') ?? '';
  const path = url.replace(/^\/+/, '');
  return base ? `${base}/${path}` : `/${path}`;
}
