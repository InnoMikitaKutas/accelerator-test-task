import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { ToastHost } from '@/components/ui/ToastHost';
import { ConflictOverrideModal } from './ConflictOverrideModal';

const baseProps = { open: true as const, eventId: 'e1', coachId: 'c1', coachName: 'Casey' };

describe('ConflictOverrideModal (FR-031, L5)', () => {
  it('keeps Confirm disabled until the reason is non-empty after trimming (L5)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConflictOverrideModal {...baseProps} onClose={() => {}} />);

    const confirm = screen.getByRole('button', { name: /Override & assign/i });
    const reason = screen.getByLabelText(/Reason for override/i);
    expect(confirm).toBeDisabled();

    // Whitespace only → still disabled (L5).
    await user.type(reason, '    ');
    expect(confirm).toBeDisabled();

    // Real text → enabled.
    await user.type(reason, 'Tournament makeup session');
    expect(confirm).toBeEnabled();
  });

  it('posts the override with the trimmed reason on confirm', async () => {
    let body: { eventId: string; coachId: string; reason: string } | undefined;
    server.use(
      http.post(apiUrl('/availability/overrides'), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(
          { id: 'o1', eventId: 'e1', coachId: 'c1', overriddenBy: 'admin', reason: body!.reason, createdAt: '2026-05-30T00:00:00Z' },
          { status: 201 },
        );
      }),
    );
    const onClose = vi.fn();
    const onOverridden = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ConflictOverrideModal {...baseProps} onClose={onClose} onOverridden={onOverridden} />
        <ToastHost />
      </>,
    );

    await user.type(screen.getByLabelText(/Reason for override/i), '  Makeup session  ');
    await user.click(screen.getByRole('button', { name: /Override & assign/i }));

    // Await the success toast so the async updates flush inside act.
    expect(await screen.findByText('Override logged for Casey.')).toBeInTheDocument();
    expect(body).toEqual({ eventId: 'e1', coachId: 'c1', reason: 'Makeup session' });
    expect(onOverridden).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
