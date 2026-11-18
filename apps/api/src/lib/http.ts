import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import mongoose from 'mongoose';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST', details?: unknown) => new AppError(400, msg, code, details);
export const unauthorized = (msg = 'Please log in to continue', code = 'UNAUTHORIZED') => new AppError(401, msg, code);
export const forbidden = (msg = "You don't have permission to do that", code = 'FORBIDDEN') => new AppError(403, msg, code);
export const notFound = (msg = 'Not found', code = 'NOT_FOUND') => new AppError(404, msg, code);
export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, msg, code);

/** Parses and validates input with a zod schema; throws a 400 with field errors. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest('Please fix the highlighted fields', 'VALIDATION_ERROR', fieldErrors(result.error));
  }
  return result.data;
}

export function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function objectId(id: unknown, what = 'Resource'): mongoose.Types.ObjectId {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw notFound(`${what} not found`);
  return new mongoose.Types.ObjectId(id);
}

export function page(req: Request, defLimit = 20, maxLimit = 50) {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? defLimit), 10) || defLimit, 1), maxLimit);
  const p = Math.max(parseInt(String(req.query.page ?? 1), 10) || 1, 1);
  return { limit, page: p, skip: (p - 1) * limit };
}

export function qstr(v: unknown, max = 100): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function qlist(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => qlist(x));
  if (typeof v !== 'string') return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR', details: fieldErrors(err) } });
    return;
  }
  const anyErr = err as { code?: number; name?: string; type?: string; status?: number; message?: string };
  if (anyErr?.code === 11000) {
    res.status(409).json({ error: { message: 'That already exists', code: 'DUPLICATE' } });
    return;
  }
  if (anyErr?.name === 'MulterError') {
    res.status(400).json({ error: { message: anyErr.message === 'File too large' ? 'Image must be 2 MB or smaller' : anyErr.message, code: 'UPLOAD_ERROR' } });
    return;
  }
  if (anyErr?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Malformed JSON body', code: 'BAD_JSON' } });
    return;
  }
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Request is too large', code: 'TOO_LARGE' } });
    return;
  }
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.', code: 'SERVER_ERROR' } });
}
