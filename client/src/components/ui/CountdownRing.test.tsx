import { render, screen, waitFor } from '@testing-library/react';
import { CountdownRing } from './CountdownRing';

describe('CountdownRing', () => {
  it('renders MM:SS digits and a labeled timer (non-animated text equivalent)', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    render(<CountdownRing expiresAt={expiresAt} totalMs={60_000} label="Auto-exit in" />);

    const timer = screen.getByRole('timer');
    expect(timer.getAttribute('aria-label')).toContain('Auto-exit in');
    expect(timer.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('switches to foul tone below the threshold', () => {
    const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString(); // 4 min left
    render(
      <CountdownRing expiresAt={expiresAt} totalMs={60 * 60_000} foulThresholdMs={5 * 60_000} />,
    );
    expect(screen.getByRole('timer')).toHaveAttribute('data-tone', 'foul');
  });

  it('fires onComplete once when already expired', async () => {
    const onComplete = vi.fn();
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    render(<CountdownRing expiresAt={expiresAt} totalMs={60_000} onComplete={onComplete} />);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
