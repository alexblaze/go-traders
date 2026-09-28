export type ErrorCode =
  | 'INVALID_SYMBOL'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_DATA'
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_POSITION'
  | 'RISK_LIMIT'
  | 'FEATURE_DISABLED'
  | 'PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  INVALID_SYMBOL: 404,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INSUFFICIENT_DATA: 422,
  INSUFFICIENT_FUNDS: 422,
  INSUFFICIENT_POSITION: 422,
  RISK_LIMIT: 422,
  FEATURE_DISABLED: 403,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS[code];
    this.details = details;
  }
}

export interface ApiErrorBody {
  success: false;
  error: { code: ErrorCode | string; message: string; details?: unknown };
  requestId: string;
}
