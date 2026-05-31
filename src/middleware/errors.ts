import type { NextFunction, Response } from 'express';

/**
 * A domain error carrying the HTTP status it should map to. Service code throws
 * these; route handlers funnel them through `sendAppError` for a consistent
 * `{ error }` body. Anything that is not an AppError is forwarded to the global
 * Express error handler (→ 500), so unexpected failures are never leaked.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function sendAppError(res: Response, err: unknown, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err);
}
