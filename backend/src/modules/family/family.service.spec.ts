import { FamilyService } from './family.service';
import { FamilyRepository } from './family.repository';
import { PasswordService } from '@shared/auth/password.service';
import { AssociationService } from '@modules/sharelinks/association.service';
import { AppErrorCode } from '@shared/common/errors/error-codes';

function make(repo: Partial<jest.Mocked<FamilyRepository>>) {
  return new FamilyService(
    repo as unknown as FamilyRepository,
    { hash: jest.fn().mockResolvedValue('h') } as unknown as PasswordService,
    {} as AssociationService,
  );
}

describe('FamilyService.createChild', () => {
  it('warns on a duplicate name+age without confirmation', async () => {
    const svc = make({ hasDuplicate: jest.fn().mockResolvedValue(true) });
    await expect(
      svc.createChild('parent-1', { firstName: 'A', lastName: 'B', age: 8, gender: 'MALE' }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.DUPLICATE_CHILD_WARNING });
  });

  it('creates when confirmed, owned by the parent', async () => {
    const createChild = jest
      .fn()
      .mockResolvedValue({ id: 'cp', firstName: 'A', lastName: 'B', age: 8, gender: 'MALE', userId: 'parent-1' });
    const svc = make({ hasDuplicate: jest.fn().mockResolvedValue(true), createChild });
    const out = await svc.createChild('parent-1', {
      firstName: 'A',
      lastName: 'B',
      age: 8,
      gender: 'MALE',
      confirmDuplicate: true,
    });
    expect(out.profileId).toBe('cp');
    expect(out.hasLogin).toBe(false);
    expect(createChild).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'parent-1', parentUserId: 'parent-1', isChild: true }),
    );
  });
});

describe('FamilyService.enableChildLogin', () => {
  it('rejects an email already in use', async () => {
    const svc = make({
      findChild: jest.fn().mockResolvedValue({ id: 'cp', firstName: 'A', lastName: 'B', userId: 'parent-1' }),
      findUserByEmail: jest.fn().mockResolvedValue({ id: 'existing' }),
    });
    await expect(
      svc.enableChildLogin('parent-1', 'cp', { email: 'Taken@x.com', password: 'Passw0rd' }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.EMAIL_EXISTS });
  });
});
