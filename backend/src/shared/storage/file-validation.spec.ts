import { avatarFilePipe, logoFilePipe, ImageValidationPipe, UploadedFile } from './file-validation';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const file = (over: Partial<UploadedFile>): UploadedFile => ({
  originalname: 'x.png',
  mimetype: 'image/png',
  size: 1000,
  buffer: PNG_BYTES,
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
    expect(() =>
      avatarFilePipe().transform(file({ mimetype: 'image/svg+xml', buffer: SVG_BYTES })),
    ).toThrow(AppException);
    expect(() =>
      logoFilePipe().transform(file({ mimetype: 'image/svg+xml', buffer: SVG_BYTES })),
    ).not.toThrow();
  });

  it('rejects when declared MIME and sniffed bytes disagree', () => {
    const pipe = new ImageValidationPipe(['image/png', 'image/jpeg']);
    // Claims PNG, but the bytes are an SVG/script blob.
    try {
      pipe.transform(file({ mimetype: 'image/png', buffer: Buffer.from('<svg><script>') }));
      fail('should throw');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
  });

  it('rejects bytes that match no known image signature', () => {
    try {
      logoFilePipe().transform(file({ mimetype: 'image/png', buffer: Buffer.from('GIF89a') }));
      fail('should throw');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
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
