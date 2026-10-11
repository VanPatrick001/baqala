import { useTranslation } from 'react-i18next';
import { useSettings } from '../api/hooks';

/** Locales avec chiffres latins (lisibles sur tickets et lecteurs de codes). */
const LOCALES: Record<string, string> = { en: 'en-US', ur: 'ur-PK-u-nu-latn', ar: 'ar-u-nu-latn' };

export type Translations = Partial<Record<'en' | 'ur' | 'ar', string>> | null | undefined;

/** Nom localisé d'un produit/catégorie avec repli sur le nom par défaut. */
export function localName(lang: string, fallback: string, translations?: Translations) {
  return (translations && translations[lang as 'en']) || fallback;
}

export function useFormat() {
  const { i18n } = useTranslation();
  const { data: settings } = useSettings();
  const locale = LOCALES[i18n.language] ?? 'en-US';
  const currency = (settings?.currency_code as string) ?? 'PKR';
  const decimals = Number(settings?.currency_decimals ?? 2);

  const number = (n: number | null | undefined, digits = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number(n ?? 0));
  const money = (n: number | null | undefined) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n ?? 0));
  const qty = (n: number | null | undefined) => number(n, 3);
  const pct = (n: number | null | undefined) => `${number(n, 1)}%`;
  const date = (s: string | null | undefined) =>
    s ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(s.replace(' ', 'T'))) : '—';
  const dateTime = (s: string | null | undefined) =>
    s ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.replace(' ', 'T'))) : '—';
  const name = (fallback: string, translations?: Translations) => localName(i18n.language, fallback, translations);

  return { locale, currency, number, money, qty, pct, date, dateTime, name, lang: i18n.language };
}

export const today = () => toISODate(new Date());
export const daysAgo = (n: number) => toISODate(new Date(Date.now() - n * 86400000));
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
