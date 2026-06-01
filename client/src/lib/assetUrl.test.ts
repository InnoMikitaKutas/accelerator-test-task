import { describe, expect, it } from 'vitest';
import { assetUrl } from './assetUrl';

// The test env sets VITE_ASSET_BASE_URL = 'http://localhost:3000/static'
// (see vite.config.ts test define + src/test/harness.test.ts).
const BASE = 'http://localhost:3000/static';

describe('assetUrl (C1 foreign-origin render)', () => {
  it('returns undefined for empty input', () => {
    expect(assetUrl(null)).toBeUndefined();
    expect(assetUrl(undefined)).toBeUndefined();
    expect(assetUrl('')).toBeUndefined();
  });

  it('passes an absolute http(s) URL through unchanged (the backend returns these)', () => {
    const abs = `${BASE}/avatars/u1/abc-thumb.png`;
    expect(assetUrl(abs)).toBe(abs);
    expect(assetUrl('https://cdn.example.com/logo.svg')).toBe('https://cdn.example.com/logo.svg');
  });

  it('passes blob:/data: previews through unchanged', () => {
    expect(assetUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(assetUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('resolves a relative key against VITE_ASSET_BASE_URL', () => {
    expect(assetUrl('avatars/u1/abc-thumb.png')).toBe(`${BASE}/avatars/u1/abc-thumb.png`);
  });

  it('does not double the slash for a leading-slash key or a trailing-slash base', () => {
    expect(assetUrl('/avatars/u1/abc.png')).toBe(`${BASE}/avatars/u1/abc.png`);
  });
});
