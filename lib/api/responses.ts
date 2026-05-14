import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE'
  | 'RELATION_IN_USE'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR'
  | 'BAD_REQUEST'

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      error: message,
      ...(details === undefined ? {} : { details }),
    },
    { status },
  )
}

export function validationError(details: unknown, message = 'Validation failed') {
  return apiError('VALIDATION_ERROR', message, 400, details)
}

export function duplicateError(message: string, details?: unknown) {
  return apiError('DUPLICATE', message, 409, details)
}

export function relationInUseError(message: string, details?: unknown) {
  return apiError('RELATION_IN_USE', message, 400, details)
}

export function notFoundError(message: string, details?: unknown) {
  return apiError('NOT_FOUND', message, 404, details)
}

export function databaseError(message = 'Database operation failed', details?: unknown) {
  return apiError('DATABASE_ERROR', message, 500, details)
}
