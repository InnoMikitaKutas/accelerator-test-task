import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ChildSummary, TrainerRef } from '@/types/api';
import { AddChildFlow } from './AddChildFlow';

const created: ChildSummary = {
  profileId: 'kid-new',
  firstName: 'New',
  lastName: 'Kid',
  age: 8,
  gender: 'UNSPECIFIED',
  hasLogin: false,
  allowTokenWithoutApproval: false,
  trainers: [],
};

const noop = () => undefined;

describe('AddChildFlow (FR-021/022, L2)', () => {
  it('clamps the age stepper to 1–18 (L2)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddChildFlow open onClose={noop} onCreated={noop} knownTrainers={[]} />);

    const inc = screen.getByLabelText(/increase age/i);
    for (let i = 0; i < 12; i++) await user.click(inc);
    expect(screen.getByLabelText('Age')).toHaveValue(18);
    expect(inc).toBeDisabled();

    const dec = screen.getByLabelText(/decrease age/i);
    for (let i = 0; i < 20; i++) await user.click(dec);
    expect(screen.getByLabelText('Age')).toHaveValue(1);
    expect(dec).toBeDisabled();
  });

  it('surfaces the duplicate warning and resubmits with confirmDuplicate on "Add anyway"', async () => {
    const user = userEvent.setup();
    const bodies: { confirmDuplicate?: boolean }[] = [];
    server.use(
      http.post(apiUrl('/family/children'), async ({ request }) => {
        const body = (await request.json()) as { confirmDuplicate?: boolean };
        bodies.push(body);
        if (!body.confirmDuplicate)
          return HttpResponse.json({ errorCode: 'DUPLICATE_CHILD_WARNING' }, { status: 409 });
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderWithProviders(<AddChildFlow open onClose={noop} onCreated={noop} knownTrainers={[]} />);

    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Kid');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/already have a child with this name/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add anyway/i }));

    // advanced to step 2 (trainer selection)
    expect(await screen.findByText(/connect .* to a coach/i)).toBeInTheDocument();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].confirmDuplicate).toBe(true);
  });

  it('associates the selected trainers in step 2 (FR-022 multi-select)', async () => {
    const user = userEvent.setup();
    const known: TrainerRef[] = [
      { trainerId: 't1', name: 'Club FC' },
      { trainerId: 't2', name: 'Academy United' },
    ];
    const associated: string[] = [];
    server.use(
      http.post(apiUrl('/family/children'), () => HttpResponse.json(created, { status: 201 })),
      http.post(apiUrl('/family/children/kid-new/trainers'), async ({ request }) => {
        associated.push(((await request.json()) as { trainerId: string }).trainerId);
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithProviders(<AddChildFlow open onClose={noop} onCreated={noop} knownTrainers={known} />);

    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Kid');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const fs = await screen.findByRole('group', { name: /your coaches/i });
    await user.click(within(fs).getByLabelText('Club FC'));
    await user.click(within(fs).getByLabelText('Academy United'));
    await user.click(screen.getByRole('button', { name: /^done/i }));

    await waitFor(() => expect(associated).toEqual(['t1', 't2']));
  });
});
