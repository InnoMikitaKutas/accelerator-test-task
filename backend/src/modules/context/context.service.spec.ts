import { ContextService } from './context.service';
import { ContextRepository } from './context.repository';
import { ContextResolver } from '@shared/tenancy/context-resolver';
import { SessionPrincipal } from '@shared/context/request-context';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const principal = (role: SessionPrincipal['role'] = 'PLAYER'): SessionPrincipal => ({
  id: 'parent-1',
  role,
  email: 'p@b.com',
  emailVerified: true,
  mustChangePassword: false,
  isMinor: false,
  managedByParentUserId: null,
});

describe('ContextService.getContexts', () => {
  it('maps subjects with their active trainer channels + default', async () => {
    const repo = {
      getSubjects: jest.fn().mockResolvedValue({
        profiles: [
          { id: 'self', firstName: 'Dana', lastName: 'P', isSelf: true, isChild: false },
          { id: 'emma', firstName: 'Emma', lastName: 'P', isSelf: false, isChild: true },
        ],
        channels: [
          { playerProfileId: 'self', trainerId: 't-jones', name: 'Jones' },
          { playerProfileId: 'emma', trainerId: 't-smith', name: 'Smith' },
          { playerProfileId: 'emma', trainerId: 't-lee', name: 'Lee' },
        ],
      }),
      getUserDefaults: jest.fn().mockResolvedValue({ subjectProfileId: 'emma', trainerId: 't-smith' }),
    } as unknown as ContextRepository;
    const svc = new ContextService(repo, {} as ContextResolver);

    const out = await svc.getContexts(principal());
    expect(out.subjects).toHaveLength(2);
    expect(out.subjects[1].trainers.map((t) => t.trainerId)).toEqual(['t-smith', 't-lee']);
    expect(out.defaultContext).toEqual({ subjectProfileId: 'emma', trainerId: 't-smith' });
  });

  it('a non-player (no subjects) gets an empty switcher', async () => {
    const repo = {
      getSubjects: jest.fn().mockResolvedValue({ profiles: [], channels: [] }),
      getUserDefaults: jest.fn().mockResolvedValue({ subjectProfileId: null, trainerId: null }),
    } as unknown as ContextRepository;
    const svc = new ContextService(repo, {} as ContextResolver);
    const out = await svc.getContexts(principal('COACH'));
    expect(out.subjects).toEqual([]);
    expect(out.defaultContext).toBeNull();
  });
});

describe('ContextService.setDefault', () => {
  it('forbidden context → CONTEXT_FORBIDDEN, no persist', async () => {
    const repo = { setDefault: jest.fn() } as unknown as ContextRepository;
    const resolver = {
      resolve: jest.fn().mockResolvedValue({ ok: false, reason: 'forbidden' }),
    } as unknown as ContextResolver;
    const svc = new ContextService(repo, resolver);
    await expect(
      svc.setDefault(principal(), { subjectProfileId: 'x', trainerId: 'y' }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.CONTEXT_FORBIDDEN });
    expect(repo.setDefault).not.toHaveBeenCalled();
  });

  it('valid context → persists', async () => {
    const setDefault = jest.fn();
    const repo = { setDefault } as unknown as ContextRepository;
    const resolver = { resolve: jest.fn().mockResolvedValue({ ok: true }) } as unknown as ContextResolver;
    const svc = new ContextService(repo, resolver);
    await svc.setDefault(principal(), { subjectProfileId: 'emma', trainerId: 't-smith' });
    expect(setDefault).toHaveBeenCalledWith('parent-1', 'emma', 't-smith');
  });
});
