import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorKey } from '../../api/client';
import { useAuth, type User } from '../../stores/auth';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Spinner } from '../../components/ui';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
      login(data.token, data.user);
      qc.clear();
      // On restaure la langue préférée de l'utilisateur
      if (data.user.preferredLanguage && data.user.preferredLanguage !== i18n.language) await i18n.changeLanguage(data.user.preferredLanguage);
      navigate(data.user.permissions.includes('pos.use') && data.user.role === 'CASHIER' ? '/pos' : '/');
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="absolute top-4 end-4"><LanguageSwitcher /></div>
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-12 w-12" />
          <h1 className="text-2xl font-extrabold tracking-wide text-brand-800">BAQALA</h1>
          <p className="text-sm text-slate-500">{t('auth.tagline')}</p>
        </div>
        <label className="label" htmlFor="u">{t('auth.username')}</label>
        <input id="u" className="input mb-3" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="label" htmlFor="p">{t('auth.password')}</label>
        <input id="p" type="password" className="input mb-4" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{t(error)}</div>}
        <button className="btn-primary w-full" disabled={busy || !username || !password}>{busy ? <Spinner className="text-white" /> : t('auth.login')}</button>
        <p className="mt-4 text-center text-xs text-slate-400">{t('auth.defaultHint')}</p>
      </form>
    </div>
  );
}
