const { app, BrowserWindow, dialog, globalShortcut, ipcMain, protocol, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { registerBindings } = require('./shortcuts.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'easyaudio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const ORIGIN = 'easyaudio://app';
const BOARD = `${ORIGIN}/index.html`;
const LIBRARY = `${ORIGIN}/library.html`;
const root = path.join(__dirname, '..');
const publicFiles = new Set(['index.html', 'library.html', 'styles.css', 'app.js', 'library.js', 'storage.js', 'assets/app-icon.png']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
let boardWindow;
let libraryWindow;
let bindings = [];
let enabled = false;
let failed = [];

function send(channel, value) {
  if (boardWindow && !boardWindow.isDestroyed()) boardWindow.webContents.send(channel, value);
}
function refreshShortcuts() {
  globalShortcut.unregisterAll();
  if (enabled && boardWindow && !boardWindow.isDestroyed() && !BrowserWindow.getAllWindows().some((window) => window.isFocused())) {
    failed = registerBindings(globalShortcut, bindings, (id) => send('easy-audio:trigger', id));
  }
  const status = { enabled, failed };
  send('easy-audio:status', status);
  return status;
}
function isBoardSender(event) {
  return boardWindow && event.sender === boardWindow.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === BOARD;
}
function createWindow(page, parent) {
  const window = new BrowserWindow({
    width: 1180, height: 820, minWidth: 900, minHeight: 480,
    show: !process.argv.includes('--smoke-test'),
    title: 'Easy Audio', backgroundColor: '#11120f',
    icon: path.join(root, 'assets/app-icon.png'), parent,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (page === BOARD && url === LIBRARY) openLibrary();
    else if (page === LIBRARY && url === BOARD) window.close();
  });
  window.on('focus', () => {
    refreshShortcuts();
    if (page === BOARD) send('easy-audio:library-changed');
  });
  window.on('blur', () => setImmediate(refreshShortcuts));
  window.loadURL(page);
  return window;
}
function openLibrary() {
  if (libraryWindow && !libraryWindow.isDestroyed()) return libraryWindow.focus();
  libraryWindow = createWindow(LIBRARY, boardWindow);
  libraryWindow.on('closed', () => {
    libraryWindow = null;
    send('easy-audio:library-changed');
    if (boardWindow && !boardWindow.isDestroyed()) boardWindow.focus();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!boardWindow) return;
    if (boardWindow.isMinimized()) boardWindow.restore();
    boardWindow.focus();
  });
  app.whenReady().then(async () => {
    protocol.handle('easyaudio', async (request) => {
      const url = new URL(request.url);
      const file = url.pathname.slice(1);
      if (url.host !== 'app' || !publicFiles.has(file)) return new Response('Not found', { status: 404 });
      try {
        return new Response(await fs.readFile(path.join(root, file)), { headers: {
          'Content-Type': types[path.extname(file)],
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'",
        } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => origin.startsWith(ORIGIN) && ['media', 'speaker-selection'].includes(permission));
    session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (!contents.getURL().startsWith(`${ORIGIN}/`)) return callback(false);
      if (permission === 'speaker-selection') return callback(true);
      if (permission !== 'media' || !details.mediaTypes?.length || details.mediaTypes.some((type) => type !== 'audio')) return callback(false);
      const answer = await dialog.showMessageBox(BrowserWindow.fromWebContents(contents), {
        type: 'question', buttons: ['Allow', 'Cancel'], defaultId: 1, cancelId: 1,
        message: 'Allow audio device access?', detail: 'Easy Audio needs microphone permission to list all output devices. The microphone stream is immediately stopped after listing them.',
      });
      callback(answer.response === 0);
    });
    ipcMain.handle('easy-audio:bindings', (event, value) => {
      if (!isBoardSender(event) || !Array.isArray(value) || value.length > 20) throw new Error('Invalid bindings');
      const ids = new Set();
      const codes = new Set();
      bindings = value.filter((binding) => {
        if (!binding || typeof binding.id !== 'string' || binding.id.length > 200 || typeof binding.code !== 'string' || binding.code.length > 40 || ids.has(binding.id) || codes.has(binding.code)) return false;
        ids.add(binding.id); codes.add(binding.code); return true;
      }).map(({ id, code }) => ({ id, code }));
      failed = [];
      return refreshShortcuts();
    });
    ipcMain.handle('easy-audio:enabled', (event, value) => {
      if (!isBoardSender(event) || typeof value !== 'boolean') throw new Error('Invalid shortcut state');
      enabled = value;
      failed = [];
      return refreshShortcuts();
    });
    boardWindow = createWindow(BOARD);
    boardWindow.on('closed', () => { boardWindow = null; app.quit(); });
  }).catch((error) => { dialog.showErrorBox('Easy Audio could not start', error.message); app.quit(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
