import { contextBridge, ipcRenderer } from 'electron'

// FreeWrite preload bridge.
// Exposes a minimal, typed surface on window.freewrite. contextIsolation is on
// and nodeIntegration is off, so the renderer can only reach the main process
// through these explicitly whitelisted calls.

const api = {
  // -> { canceled, path?, html?, format?, error? }
  openFile: () => ipcRenderer.invoke('file:open'),

  // html: editor HTML, opts: { currentPath?, saveAs? }
  // -> { canceled, path?, format?, error? }
  saveFile: (html, opts = {}) =>
    ipcRenderer.invoke('file:save', {
      html,
      currentPath: opts.currentPath ?? null,
      saveAs: !!opts.saveAs
    }),

  // Subscribe to application-menu actions: 'new' | 'open' | 'save' | 'save-as'.
  onMenu: (handler) => {
    if (typeof handler !== 'function') return
    ipcRenderer.on('menu:action', (_event, action) => handler(action))
  },

  // Tell main the document dirty state (for window close guards / title).
  setDirty: (dirty) => ipcRenderer.send('ui:set-dirty', !!dirty),

  // Tell main the desired window title.
  setTitle: (title) => ipcRenderer.send('ui:set-title', String(title))
}

contextBridge.exposeInMainWorld('freewrite', api)
