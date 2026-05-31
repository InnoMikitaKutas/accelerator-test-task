import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { ToastHost } from '@/components/ui/ToastHost';
import type { Branding } from '@/types/api';
import { BrandingSettings } from './BrandingSettings';

const initial: Branding = {
  trainerId: 't1',
  logoUrl: null,
  primaryColorHex: '#E14817',
  updatedAt: '2026-05-30T00:00:00Z',
};

describe('BrandingSettings (FR-037)', () => {
  it('blocks an invalid hex and disables Apply', async () => {
    server.use(http.get(apiUrl('/trainer/branding'), () => HttpResponse.json(initial)));
    const user = userEvent.setup();
    renderWithProviders(<BrandingSettings />);

    const hex = await screen.findByLabelText('Primary color');
    await user.clear(hex);
    await user.type(hex, '#12xyz');

    expect(screen.getByText(/6-digit hex/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply org-wide/i })).toBeDisabled();
  });

  it('shows a contrast read-out for a valid color and applies it org-wide', async () => {
    let stored: Branding = { ...initial };
    let body: { primaryColorHex: string } | undefined;
    server.use(
      // GET reflects the latest saved color so the post-save refetch settles "Saved".
      http.get(apiUrl('/trainer/branding'), () => HttpResponse.json(stored)),
      http.put(apiUrl('/trainer/branding'), async ({ request }) => {
        body = (await request.json()) as { primaryColorHex: string };
        stored = { ...stored, primaryColorHex: body.primaryColorHex };
        return HttpResponse.json(stored);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <BrandingSettings />
        <ToastHost />
      </>,
    );

    const hex = await screen.findByLabelText('Primary color');
    await user.clear(hex);
    await user.type(hex, '#1A73E8');

    // Valid color → contrast read-out renders + Apply enabled.
    expect(screen.getByText(/contrast/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Apply org-wide/i }));

    expect(await screen.findByText('Branding applied to your portal.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Saved/i })).toBeInTheDocument());
    expect(body).toEqual({ primaryColorHex: '#1A73E8' });
  });
});
