'use strict';
// Puente minimo entre la ventana y el proceso principal. La pagina no tiene
// acceso a Node ni al sistema: solo a estas funciones. Ninguna entrega a la
// pagina tokens ni sesiones: de la cuenta solo recibe el nombre del jugador.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ishe', {
  getState: () => ipcRenderer.invoke('ishe:state'),
  play: () => ipcRenderer.invoke('ishe:play'),
  setRam: (gigabytes) => ipcRenderer.invoke('ishe:set-ram', gigabytes),
  openFolder: () => ipcRenderer.invoke('ishe:open-folder'),
  loginStart: () => ipcRenderer.invoke('ishe:login-start'),
  loginCancel: () => ipcRenderer.invoke('ishe:login-cancel'),
  loginOpenPage: () => ipcRenderer.invoke('ishe:login-open'),
  loginCopyCode: () => ipcRenderer.invoke('ishe:login-copy'),
  logout: () => ipcRenderer.invoke('ishe:logout'),
  setDisplayName: (name) => ipcRenderer.invoke('ishe:set-display-name', name),
  clearDisplayName: () => ipcRenderer.invoke('ishe:clear-display-name'),
  setTheme: (changes) => ipcRenderer.invoke('ishe:set-theme', changes),
  pickLogo: () => ipcRenderer.invoke('ishe:pick-logo'),
  clearLogo: () => ipcRenderer.invoke('ishe:clear-logo'),
  resetTheme: () => ipcRenderer.invoke('ishe:reset-theme'),
  updateCheck: () => ipcRenderer.invoke('ishe:update-check'),
  updateRestart: () => ipcRenderer.invoke('ishe:update-restart'),
  creatorLoadKey: () => ipcRenderer.invoke('ishe:creator-load-key'),
  creatorForgetKey: () => ipcRenderer.invoke('ishe:creator-forget-key'),
  creatorBuild: (input) => ipcRenderer.invoke('ishe:creator-build', input),
  creatorOpenFolder: () => ipcRenderer.invoke('ishe:creator-open-folder'),
  onEvent: (callback) => {
    ipcRenderer.removeAllListeners('ishe:event');
    ipcRenderer.on('ishe:event', (_event, payload) => callback(payload));
  },
});
