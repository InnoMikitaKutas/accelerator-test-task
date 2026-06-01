import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { ToastHost } from '@/components/ui/ToastHost';
import type { AvailabilityResponse, TimeSlot } from '@/types/api';
import { WeeklyAvailabilityGrid } from './WeeklyAvailabilityGrid';

const URL = '/availability/coach/c1';
const res = (slots: TimeSlot[]): AvailabilityResponse => ({
  subjectType: 'coach',
  subjectId: 'c1',
  slots,
  updatedAt: '2026-05-30T00:00:00Z',
});

describe('WeeklyAvailabilityGrid (FR-030/039)', () => {
  it('paints a cell via the keyboard and saves the replacement set', async () => {
    let body: { slots: TimeSlot[] } | undefined;
    let stored: TimeSlot[] = [];
    server.use(
      // GET reflects the latest saved set, so the post-save refetch clears `dirty`.
      http.get(apiUrl(URL), () => HttpResponse.json(res(stored))),
      http.put(apiUrl(URL), async ({ request }) => {
        body = (await request.json()) as { slots: TimeSlot[] };
        stored = body.slots;
        return HttpResponse.json(res(stored));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <WeeklyAvailabilityGrid subjectType="coach" subjectId="c1" title="My Times" />
        <ToastHost />
      </>,
    );

    // Wait for the initial load to settle (aria-busy cleared) so the seed flushes inside
    // act before the raw focus() call. The cursor starts on Monday 06:00 (the tabbable cell).
    const grid = await screen.findByRole('grid');
    await waitFor(() => expect(grid.closest('section')).not.toHaveAttribute('aria-busy'));
    const cell = screen.getByRole('gridcell', { name: /Monday 06:00 to 07:00/ });
    act(() => cell.focus()); // raw focus() → onFocus state update; wrap so it flushes in act
    await user.keyboard(' ');

    expect(await screen.findByRole('gridcell', { name: /Monday 06:00 to 07:00, available/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Await the save's consequences so every async update flushes inside act: the
    // success toast (mutation resolved) then Save going disabled (invalidation refetch
    // settled, working copy == server). Then assert the replacement payload.
    expect(await screen.findByText('Availability saved.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
    expect(body?.slots).toEqual([{ dayOfWeek: 1, startTime: '06:00', endTime: '07:00' }]);
  });

  it('surfaces a conflict banner when the server rejects overlapping slots', async () => {
    server.use(
      http.get(apiUrl(URL), () => HttpResponse.json(res([{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }]))),
      http.put(apiUrl(URL), () => HttpResponse.json({ errorCode: 'VALIDATION_ERROR' }, { status: 400 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<WeeklyAvailabilityGrid subjectType="coach" subjectId="c1" />);

    // Add an overlapping slot via list-mode so the working copy differs (dirty) + flags.
    await user.click(await screen.findByRole('button', { name: /List/ }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '12:00' } });
    await user.click(screen.getByRole('button', { name: /Add slot/ }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/overlap/i);
  });

  it('adds and removes slots in list mode', async () => {
    server.use(
      http.get(apiUrl(URL), () => HttpResponse.json(res([{ dayOfWeek: 2, startTime: '09:00', endTime: '10:00' }]))),
    );
    const user = userEvent.setup();
    renderWithProviders(<WeeklyAvailabilityGrid subjectType="coach" subjectId="c1" />);

    await user.click(await screen.findByRole('button', { name: /List/ }));
    // Use the unique Remove-button names ("Tuesday" also appears as a <select> option).
    expect(screen.getByRole('button', { name: 'Remove Tuesday 09:00 to 10:00' })).toBeInTheDocument();

    // Defaults add Monday 09:00–10:00.
    await user.click(screen.getByRole('button', { name: /Add slot/ }));
    expect(screen.getByRole('button', { name: 'Remove Monday 09:00 to 10:00' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Monday 09:00 to 10:00' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove Monday 09:00 to 10:00' })).not.toBeInTheDocument(),
    );
    // The original Tuesday slot is untouched.
    expect(screen.getByRole('button', { name: 'Remove Tuesday 09:00 to 10:00' })).toBeInTheDocument();
  });
});
