import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorKey } from '../../api/client';
import { useAuth } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Field, Modal } from '../../components/ui';

export function ChangePasswordModal({ open, forced, onClose }: { open: boolean; forced: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next !== confirm) return toast.error('auth.passwordsDontMatch');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      if (user) setUser({ ...user, mustChangePassword: false });
      toast.success('auth.passwordChanged');
      setCurrent(''); setNext(''); setConfirm('');
      onClose();
    } catch (err) {
      toast.error(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={forced ? () => undefined : onClose}
      title={t('auth.changePassword')}
      size="sm"
      footer={<button className="btn-primary" disabled={busy || next.length < 8} onClick={submit}>{t('common.save')}</button>}
    >
      {forced && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{t('auth.mustChange')}</p>}
      <div className="space-y-3">
        <Field label={t('auth.currentPassword')}><input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label={t('auth.newPassword')} hint={t('auth.passwordRule')}><input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label={t('auth.confirmPassword')}><input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
