/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend REST base, e.g. http://localhost:3000/api/v1 */
  readonly VITE_API_URL: string;
  /** Cookieless origin that serves user-uploaded assets (logos, avatars) — C1. */
  readonly VITE_ASSET_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
