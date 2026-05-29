import { HttpStatus } from '@nestjs/common';

/** Stable, client-switchable error codes (api-spec §Error code catalog). */
export enum AppErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  FORCE_PASSWORD_CHANGE = 'FORCE_PASSWORD_CHANGE',
  FORBIDDEN_ROLE = 'FORBIDDEN_ROLE',
  CSRF_INVALID = 'CSRF_INVALID',
  CONTEXT_FORBIDDEN = 'CONTEXT_FORBIDDEN',
  TENANT_FORBIDDEN = 'TENANT_FORBIDDEN',
  MINOR_FORBIDDEN = 'MINOR_FORBIDDEN',
  IMPERSONATE_SUPER_ADMIN = 'IMPERSONATE_SUPER_ADMIN',
  NOT_FOUND = 'NOT_FOUND',
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  COACH_ALREADY_ASSIGNED = 'COACH_ALREADY_ASSIGNED',
  DUPLICATE_CHILD_WARNING = 'DUPLICATE_CHILD_WARNING',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_USED = 'TOKEN_USED',
  SHARELINK_EXPIRED = 'SHARELINK_EXPIRED',
  SHARELINK_USED = 'SHARELINK_USED',
  CONTEXT_INACTIVE = 'CONTEXT_INACTIVE',
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED',
  APPROVAL_ALREADY_DECIDED = 'APPROVAL_ALREADY_DECIDED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const ERROR_META: Record<AppErrorCode, { status: HttpStatus; message: string }> = {
  [AppErrorCode.VALIDATION_ERROR]: { status: HttpStatus.BAD_REQUEST, message: 'Validation failed.' },
  [AppErrorCode.INVALID_CREDENTIALS]: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Invalid email or password.',
  },
  [AppErrorCode.UNAUTHENTICATED]: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Authentication required.',
  },
  [AppErrorCode.EMAIL_NOT_VERIFIED]: {
    status: HttpStatus.FORBIDDEN,
    message: 'Please verify your email before logging in.',
  },
  [AppErrorCode.ACCOUNT_INACTIVE]: {
    status: HttpStatus.FORBIDDEN,
    message: 'This account is inactive.',
  },
  [AppErrorCode.FORCE_PASSWORD_CHANGE]: {
    status: HttpStatus.FORBIDDEN,
    message: 'You must change your password before continuing.',
  },
  [AppErrorCode.FORBIDDEN_ROLE]: {
    status: HttpStatus.FORBIDDEN,
    message: 'You do not have permission to perform this action.',
  },
  [AppErrorCode.CSRF_INVALID]: {
    status: HttpStatus.FORBIDDEN,
    message: 'Invalid or missing CSRF token.',
  },
  [AppErrorCode.CONTEXT_FORBIDDEN]: {
    status: HttpStatus.FORBIDDEN,
    message: 'You are not entitled to this context.',
  },
  [AppErrorCode.TENANT_FORBIDDEN]: {
    status: HttpStatus.FORBIDDEN,
    message: 'Cross-tenant access denied.',
  },
  [AppErrorCode.MINOR_FORBIDDEN]: {
    status: HttpStatus.FORBIDDEN,
    message: 'This action is not permitted for child accounts.',
  },
  [AppErrorCode.IMPERSONATE_SUPER_ADMIN]: {
    status: HttpStatus.FORBIDDEN,
    message: 'Super Admins cannot be impersonated.',
  },
  [AppErrorCode.NOT_FOUND]: { status: HttpStatus.NOT_FOUND, message: 'Resource not found.' },
  [AppErrorCode.EMAIL_EXISTS]: {
    status: HttpStatus.CONFLICT,
    message: 'An account with this email already exists.',
  },
  [AppErrorCode.COACH_ALREADY_ASSIGNED]: {
    status: HttpStatus.CONFLICT,
    message: 'This coach is already active under another trainer.',
  },
  [AppErrorCode.DUPLICATE_CHILD_WARNING]: {
    status: HttpStatus.CONFLICT,
    message: 'A child with the same name and age already exists.',
  },
  [AppErrorCode.TOKEN_INVALID]: { status: HttpStatus.GONE, message: 'This link is invalid.' },
  [AppErrorCode.TOKEN_EXPIRED]: { status: HttpStatus.GONE, message: 'This link has expired.' },
  [AppErrorCode.TOKEN_USED]: {
    status: HttpStatus.GONE,
    message: 'This link has already been used.',
  },
  [AppErrorCode.SHARELINK_EXPIRED]: {
    status: HttpStatus.GONE,
    message: 'This invite link has expired.',
  },
  [AppErrorCode.SHARELINK_USED]: {
    status: HttpStatus.GONE,
    message: 'This invite link has already been used.',
  },
  [AppErrorCode.CONTEXT_INACTIVE]: {
    status: HttpStatus.GONE,
    message: 'That connection is no longer active.',
  },
  [AppErrorCode.APPROVAL_EXPIRED]: {
    status: HttpStatus.GONE,
    message: 'This approval request has expired.',
  },
  [AppErrorCode.APPROVAL_ALREADY_DECIDED]: {
    status: HttpStatus.CONFLICT,
    message: 'This approval request has already been decided.',
  },
  [AppErrorCode.FILE_TOO_LARGE]: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'File exceeds the 2 MB limit.',
  },
  [AppErrorCode.UNSUPPORTED_FILE_TYPE]: {
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    message: 'Unsupported file type.',
  },
  [AppErrorCode.RATE_LIMITED]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Too many requests. Please try again later.',
  },
  [AppErrorCode.INTERNAL_ERROR]: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Unexpected error.',
  },
};
