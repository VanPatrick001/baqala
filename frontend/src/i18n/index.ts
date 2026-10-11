import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ur from './locales/ur.json';
import ar from './locales/ar.json';

export type Lang = 'en' | 'ur' | 'ar';
export const LANGUAGES: { code: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

const STORAGE_KEY = 'baqala.lang';

function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* stockage indisponible */
  }
  return 'en';
}

/** Applique la direction et la langue au document : tout le CSS (logique) suit. */
export function applyDocumentLanguage(lng: string) {
  const def = LANGUAGES.find((l) => l.code === lng) ?? LANGUAGES[0];
  document.documentElement.lang = def.code;
  document.documentElement.dir = def.dir;
}

// Les traductions sont embarquées dans le bundle : la bascule est instantanée et fonctionne hors ligne.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur }, ar: { translation: ar } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyDocumentLanguage(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});

export default i18n;
