import { Injectable, PipeTransform } from '@nestjs/common';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { sniffImageType } from './magic-bytes';

/** Minimal shape of a multer-uploaded file (avoids a hard @types/multer dependency). */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (api-spec)

@Injectable()
export class ImageValidationPipe implements PipeTransform<UploadedFile | undefined, UploadedFile> {
  constructor(private readonly allowed: string[]) {}

  transform(file: UploadedFile | undefined): UploadedFile {
    if (!file) {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'file', message: 'A file is required' }],
      });
    }
    if (file.size > MAX_BYTES) throw new AppException(AppErrorCode.FILE_TOO_LARGE);
    if (!this.allowed.includes(file.mimetype)) {
      throw new AppException(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    // §13: trust the bytes, not the client-declared MIME. The sniffed type must be allowed AND
    // match the declared type, so a script blob masquerading as image/png is rejected.
    const sniffed = sniffImageType(file.buffer);
    if (!sniffed || !this.allowed.includes(sniffed) || sniffed !== file.mimetype) {
      throw new AppException(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    return file;
  }
}

export const avatarFilePipe = () => new ImageValidationPipe(['image/png', 'image/jpeg']);
export const logoFilePipe = () =>
  new ImageValidationPipe(['image/png', 'image/jpeg', 'image/svg+xml']);
