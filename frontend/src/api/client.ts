import axios, { AxiosError } from 'axios';
import { useAuth } from '../stores/auth';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: string }>) => {
    if (err.response?.status === 401 && useAuth.getState().token) useAuth.getState().logout();
    return Promise.reject(err);
  },
);

/** Clé i18n de l'erreur renvoyée par l'API (les procédures SQL renvoient directement des clés). */
export function errorKey(err: unknown): string {
  const e = err as AxiosError<{ error?: string }>;
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.code === 'ERR_NETWORK') return 'errors.network';
  return 'errors.server';
}

export interface Page<T> {
  rows: T[];
  total: number;
}
