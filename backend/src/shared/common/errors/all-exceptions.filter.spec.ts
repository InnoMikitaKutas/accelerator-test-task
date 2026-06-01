import { ArgumentsHost, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';
import { AppErrorCode } from './error-codes';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, setHeader: jest.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps a raw multer LIMIT_FILE_SIZE error to 413 FILE_TOO_LARGE', () => {
    const { host, status, json } = mockHost();
    filter.catch({ name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'File too large' }, host);
    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: AppErrorCode.FILE_TOO_LARGE }));
  });

  it('maps a PayloadTooLargeException (NestJS multer transform) to FILE_TOO_LARGE', () => {
    const { host, status, json } = mockHost();
    filter.catch(new PayloadTooLargeException(), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: AppErrorCode.FILE_TOO_LARGE }));
  });

  it('passes an AppException through with its own code/status', () => {
    const { host, status, json } = mockHost();
    filter.catch(new AppException(AppErrorCode.NOT_FOUND), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: AppErrorCode.NOT_FOUND }));
  });

  it('maps an unknown error to 500 INTERNAL_ERROR', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: AppErrorCode.INTERNAL_ERROR }));
  });
});
