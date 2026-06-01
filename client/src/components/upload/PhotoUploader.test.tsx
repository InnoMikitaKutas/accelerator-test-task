import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { PhotoUploader } from './PhotoUploader';

/** A File of an exact byte size + type (the guard checks file.size). */
function fileOfSize(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('PhotoUploader (M4 client guard, C1 foreign-origin render)', () => {
  it('rejects a >2MB file client-side without firing a request (M4)', async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.post(apiUrl('/me/profile/photo'), () => {
        posted = true;
        return HttpResponse.json({ photoUrl: 'x', thumbnailUrl: 'y' }, { status: 201 });
      }),
    );
    renderWithProviders(<PhotoUploader currentUrl={null} name="Pat Player" />);

    const tooBig = fileOfSize(3 * 1024 * 1024, 'huge.png', 'image/png');
    await user.upload(screen.getByLabelText(/change photo/i), tooBig);

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('posts a valid file and renders the returned thumbnail via <img> (C1)', async () => {
    const user = userEvent.setup();
    // NOTE: we don't introspect the multipart body — jsdom's global FormData and Node's
    // fetch (undici) are different realms, so undici stringifies it to "[object FormData]".
    // Production sends real multipart; here we verify the integration: guard pass → POST →
    // the returned (foreign-origin) thumbnail renders through assetUrl()+<img>.
    let posted = 0;
    server.use(
      http.post(apiUrl('/me/profile/photo'), () => {
        posted += 1;
        return HttpResponse.json(
          {
            photoUrl: 'http://localhost:3000/static/avatars/u1/new.png',
            thumbnailUrl: 'http://localhost:3000/static/avatars/u1/new-thumb.png',
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<PhotoUploader currentUrl={null} name="Pat Player" />);

    const ok = fileOfSize(1024, 'avatar.png', 'image/png');
    await user.upload(screen.getByLabelText(/change photo/i), ok);

    const img = await screen.findByRole('img', { name: /pat player's profile photo/i });
    expect(img.getAttribute('src')).toBe('http://localhost:3000/static/avatars/u1/new-thumb.png');
    expect(posted).toBe(1);
  });

  it('maps a server 413 to an inline error', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/me/profile/photo'), () =>
        HttpResponse.json({ errorCode: 'FILE_TOO_LARGE' }, { status: 413 }),
      ),
    );
    renderWithProviders(<PhotoUploader currentUrl={null} name="Pat Player" />);

    // Passes the client guard (small + png) so the request fires and the server 413s.
    const ok = fileOfSize(1024, 'avatar.png', 'image/png');
    await user.upload(screen.getByLabelText(/change photo/i), ok);

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
  });
});
