import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '.'];

/**
 * Pavé numérique pour écran tactile. La première touche remplace le montant proposé,
 * les suivantes complètent la saisie.
 */
export function Keypad({ value, onChange, onEnter, enterLabel }: { value: number; onChange: (v: number) => void; onEnter?: () => void; enterLabel?: string }) {
  const [buf, setBuf] = useState<string | null>(null);

  // Montant modifié ailleurs (changement de mode de paiement, paiement ajouté) : on repart de zéro
  useEffect(() => {
    if (buf !== null && Number(buf || 0) !== value) setBuf(null);
  }, [value, buf]);

  const press = (k: string) => {
    let s = buf ?? '';
    if (k === 'C') s = '';
    else if (k === 'back') s = s.slice(0, -1);
    else if (k === '.') { if (!s.includes('.')) s = (s || '0') + '.'; }
    else if (s.replace('.', '').length < 9) s = s === '0' ? k.replace(/^0+/, '') || '0' : s + k;
    setBuf(s);
    onChange(Number(s) || 0);
  };

  const base = 'flex h-14 items-center justify-center rounded-lg border text-xl font-semibold select-none';
  const key = `${base} border-slate-300 bg-white text-slate-800 active:bg-slate-100`;
  return (
    <div dir="ltr" className="mt-3 grid grid-cols-4 gap-2 num">
      <div className="col-span-3 grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className={key} onClick={() => press(k)}>{k}</button>
        ))}
      </div>
      <div className="grid grid-rows-4 gap-2">
        <button type="button" className={key} onClick={() => press('back')} aria-label="Backspace"><Delete size={22} /></button>
        <button type="button" className={`${base} border-slate-300 bg-white text-red-600 active:bg-slate-100`} onClick={() => press('C')}>C</button>
        {onEnter && (
          <button type="button" className={`${base} row-span-2 h-auto border-brand-700 bg-brand-700 px-1 text-center text-base leading-tight text-white active:bg-brand-800`} onClick={onEnter}>{enterLabel ?? 'OK'}</button>
        )}
      </div>
    </div>
  );
}
