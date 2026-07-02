import type { Request, Response, NextFunction } from 'express'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500
  const message = statusCode < 500
    ? err.message
    : 'Something went wrong on our end. Please try again, and contact support if it keeps happening.'

  if (statusCode >= 500) {
    console.error(err)
  }

  res.status(statusCode).json({ error: message, code: err.code })
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'We couldn\'t find what you were looking for. Please refresh the page and try again.' })
}

export function createError(message: string, statusCode: number, code?: string): AppError {
  const err: AppError = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}
