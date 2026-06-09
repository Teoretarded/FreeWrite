// FreeWrite main process entry point.
// - Creates the main BrowserWindow (contextIsolation on, nodeIntegration off).
// - Loads the renderer (electron-vite dev server in dev, built file in prod).
// - Builds the application Menu (File items emit 'menu:action').
// - Registers IPC handlers (file open/save, ui state, createPdf).

import { app, BrowserWindow, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpc } from './ipc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null

// ---------------------------------------------------------------------------
// Menu: each File action sends 'menu:action' to the focused window's renderer.
// ---------------------------------------------------------------------------

function sendMenu(action) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu:action', action)
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    // macOS application menu.
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenu('new')
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenu('open')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenu('save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenu('save-as')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' }
            ]
          : [{ role: 'close' }])
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

// ---------------------------------------------------------------------------
// Window.
// ---------------------------------------------------------------------------

function createWindow() {
  // electron-vite emits the preload to out/preload/index.js (alongside
  // out/main/index.js, this file's runtime location).
  const preloadPath = path.join(__dirname, '../preload/index.js')

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'FreeWrite',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Load the renderer: dev server URL when provided by electron-vite, else the
  // built index.html.
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// App lifecycle.
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpc()
  Menu.setApplicationMenu(buildMenu())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
