const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopHud', {
  getDesktopSnapshot: (extraPaths) => ipcRenderer.invoke('desktop-hud:get-desktop-snapshot', extraPaths),
  selectImportPath: () => ipcRenderer.invoke('desktop-hud:select-import-path'),
  openEntry: (fullPath) => ipcRenderer.invoke('desktop-hud:open-entry', fullPath),
  revealEntry: (fullPath) => ipcRenderer.invoke('desktop-hud:reveal-entry', fullPath),
  previewOrganize: (assignments) => ipcRenderer.invoke('desktop-hud:preview-organize', assignments),
  executeOrganize: (assignments) => ipcRenderer.invoke('desktop-hud:execute-organize', assignments),
  getDesktopIconsVisibility: () => ipcRenderer.invoke('desktop-hud:get-desktop-icons-visibility'),
  setDesktopIconsVisibility: (visible) =>
    ipcRenderer.invoke('desktop-hud:set-desktop-icons-visibility', visible),
  getLaunchAtStartup: () => ipcRenderer.invoke('desktop-hud:get-launch-at-startup'),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke('desktop-hud:set-launch-at-startup', enabled),
  listRunningWindows: () => ipcRenderer.invoke('desktop-hud:list-running-windows'),
  setExternalWindowTopmost: (handle, topmost) =>
    ipcRenderer.invoke('desktop-hud:set-external-window-topmost', handle, topmost),
  getDeepSeekSettings: () => ipcRenderer.invoke('desktop-hud:get-deepseek-settings'),
  saveDeepSeekApiKey: (apiKey) => ipcRenderer.invoke('desktop-hud:save-deepseek-api-key', apiKey),
  summarizeHopeList: (items) => ipcRenderer.invoke('desktop-hud:summarize-hope-list', items),
  translateText: (input) => ipcRenderer.invoke('desktop-hud:translate-text', input),
  setWindowPresentation: (input) => ipcRenderer.invoke('desktop-hud:set-window-presentation', input),
  onPresentationCommand: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop-hud:presentation-command', handler)
    return () => ipcRenderer.removeListener('desktop-hud:presentation-command', handler)
  },
})
