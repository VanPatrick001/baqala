import { useEffect, useState } from 'react';

const QUERY = '(any-pointer: coarse)';

/** Vrai si l'écran est tactile (PC à écran tactile, tablette), même si une souris est aussi branchée. */
export function useTouchScreen() {
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => setTouch(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return touch;
}
