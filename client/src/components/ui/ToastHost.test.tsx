import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { makeStore } from '@/app/store';
import { pushToast } from '@/features/toasts/toastsSlice';
import { ToastHost } from './ToastHost';

describe('ToastHost', () => {
  it('renders toasts from the store and dismisses on click', async () => {
    const store = makeStore();
    renderWithProviders(<ToastHost />, { store });

    act(() => {
      store.dispatch(pushToast({ tone: 'go', message: 'Saved' }));
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('uses role=alert for foul toasts', () => {
    const store = makeStore();
    store.dispatch(pushToast({ tone: 'foul', message: 'Boom' }));
    renderWithProviders(<ToastHost />, { store });
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });

  it('auto-dismisses after durationMs', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore();
      store.dispatch(pushToast({ tone: 'info', message: 'Bye', durationMs: 3000 }));
      renderWithProviders(<ToastHost />, { store });
      expect(screen.getByText('Bye')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText('Bye')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
