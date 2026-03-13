const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Task execution
  executeAction: (action) => ipcRenderer.invoke('execute-action', action),
  executeTask: (actions) => ipcRenderer.invoke('execute-task', actions),

  // Status
  getStatus: () => ipcRenderer.invoke('get-status'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // Event listeners from main
  onExtensionStatus: (callback) => {
    ipcRenderer.on('extension-status', (_event, data) => callback(data));
  },
  onActionResult: (callback) => {
    ipcRenderer.on('action-result', (_event, data) => callback(data));
  },
});
