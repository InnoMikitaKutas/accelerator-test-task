import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { UserResponse } from '@/types/api';
import { CreateTrainerModal } from './CreateTrainerModal';

const created: UserResponse = {
  id: 'new1',
  email: 'coach@club.com',
  firstName: 'Casey',
  lastName: 'Coach',
  role: 'TRAINER',
  status: 'ACTIVE',
  emailVerified: false,
  lastLoginAt: null,
  createdAt: '2026-05-31T00:00:00Z',
};

function setup() {
  const calls: { created?: UserResponse; closed: boolean } = { closed: false };
  renderWithProviders(
    <CreateTrainerModal
      open
      onClose={() => {
        calls.closed = true;
      }}
      onCreated={(u) => {
        calls.created = u;
      }}
    />,
  );
  return calls;
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^email/i), 'coach@club.com');
  await user.type(screen.getByLabelText(/^first name/i), 'Casey');
  await user.type(screen.getByLabelText(/^last name/i), 'Coach');
  await user.type(screen.getByLabelText(/^business name/i), 'Club FC');
}

describe('CreateTrainerModal', () => {
  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /create trainer/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/business name is required/i)).toBeInTheDocument();
  });

  it('maps 409 EMAIL_EXISTS to a field error and does not create', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/users'), () => HttpResponse.json({ errorCode: 'EMAIL_EXISTS' }, { status: 409 })),
    );
    const calls = setup();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /create trainer/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(calls.created).toBeUndefined();
  });

  it('creates a trainer and reports it to the parent (prepend)', async () => {
    const user = userEvent.setup();
    let sentMode: string | undefined;
    server.use(
      http.post(apiUrl('/users'), async ({ request }) => {
        sentMode = ((await request.json()) as { onboardingMode?: string }).onboardingMode;
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const calls = setup();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /temp password/i }));
    await user.click(screen.getByRole('button', { name: /create trainer/i }));

    await waitFor(() => expect(calls.created).toEqual(created));
    expect(calls.closed).toBe(true);
    expect(sentMode).toBe('TEMP_PASSWORD');
  });
});
