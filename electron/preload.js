const { contextBridge, ipcRenderer } = require("electron");

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  quit: () => ipcRenderer.send("app-quit"),
  platform: process.platform,
});
