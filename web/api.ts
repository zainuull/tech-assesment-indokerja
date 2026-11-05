import { useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T>(path: string, { token, body, method, signal }: {
  token?: string; body?: unknown; method?: string; signal?: AbortSignal;
} = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { method, signal, headers, body: JSON.stringify(body) });
  if (response.status === 401 && token) window.dispatchEvent(new CustomEvent('session-expired', { detail: token }));
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const error = data?.error;
    throw new ApiError(response.status, error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Layanan belum dapat dihubungi. Silakan coba lagi.', error?.fields);
  }
  return data;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Koneksi bermasalah. Silakan coba lagi.';
}

type Result<T> = { key: string; data: T; error?: never } | { key: string; error: string; data?: never };

export function useResource<T>(path: string, token?: string) {
  const [version, setVersion] = useState(0);
  const key = JSON.stringify([path, token, version]);
  const [result, setResult] = useState<Result<T>>();
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { token, signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ key, data }); },
      error => { if (!controller.signal.aborted) setResult({ key, error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [key, path, token]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    reload: () => setVersion(value => value + 1),
  };
}
