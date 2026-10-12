// Pont sécurisé entre les pages et l'application PC.
// - Écran de connexion (fichier local) : window.BaqalaSetup
// - Serveur BAQALA configuré uniquement : window.BaqalaApp (impression directe des tickets, changement de serveur)
const { contextBridge, ipcRenderer } = require('electron');

const config = ipcRenderer.sendSync('config:get') || {};
const serverOrigin = (() => { try { return new URL(config.serverUrl).origin; } catch { return null; } })();

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('BaqalaSetup', {
    platform: 'desktop',
    getConfig: () => JSON.stringify(config),
    listPrinters: () => ipcRenderer.invoke('printers:list'),
    connect: (json) => ipcRenderer.invoke('config:connect', json),
  });
} else if (serverOrigin && location.origin === serverOrigin) {
  contextBridge.exposeInMainWorld('BaqalaApp', {
    platform: 'desktop',
    print: (kind) => ipcRenderer.invoke('app:print', kind),
    changeServer: () => ipcRenderer.send('app:changeServer'),
  });
}
