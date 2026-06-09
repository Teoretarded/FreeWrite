// FreeWrite main process entry point.
// - Creates the main BrowserWindow (contextIsolation on, nodeIntegration off).
// - Loads the renderer (electron-vite dev server in dev, built file in prod).
// - Builds the application Menu (File items emit 'menu:action').
// - Registers IPC handlers (file open/save, ui state, createPdf).

import { app, BrowserWindow, Menu, dialog, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpc } from './ipc.js'
import { getRecent, clearRecent } from './recent.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null

// Close-guard state. forceClose lets the renderer (after Save / Don't Save) or
// the main-process dialog allow the window to actually tear down. lastDirty is
// kept in sync from the renderer's ui:set-dirty messages so the close handler
// can decide synchronously.
let forceClose = false
let lastDirty = false

// ---------------------------------------------------------------------------
// Menu: each File action sends 'menu:action' to the focused window's renderer.
// ---------------------------------------------------------------------------

function sendMenu(action) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu:action', action)
  }
}

function sendToRenderer(channel, payload) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

// Build the "Open Recent" submenu from the persisted recent list.
function buildRecentSubmenu() {
  const recent = getRecent()
  const items = []

  if (recent.length === 0) {
    items.push({ label: 'No Recent Files', enabled: false })
  } else {
    for (const filePath of recent) {
      items.push({
        label: path.basename(filePath),
        toolTip: filePath,
        click: () => sendToRenderer('menu:open-recent', filePath)
      })
    }
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Clear Recent Files',
    enabled: recent.length > 0,
    click: () => {
      clearRecent()
      rebuildMenu()
    }
  })

  return items
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
        {
          label: 'Open Recent',
          submenu: buildRecentSubmenu()
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

// Rebuild + reapply the application menu (used when the recent list changes).
function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu())
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

  // --- OS-level close guard ----------------------------------------------
  // If the document is dirty (and we're not already force-closing), intercept
  // the close and prompt Save / Don't Save / Cancel.
  mainWindow.on('close', (e) => {
    if (forceClose || !lastDirty) return

    e.preventDefault()
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'FreeWrite',
      message: 'Save changes before closing?'
    })

    if (choice === 0) {
      // Save: ask the renderer to save, then it will call app:confirm-close.
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:save-then-close')
      }
    } else if (choice === 1) {
      // Don't Save: discard and close.
      forceClose = true
      if (!mainWindow.isDestroyed()) mainWindow.close()
    }
    // Cancel (2): do nothing, window stays open.
  })

  // --- Spellcheck context menu -------------------------------------------
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template = []

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        })
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: 'No suggestions', enabled: false })
      }
      template.push({ type: 'separator' })
      template.push({
        label: 'Add to dictionary',
        click: () =>
          session.defaultSession.addWordToSpellCheckerDictionary(
            params.misspelledWord
          )
      })
      template.push({ type: 'separator' })
    }

    template.push(
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' }
    )

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: mainWindow })
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
    forceClose = false
    lastDirty = false
  })
}

// ---------------------------------------------------------------------------
// App lifecycle.
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // Spellcheck: best-effort, skip if unavailable on this platform/build.
  try {
    session.defaultSession.setSpellCheckerLanguages(['en-US'])
  } catch {
    /* spellcheck unavailable */
  }

  registerIpc({
    // Rebuild the Open Recent submenu whenever the recent list changes.
    onRecentChanged: () => rebuildMenu(),
    // Track dirty state for the synchronous OS-level close guard.
    onDirtyChanged: (win, dirty) => {
      if (win && win === mainWindow) lastDirty = dirty
    },
    // Renderer finished saving (or chose to discard): allow the close.
    onConfirmClose: (win) => {
      if (win && win === mainWindow && !mainWindow.isDestroyed()) {
        forceClose = true
        mainWindow.close()
      }
    }
  })

  Menu.setApplicationMenu(buildMenu())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
