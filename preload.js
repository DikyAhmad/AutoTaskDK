const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Task execution
  executeAction: (action) => ipcRenderer.invoke('execute-action', action),
  executeTask: (actions) => ipcRenderer.invoke('execute-task', actions),
  stopTask: () => ipcRenderer.invoke('stop-task'),

  // Element picker
  startPicker: () => ipcRenderer.invoke('start-picker'),

  // Status
  getStatus: () => ipcRenderer.invoke('get-status'),

  // Persistence
  saveTasks: (tasks) => ipcRenderer.invoke('save-tasks', tasks),
  loadTasks: () => ipcRenderer.invoke('load-tasks'),

  // Project Management
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProject: (name, actions) => ipcRenderer.invoke('save-project', name, actions),
  loadProject: (name) => ipcRenderer.invoke('load-project', name),
  deleteProject: (name) => ipcRenderer.invoke('delete-project', name),
  renameProject: (oldName, newName) => ipcRenderer.invoke('rename-project', oldName, newName),

  // Selector History
  saveSelectors: (selectors) => ipcRenderer.invoke('save-selectors', selectors),
  loadSelectors: () => ipcRenderer.invoke('load-selectors'),

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
  onPickerResult: (callback) => {
    ipcRenderer.on('picker-result', (_event, data) => callback(data));
  },
  onPickerCancelled: (callback) => {
    ipcRenderer.on('picker-cancelled', (_event) => callback());
  },
});
