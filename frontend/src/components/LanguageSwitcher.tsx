import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Languages } from 'lucide-react';
import { LANGUAGES, type Lang } from '../i18n';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';

/**
 * Bascule de langue à chaud : i18next re-rend les libellés, <html dir> passe en RTL/LTR.
 * Aucun état applicatif (panier, formulaires, filtres) n'est réinitialisé.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const change = (code: Lang) => {
    if (code === i18n.language) return;
    void i18n.changeLanguage(code);
    if (user) {
      setUser({ ...user, preferredLanguage: code });
      api.patch('/auth/me/language', { language: code }).catch(() => undefined);
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Language">
      {!compact && <Languages size={16} className="mx-1 text-slate-400" />}
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => change(l.code)}
          lang={l.code}
          className={clsx('rounded-md px-2.5 py-1 text-sm font-semibold transition', i18n.language === l.code ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100')}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
