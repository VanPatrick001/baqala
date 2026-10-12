// BAQALA pour PC : fenêtre dédiée connectée au serveur du magasin (local ou à distance via Tailscale).
const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const SETUP_PAGE = path.join(__dirname, 'setup', 'connect.html');
const ICON = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

/** { serverUrl, receiptPrinter, kiosk, autoStart, lang } */
let config = loadConfig();
let win = null;

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
const serverOrigin = () => { try { return new URL(config.serverUrl).origin; } catch { return null; } };

function showSetup(reason) {
  win.loadFile(SETUP_PAGE, reason ? { query: { reason } } : undefined);
}
function openServer() {
  if (!serverOrigin()) return showSetup();
  win.loadURL(config.serverUrl).catch(() => {});
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: 'BAQALA',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    kiosk: !!config.kiosk,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  // Serveur injoignable : écran de connexion qui réessaie tout seul
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith('file:')) showSetup('offline');
  });

  // Rester dans BAQALA : les autres liens s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) return;
    try { if (new URL(url).origin === serverOrigin()) return; } catch {}
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  openServer();
}

// ---- Échanges avec les pages ----
ipcMain.on('config:get', (e) => { e.returnValue = config; });
ipcMain.handle('printers:list', async (e) => {
  const list = await e.sender.getPrintersAsync();
  return list.map((p) => ({ name: p.name, isDefault: !!p.isDefault }));
});
ipcMain.handle('config:connect', (_e, json) => {
  config = { ...config, ...JSON.parse(json) };
  saveConfig();
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!config.autoStart });
  win.setKiosk(!!config.kiosk);
  openServer();
});
ipcMain.on('app:changeServer', () => showSetup());
ipcMain.handle('app:print', (e, kind) => new Promise((resolve) => {
  // Ticket : directement sur l'imprimante choisie, sans fenêtre. Rapports : fenêtre d'impression (choix PDF possible).
  const silent = kind === 'receipt' && !!config.receiptPrinter;
  e.sender.print(
    { silent, deviceName: silent ? config.receiptPrinter : undefined, printBackground: true, margins: { marginType: silent ? 'none' : 'default' } },
    (ok, reason) => {
      if (!ok && reason && reason !== 'cancelled' && reason !== 'Print job canceled') {
        dialog.showErrorBox('BAQALA', `Impression impossible : ${reason}`);
      }
      resolve();
    },
  );
}));

// ---- Menu caché (raccourcis clavier) ----
Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'BAQALA',
    submenu: [
      { label: 'Recharger', accelerator: 'F5', click: () => win.webContents.reload() },
      { label: 'Plein écran', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
      { label: 'Changer de serveur', accelerator: 'CmdOrCtrl+Shift+S', click: () => showSetup() },
      { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
      { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: 'Zoom 100 %', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      { label: 'Outils de développement', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      { type: 'separator' },
      { label: 'Quitter', accelerator: 'Alt+F4', role: 'quit' },
    ],
  },
]));

// Une seule fenêtre BAQALA à la fois
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
