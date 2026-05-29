import { avatarFilePipe, logoFilePipe, UploadedFile } from './file-validation';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const file = (over: Partial<UploadedFile>): UploadedFile => ({
  originalname: 'x.png',
  mimetype: 'image/png',
  size: 1000,
  buffer: Buffer.alloc(0),
  ...over,
});

describe('image upload validation', () => {
  it('accepts a small PNG avatar', () => {
    expect(() => avatarFilePipe().transform(file({}))).not.toThrow();
  });

  it('rejects an oversize file with FILE_TOO_LARGE', () => {
    try {
      avatarFilePipe().transform(file({ size: 3 * 1024 * 1024 }));
      fail('should throw');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(AppErrorCode.FILE_TOO_LARGE);
    }
  });

  it('rejects an unsupported mime with UNSUPPORTED_FILE_TYPE', () => {
    try {
      avatarFilePipe().transform(file({ mimetype: 'application/pdf' }));
      fail('should throw');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
  });

  it('avatar rejects SVG but logo allows it', () => {
    expect(() => avatarFilePipe().transform(file({ mimetype: 'image/svg+xml' }))).toThrow(
      AppException,
    );
    expect(() => logoFilePipe().transform(file({ mimetype: 'image/svg+xml' }))).not.toThrow();
  });

  it('requires a file', () => {
    try {
      avatarFilePipe().transform(undefined);
      fail('should throw');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(AppErrorCode.VALIDATION_ERROR);
    }
  });
});
