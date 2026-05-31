import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';
import { DestructiveConfirm } from './DestructiveConfirm';

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit user">
        <button>Inside</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('moves focus inside on open and restores it on close (ESC)', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const openBtn = screen.getByRole('button', { name: 'Open' });
    await user.click(openBtn);

    expect(screen.getByRole('dialog', { name: 'Edit user' })).toBeInTheDocument();
    // First focusable in the dialog is the Close button.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(openBtn).toHaveFocus(); // restored
  });

  it('closes on scrim click', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>Body</p>
      </Modal>,
    );
    // The overlay is the dialog's parent element.
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    await userEvent.setup().click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DestructiveConfirm', () => {
  it('keeps confirm disabled until a trimmed reason is entered', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirm
        open
        title="Delete"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        confirmLabel="Delete"
        requireReason
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Reason'), '   '); // whitespace only
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Reason'), 'spam account');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('spam account');
  });

  it('requires the typed value to match for type-to-confirm', async () => {
    const user = userEvent.setup();
    render(
      <DestructiveConfirm
        open
        title="GDPR delete"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        confirmLabel="Permanently delete"
        typeToConfirm={{ value: 'jordan@club.com', label: 'Type the email to confirm' }}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Permanently delete' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Type the email to confirm'), 'jordan@club.com');
    expect(confirm).toBeEnabled();
  });
});
