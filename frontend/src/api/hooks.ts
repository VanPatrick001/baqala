import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Category, Customer, Meta, Supplier, Tax } from './types';
import { useAuth } from '../stores/auth';

const get = <T,>(url: string, params?: Record<string, unknown>) => api.get<T>(url, { params }).then((r) => r.data);

const authed = () => !!useAuth.getState().token;

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => get<Record<string, string | number | boolean>>('/settings'), enabled: authed(), staleTime: 60_000 });
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => get<Meta>('/meta'), staleTime: 300_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => get<Category[]>('/categories'), staleTime: 60_000 });
export const useTaxes = () => useQuery({ queryKey: ['taxes'], queryFn: () => get<Tax[]>('/taxes'), staleTime: 60_000 });
export const useSuppliers = () => useQuery({ queryKey: ['suppliers'], queryFn: () => get<Supplier[]>('/suppliers'), staleTime: 60_000 });
export const useCustomers = (search = '') =>
  useQuery({ queryKey: ['customers', search], queryFn: () => get<Customer[]>('/customers', { search: search || undefined }) });

export { get };
