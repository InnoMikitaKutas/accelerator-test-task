import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { FormField } from './FormField';

describe('StatusBadge', () => {
  it('renders its label', () => {
    render(<StatusBadge tone="go">Active</StatusBadge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders a struck deleted label', () => {
    render(
      <StatusBadge tone="foul" strikethrough>
        Deleted User
      </StatusBadge>,
    );
    expect(screen.getByText('Deleted User')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="No approvals waiting"
        description="You are all caught up."
        action={<button>Add</button>}
      />,
    );
    expect(screen.getByText('No approvals waiting')).toBeInTheDocument();
    expect(screen.getByText('You are all caught up.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('is aria-hidden by default but announced when labeled', () => {
    const { container, rerender } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    rerender(<Skeleton label="Loading users" />);
    expect(screen.getByRole('status', { name: 'Loading users' })).toBeInTheDocument();
  });
});

describe('FormField', () => {
  it('wires label, aria-describedby and an error alert', () => {
    render(
      <FormField label="Email" error="Invalid email">
        {({ id, describedBy, invalid }) => (
          <input id={id} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)).toHaveTextContent('Invalid email');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email');
  });

  it('shows the helper when there is no error', () => {
    render(
      <FormField label="Name" helper="Your full name">
        {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} />}
      </FormField>,
    );
    expect(screen.getByText('Your full name')).toBeInTheDocument();
  });
});
