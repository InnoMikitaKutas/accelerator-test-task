import { useEffect, useMemo, useState } from 'react';
import { Plus, UserPlus, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge, type BadgeTone } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { usePaginated } from '@/lib/pagination';
import { useListUsersQuery, useReactivateUserMutation } from '@/features/users/api';
import type { Role, UserResponse, UserStatus } from '@/types/api';
import { RowMenu } from '@/components/admin/RowMenu';
import { CreateTrainerModal } from '@/components/admin/CreateTrainerModal';
import { EditUserDrawer } from '@/components/admin/EditUserDrawer';
import { DeactivateConfirm } from '@/components/admin/DeactivateConfirm';
import { GdprDeleteModal } from '@/components/admin/GdprDeleteModal';
import { CampImportPanel } from '@/components/admin/CampImportPanel';
import styles from '@/components/admin/users.module.css';

const ROLES: Role[] = ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'];
const STATUSES: UserStatus[] = ['ACTIVE', 'INACTIVE', 'DELETED'];

const STATUS_TONE: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'go',
  INACTIVE: 'neutral',
  DELETED: 'foul',
};

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: UserResponse }
  | { kind: 'deactivate'; user: UserResponse }
  | { kind: 'gdpr'; user: UserResponse }
  | null;

function initials(u: UserResponse): string {
  return `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase() || '?';
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 10);
}

/** Super-Admin user management (FR-010/011/012/013/014). Keyset list + filters; row
 *  menu opens create/edit/deactivate/GDPR. Mutation results overlay the keyset list
 *  locally (see users/api note). */
export function UsersDirectory() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');

  const [overrides, setOverrides] = useState<Record<string, UserResponse>>({});
  const [prepended, setPrepended] = useState<UserResponse[]>([]);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);

  const [reactivate] = useReactivateUserMutation();

  // Debounce free-text search → resets keyset accumulation when it changes.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const baseArg = useMemo(
    () => ({
      limit: 25,
      search: search || undefined,
      role: role || undefined,
      status: status || undefined,
      sort: 'createdAt:desc',
    }),
    [search, role, status],
  );

  const { items, hasMore, isFetching, loadMore } = usePaginated(useListUsersQuery, baseArg);

  const rows = useMemo(() => {
    const applied = items.map((u) => overrides[u.id] ?? u);
    const seen = new Set(applied.map((u) => u.id));
    const extras = prepended.filter((u) => !seen.has(u.id)).map((u) => overrides[u.id] ?? u);
    return [...extras, ...applied];
  }, [items, overrides, prepended]);

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const applyUpdate = (user: UserResponse) => setOverrides((prev) => ({ ...prev, [user.id]: user }));
  const applyDeleted = (user: UserResponse) =>
    setOverrides((prev) => ({
      ...prev,
      [user.id]: { ...user, status: 'DELETED', firstName: 'Deleted', lastName: 'User' },
    }));

  const onReactivate = async (user: UserResponse) => {
    setBusy(user.id, true);
    try {
      applyUpdate(await reactivate(user.id).unwrap());
    } catch {
      /* surfaced globally */
    } finally {
      setBusy(user.id, false);
    }
  };

  const columns: Column<UserResponse>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <span className={styles.nameCell}>
          <span className={styles.monogram} aria-hidden="true">
            {initials(u)}
          </span>
          <span className={u.status === 'DELETED' ? styles.struck : undefined}>
            {u.firstName} {u.lastName}
          </span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => u.email },
    { key: 'role', header: 'Role', render: (u) => u.role },
    {
      key: 'org',
      header: 'Org',
      render: (u) => (u.trainerIds?.length ? String(u.trainerIds.length) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <StatusBadge tone={STATUS_TONE[u.status]} strikethrough={u.status === 'DELETED'}>
          {u.status}
        </StatusBadge>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (u) => <span className="u-mono">{formatLastLogin(u.lastLoginAt)}</span>,
    },
  ];

  const rowActions = (u: UserResponse) => {
    if (u.status === 'DELETED') return null;
    const items: { key: string; label: string; onSelect: () => void; danger?: boolean }[] = [
      { key: 'edit', label: 'Edit', onSelect: () => setDialog({ kind: 'edit', user: u }) },
    ];
    if (u.status === 'ACTIVE') {
      items.push({ key: 'deactivate', label: 'Deactivate', onSelect: () => setDialog({ kind: 'deactivate', user: u }) });
    } else {
      items.push({ key: 'reactivate', label: 'Reactivate', onSelect: () => onReactivate(u) });
    }
    items.push({ key: 'gdpr', label: 'Delete (GDPR)', danger: true, onSelect: () => setDialog({ kind: 'gdpr', user: u }) });
    return <RowMenu label={`Actions for ${u.firstName} ${u.lastName}`} items={items} />;
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Super Admin</p>
          <h1>Users</h1>
        </div>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus size={16} aria-hidden="true" /> Create trainer
        </Button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <input
            id="user-search"
            type="search"
            placeholder="Search name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor="role-filter" className="u-label">
            Role
          </label>
          <select id="role-filter" value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filter}>
          <label htmlFor="status-filter" className="u-label">
            Status
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as UserStatus | '')}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {role || status ? (
        <div className={styles.chips}>
          {role ? (
            <span className={styles.chip}>
              Role: {role}
              <button type="button" className={styles.chipX} aria-label="Clear role filter" onClick={() => setRole('')}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {status ? (
            <span className={styles.chip}>
              Status: {status}
              <button type="button" className={styles.chipX} aria-label="Clear status filter" onClick={() => setStatus('')}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <DataTable
        caption="Users"
        columns={columns}
        rows={rows}
        getRowId={(u) => u.id}
        isLoading={isFetching}
        hasMore={hasMore}
        onLoadMore={loadMore}
        busyRowIds={busyIds}
        rowActions={rowActions}
        emptyState={
          <EmptyState
            icon={<UserPlus size={28} aria-hidden="true" />}
            title="No users match"
            description="Try clearing filters or search, or create a trainer to get started."
          />
        }
      />

      <CampImportPanel />

      {dialog?.kind === 'create' ? (
        <CreateTrainerModal
          open
          onClose={() => setDialog(null)}
          onCreated={(u) => setPrepended((prev) => [u, ...prev])}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditUserDrawer open user={dialog.user} onClose={() => setDialog(null)} onUpdated={applyUpdate} />
      ) : null}
      {dialog?.kind === 'deactivate' ? (
        <DeactivateConfirm open user={dialog.user} onClose={() => setDialog(null)} onDeactivated={applyUpdate} />
      ) : null}
      {dialog?.kind === 'gdpr' ? (
        <GdprDeleteModal
          open
          user={dialog.user}
          onClose={() => setDialog(null)}
          onDeleted={() => applyDeleted(dialog.user)}
        />
      ) : null}
    </main>
  );
}
