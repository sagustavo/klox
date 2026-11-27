import { getFirebaseClient } from './firebaseClient';

export interface AuthedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown> | unknown[];
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export async function fetchAuthedApi<T>(
  url: string,
  options: AuthedFetchOptions = {}
): Promise<T> {
  const fb = await getFirebaseClient();
  const currentUser = fb?.auth.currentUser ?? null;

  const buildHeaders = async (forceRefresh: boolean): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      ...(options.headers ?? {}),
    };
    if (currentUser) {
      const token = await currentUser.getIdToken(forceRefresh);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return headers;
  };

  try {
    return (await $fetch(url, {
      ...options,
      headers: await buildHeaders(false),
    })) as T;
  } catch (err: unknown) {
    const status =
      (err as { statusCode?: number; response?: { status?: number } })?.statusCode ??
      (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 && currentUser) {
      return (await $fetch(url, {
        ...options,
        headers: await buildHeaders(true),
      })) as T;
    }
    throw err;
  }
}
