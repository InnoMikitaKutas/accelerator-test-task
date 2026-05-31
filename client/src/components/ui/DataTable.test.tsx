import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [{ key: 'name', header: 'Name' }];

describe('DataTable', () => {
  it('renders rows, the count, and calls onLoadMore (keyset pagination)', async () => {
    const onLoadMore = vi.fn();
    const rows: Row[] = [
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ];
    render(
      <DataTable
        caption="Users"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        hasMore
        total={10}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 10')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when not loading and there are no rows', () => {
    render(
      <DataTable
        caption="Users"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        emptyState="No users."
      />,
    );
    expect(screen.getByText('No users.')).toBeInTheDocument();
  });

  it('marks busy rows with aria-busy', () => {
    const rows: Row[] = [{ id: '1', name: 'Ada' }];
    render(
      <DataTable
        caption="Users"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        busyRowIds={new Set(['1'])}
      />,
    );
    expect(screen.getByText('Ada').closest('tr')).toHaveAttribute('aria-busy', 'true');
  });
});
