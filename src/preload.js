const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('doodle', {
  interpret: args => ipcRenderer.invoke('interpret', args), demo: name => ipcRenderer.invoke('demo', name),
  localStatus: model => ipcRenderer.invoke('local-status', model),
  execute: args => ipcRenderer.invoke('execute', args), stop: () => ipcRenderer.invoke('stop'),
  onProgress: callback => ipcRenderer.on('progress', (_, message) => callback(message))
});
