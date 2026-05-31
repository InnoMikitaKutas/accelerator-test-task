import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { Branding } from '@/types/api';
import { LogoUploader } from './LogoUploader';

/** A File with a forced `size` (the File ctor ignores content length for our guard). */
function fileOf(name: string, type: string, bytes: number): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

const branding: Branding = {
  trainerId: 't1',
  logoUrl: 'https://cdn.example/logo.svg',
  primaryColorHex: '#E14817',
  updatedAt: '2026-05-30T00:00:00Z',
};

describe('LogoUploader (FR-037, C1, M4)', () => {
  it('accepts an SVG ≤2MB, posts it, and renders the returned logoUrl via <img>', async () => {
    let posted = false;
    server.use(
      http.post(apiUrl('/trainer/branding/logo'), () => {
        posted = true;
        return HttpResponse.json(branding);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LogoUploader currentUrl={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, fileOf('logo.svg', 'image/svg+xml', 1024));

    await waitFor(() => expect(posted).toBe(true));
    const img = (await screen.findByAltText('Portal logo')) as HTMLImageElement;
    expect(img.src).toBe('https://cdn.example/logo.svg'); // foreign-origin <img>, not inlined (C1)
  });

  it('rejects a file over 2MB client-side without posting (M4)', async () => {
    let posted = false;
    server.use(
      http.post(apiUrl('/trainer/branding/logo'), () => {
        posted = true;
        return HttpResponse.json(branding);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LogoUploader currentUrl={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, fileOf('huge.png', 'image/png', 3 * 1024 * 1024));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(posted).toBe(false);
  });
});
