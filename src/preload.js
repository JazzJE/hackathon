const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('doodle', {
  interpret: args => ipcRenderer.invoke('interpret', args), demo: name => ipcRenderer.invoke('demo', name),
  localStatus: model => ipcRenderer.invoke('local-status', model),
  syncSettings: args => ipcRenderer.invoke('settings',args),
  openOverlay: () => ipcRenderer.invoke('overlay-open'),
  overlaySubmit: args => ipcRenderer.invoke('overlay-submit',args),
  overlayCancel: () => ipcRenderer.invoke('overlay-cancel'),
  onOverlayReset: callback => ipcRenderer.on('overlay-reset',callback),
  onPlan: callback => ipcRenderer.on('plan',(_,plan)=>callback(plan)),
  reactionData: () => ipcRenderer.invoke('reaction-data'),
  execute: args => ipcRenderer.invoke('execute', args), stop: () => ipcRenderer.invoke('stop'),
  onProgress: callback => ipcRenderer.on('progress', (_, message) => callback(message))
});
