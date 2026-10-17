const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('doodle', {
  openOverlay: () => ipcRenderer.invoke('open-overlay'),
  overlayInfo: () => ipcRenderer.invoke('overlay-info'),
  cancelOverlay: () => ipcRenderer.invoke('cancel-overlay'),
  completeOverlay: args => ipcRenderer.invoke('complete-overlay',args),
  onOverlayDrawing: callback => ipcRenderer.on('overlay-drawing',(_,args) => callback(args)),
  onOverlayError: callback => ipcRenderer.on('overlay-error',(_,message) => callback(message)),
  onOverlayCancelled: callback => ipcRenderer.on('overlay-cancelled',() => callback()),
  info: () => ipcRenderer.invoke('info'),
  settings: args => ipcRenderer.invoke('settings', args),
  invalidate: () => ipcRenderer.invoke('invalidate'),
  interpret: args => ipcRenderer.invoke('interpret', args),
  demo: name => ipcRenderer.invoke('demo', name),
  execute: args => ipcRenderer.invoke('execute', args),
  stop: () => ipcRenderer.invoke('stop'),
  onProgress: callback => ipcRenderer.on('progress', (_, message) => callback(message))
});
