import { useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

let activeUser: string | undefined;

export function setRequestUser(userId?: string) {
  activeUser = userId;
}

type RequestOptions = { body?: unknown; method?: string; signal?: AbortSignal };

async function request<T>(path: string, { body, method = 'GET', signal }: RequestOptions = {}): Promise<{ data: T; hasNext: boolean }> {
  const headers = new Headers({ Accept: 'application/json' });
  const account = activeUser;
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('X-IndoKerja-Request', '1');
  if (account && path !== '/auth/me') headers.set('X-IndoKerja-User', account);

  const response = await fetch(`/api${path}`, { method, signal, headers, body: JSON.stringify(body) });
  if (response.status === 401 && !signal?.aborted && account && account === activeUser && path !== '/auth/session' && path !== '/auth/me') {
    window.dispatchEvent(new Event('session-expired'));
  }
  const data = response.status === 204 ? undefined : await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const error = data?.error;
    throw new ApiError(response.status, error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Layanan belum dapat dihubungi. Silakan coba lagi.', error?.fields);
  }
  return { data, hasNext: response.headers.get('Link')?.includes('rel="next"') ?? false };
}

export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, options)).data;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Koneksi bermasalah. Silakan coba lagi.';
}

type Result<T> =
  | { key: string; data: T; hasNext: boolean; error?: never }
  | { key: string; error: string; data?: never; hasNext?: never };

export function useResource<T>(path: string) {
  const [version, setVersion] = useState(0);
  const key = JSON.stringify([path, version]);
  const [result, setResult] = useState<Result<T>>();
  useEffect(() => {
    const controller = new AbortController();
    request<T>(path, { signal: controller.signal }).then(
      result => { if (!controller.signal.aborted) setResult({ key, ...result }); },
      error => { if (!controller.signal.aborted) setResult({ key, error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [key, path]);
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    hasNext: current?.hasNext ?? false,
    reload: () => setVersion(value => value + 1),
  };
}
