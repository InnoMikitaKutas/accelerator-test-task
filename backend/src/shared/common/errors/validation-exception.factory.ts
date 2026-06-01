import { ValidationError } from '@nestjs/common';
import { AppException } from './app.exception';
import { AppErrorCode } from './error-codes';

/** Turns class-validator errors into VALIDATION_ERROR + details[] (recurses nested objects). */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const details = flatten(errors);
  return new AppException(AppErrorCode.VALIDATION_ERROR, { details });
}

function flatten(errors: ValidationError[], parent = ''): { field: string; message: string }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((message) => ({ field, message }));
    const children = e.children?.length ? flatten(e.children, field) : [];
    return [...own, ...children];
  });
}
