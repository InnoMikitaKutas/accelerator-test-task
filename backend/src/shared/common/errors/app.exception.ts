import { HttpException } from '@nestjs/common';
import { AppErrorCode, ERROR_META } from './error-codes';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Domain exception carrying a stable {@link AppErrorCode}. The global filter renders it
 * into the standard error envelope. `extra` merges top-level keys (e.g. `{ canResend: true }`).
 */
export class AppException extends HttpException {
  public readonly errorCode: AppErrorCode;

  constructor(
    errorCode: AppErrorCode,
    options?: { message?: string; details?: FieldError[]; extra?: Record<string, unknown> },
  ) {
    const meta = ERROR_META[errorCode];
    super(
      {
        statusCode: meta.status,
        errorCode,
        message: options?.message ?? meta.message,
        ...(options?.details ? { details: options.details } : {}),
        ...(options?.extra ?? {}),
      },
      meta.status,
    );
    this.errorCode = errorCode;
  }
}
