export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: isForm || body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your internet connection and try again.', 'NETWORK');
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string; details?: Record<string, string> } })?.error;
    const fallback =
      res.status === 502 || res.status === 503
        ? 'The server is waking up or busy. Please try again in a moment.'
        : 'Something went wrong. Please try again.';
    throw new ApiError(res.status, err?.message ?? fallback, err?.code ?? 'ERROR', err?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: Body) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: Body) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: Body) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError && e.details && typeof e.details === 'object' ? e.details : {};
}

export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
