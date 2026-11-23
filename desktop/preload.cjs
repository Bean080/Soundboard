const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('easyAudioDesktop', {
  updateBindings: (bindings) => ipcRenderer.invoke('easy-audio:bindings', bindings),
  setGlobalEnabled: (enabled) => ipcRenderer.invoke('easy-audio:enabled', enabled),
  onTrigger: (callback) => listen('easy-audio:trigger', callback),
  onStatus: (callback) => listen('easy-audio:status', callback),
  onLibraryChanged: (callback) => listen('easy-audio:library-changed', callback),
});
