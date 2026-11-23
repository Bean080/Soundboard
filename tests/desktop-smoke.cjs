const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { acceleratorFor } = require('../desktop/shortcuts.cjs');

app.setPath('userData', path.join(__dirname, '../.cache/desktop-smoke-profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const timeout = setTimeout(() => finish(new Error('Desktop check timed out')), 40000);
function finish(error) {
  clearTimeout(timeout);
  globalShortcut.unregisterAll();
  if (error) console.error(error);
  app.exit(error ? 1 : 0);
}
let started = false;
app.on('browser-window-created', (_event, window) => {
  if (started) return;
  started = true;
  window.webContents.once('did-finish-load', () => run(window).then(() => finish(), finish));
});

async function run(board) {
  assert.equal(acceleratorFor('KeyQ'), 'Q');
  assert.equal(acceleratorFor('Digit1'), '1');
  assert.equal(acceleratorFor('Numpad1'), 'num1');
  assert.equal(acceleratorFor('Escape'), null);
  await board.webContents.executeJavaScript(`(async () => {
    const store = await window.SoundboardStore;
    const bytes = new Uint8Array(44 + 16000 * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset, value) => [...value].forEach((char, i) => bytes[offset + i] = char.charCodeAt(0));
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
    await store.save({id: 'smoke-tone', title: 'Desktop check', blob: new Blob([bytes], {type: 'audio/wav'}), showOnBoard: true, duration: 2, startAt: 0, endAt: 2, volume: 0});
    localStorage.setItem('soundboard-key-bindings', JSON.stringify({'smoke-tone': 'Numpad1'}));
    return true;
  })()`, true);
  const reloaded = once(board.webContents, 'did-finish-load');
  board.reload();
  await reloaded;
  // Storage loading completes after did-finish-load.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await board.webContents.executeJavaScript("document.querySelectorAll('.sound-card').length === 1")) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await board.webContents.executeJavaScript("document.querySelectorAll('.sound-card').length"), 1);
  assert.equal(await board.webContents.executeJavaScript("document.querySelector('#global-keys').hidden"), false);
  const status = await board.webContents.executeJavaScript('window.easyAudioDesktop.setGlobalEnabled(true)', true);
  assert.deepEqual(status.failed, []);
  assert.ok(globalShortcut.isRegistered('num1'));
  board.webContents.send('easy-audio:trigger', 'smoke-tone');
  let played = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    played = await board.webContents.executeJavaScript("Boolean(document.querySelector('.sound-card.is-playing'))");
    if (played) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(played, 'Background trigger should start clip playback');
  const created = once(app, 'web-contents-created');
  await board.webContents.executeJavaScript("document.querySelector('a[href=\"library.html\"]').click()");
  const [, library] = await created;
  if (library.isLoading()) await once(library, 'did-finish-load');
  assert.equal(library.getURL(), 'easyaudio://app/library.html');
  assert.equal(board.webContents.getURL(), 'easyaudio://app/index.html');
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'Library must not open another window');
  const libraryView = board.contentView.children.find((view) => view.webContents === library);
  assert.ok(libraryView, 'Library must be embedded in the main window');
  const assertLibraryBounds = () => {
    const { width, height } = board.getContentBounds();
    assert.deepEqual(libraryView.getBounds(), { x: 0, y: 0, width, height });
  };
  assertLibraryBounds();
  const resized = once(board, 'resize');
  board.setSize(1000, 700);
  await resized;
  assertLibraryBounds();
  assert.equal(await library.executeJavaScript("(async () => ((await (await window.SoundboardStore).all()).length))()"), 1);
  assert.ok(await board.webContents.executeJavaScript("Boolean(document.querySelector('.sound-card.is-playing'))"), 'Opening Library must keep the board and playback loaded');
  await library.executeJavaScript(`(async () => {
    const store = await window.SoundboardStore;
    const entry = (await store.all())[0];
    entry.title = 'Updated in Library';
    await store.save(entry);
  })()`);
  const closed = once(library, 'destroyed');
  await library.executeJavaScript("document.querySelector('a[href=\"index.html\"]').click()");
  await closed;
  assert.ok(!board.contentView.children.includes(libraryView), 'Back to board must remove the Library pane');
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await board.webContents.executeJavaScript("document.querySelector('.sound-card h2')?.textContent === 'Updated in Library'")) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await board.webContents.executeJavaScript("document.querySelector('.sound-card h2')?.textContent"), 'Updated in Library');
  await board.webContents.executeJavaScript('window.easyAudioDesktop.setGlobalEnabled(false)');
  assert.equal(globalShortcut.isRegistered('num1'), false);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log('PASS: isolated desktop storage, renderer bridge, numpad registration, playback behind Library, same-window navigation and resizing, refreshed Library edits, and shortcut release.');
}

require('../desktop/main.cjs');
