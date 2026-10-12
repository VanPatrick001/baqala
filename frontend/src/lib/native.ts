/**
 * Pont vers les applications BAQALA pour PC (Electron) et Android (WebView).
 * Dans un simple navigateur, `window.BaqalaApp` n'existe pas et on utilise les fonctions du navigateur.
 */
type PrintKind = 'receipt' | 'page';

interface NativeBridge {
  platform: 'desktop' | 'android';
  /** PC : renvoie une promesse. Android : appelle window.__baqalaPrintDone() à la fin. */
  print(kind: PrintKind, widthMm?: number): Promise<void> | void;
  /** Android uniquement : enregistre un fichier (base64) dans Téléchargements. */
  saveFile?(name: string, mime: string, base64: string): void;
  /** Ouvre l'écran de choix de l'adresse du serveur. */
  changeServer(): void;
}

declare global {
  interface Window {
    /** PC : objet exposé par Electron. Android : objet Java (méthodes uniquement, `platform()` est une fonction). */
    BaqalaApp?: any;
    __baqalaPrintDone?: () => void;
  }
}

/** Renvoie le pont natif normalisé, ou undefined dans un navigateur ordinaire. */
export function nativeApp(): NativeBridge | undefined {
  const raw = window.BaqalaApp;
  if (!raw) return undefined;
  const platform = typeof raw.platform === 'function' ? raw.platform() : raw.platform;
  if (platform !== 'desktop' && platform !== 'android') return undefined;
  return {
    platform,
    print: (kind, widthMm) => raw.print(kind, widthMm ?? 0),
    saveFile: raw.saveFile ? (name, mime, base64) => raw.saveFile(name, mime, base64) : undefined,
    changeServer: () => raw.changeServer(),
  };
}

/** Imprime la page (les styles @media print décident de ce qui sort). Se résout quand l'impression est partie. */
export function printDocument(kind: PrintKind = 'page', widthMm?: number): Promise<void> {
  const app = nativeApp();
  if (app?.platform === 'desktop') return Promise.resolve(app.print(kind, widthMm));
  if (app?.platform === 'android') {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 120_000);
      window.__baqalaPrintDone = () => { clearTimeout(timer); window.__baqalaPrintDone = undefined; resolve(); };
      app.print(kind, widthMm);
    });
  }
  window.print(); // bloquant dans les navigateurs de bureau
  return new Promise((resolve) => setTimeout(resolve, 500));
}

/** Télécharge un fichier produit par l'application (export Excel...). */
export async function saveBlob(blob: Blob, name: string) {
  const app = nativeApp();
  if (app?.saveFile) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    app.saveFile(name, blob.type || 'application/octet-stream', btoa(bin));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
