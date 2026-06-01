import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { AppException } from './app.exception';
import { AppErrorCode } from './error-codes';

/** Normalizes every thrown error into the stable error envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      const body = exception.getResponse() as Record<string, unknown>;
      return res
        .status(exception.getStatus())
        .json({ error: HttpStatus[exception.getStatus()], ...body });
    }

    // Throttler → RATE_LIMITED (FR-007) with Retry-After.
    if (exception instanceof ThrottlerException) {
      res.setHeader('Retry-After', '60');
      const meta = AppErrorCode.RATE_LIMITED;
      return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: HttpStatus[HttpStatus.TOO_MANY_REQUESTS],
        errorCode: meta,
        message: 'Too many requests. Please try again later.',
      });
    }

    // Multer size rejection (FR-037/§13). multer throws a MulterError(LIMIT_FILE_SIZE);
    // @nestjs/platform-express maps it to PayloadTooLargeException (413). Either way, surface the
    // stable FILE_TOO_LARGE envelope clients expect rather than a generic HTTP_ERROR.
    const isFileTooLarge =
      (exception as { code?: string })?.code === 'LIMIT_FILE_SIZE' ||
      (exception instanceof HttpException && exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE);
    if (isFileTooLarge) {
      const appErr = new AppException(AppErrorCode.FILE_TOO_LARGE);
      const body = appErr.getResponse() as Record<string, unknown>;
      return res.status(appErr.getStatus()).json({ error: HttpStatus[appErr.getStatus()], ...body });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const message =
        typeof r === 'string' ? r : ((r as { message?: string }).message ?? exception.message);
      return res.status(status).json({
        statusCode: status,
        error: HttpStatus[status],
        errorCode: 'HTTP_ERROR',
        message,
      });
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      errorCode: AppErrorCode.INTERNAL_ERROR,
      message: 'Unexpected error.',
    });
  }
}
