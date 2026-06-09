// IPC handlers for the main process: file open/save flows, UI state messages
// (dirty / title), and the createPdf helper used by the PDF format and any
// other "print to PDF" needs.

import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { byExtension } from './formats/index.js'
import { showOpen, showSave } from './dialogs.js'
import { addRecent, removeRecent } from './recent.js'

// ---------------------------------------------------------------------------
// createPdf: render an HTML document to a PDF Buffer.
// Uses an offscreen BrowserWindow + webContents.printToPDF with print CSS.
// ---------------------------------------------------------------------------

const PRINT_CSS = `
  @page { margin: 1in; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
  }
  h1 { font-size: 22pt; margin: 0 0 0.5em; }
  h2 { font-size: 18pt; margin: 0 0 0.4em; }
  h3 { font-size: 14pt; margin: 0 0 0.3em; }
  p { margin: 0 0 0.6em; }
  img { max-width: 100%; height: auto; }
  pre {
    font-family: 'Courier New', monospace;
    background: #f4f4f4;
    padding: 0.5em 0.75em;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  code { font-family: 'Courier New', monospace; }
  blockquote {
    margin: 0 0 0.6em;
    padding-left: 1em;
    border-left: 3px solid #999;
    color: #333;
  }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #999; padding: 4px 8px; }
`.trim()

// Exported so the print path (app:print) shares the EXACT same print CSS as the
// PDF export path (createPdf).
export function wrapForPrint(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${PRINT_CSS}
</style>
</head>
<body>
${String(bodyHtml ?? '')}
</body>
</html>`
}

// Wait for a real "content settled" signal instead of a fixed delay: resolve on
// document.fonts.ready (fonts laid out) and decode of any images. Falls back
// gracefully and is bounded by a timeout so it can never hang the print flow.
async function waitForContentReady(webContents) {
  try {
    await webContents.executeJavaScript(
      `(() => {
        const fontsReady = (document.fonts && document.fonts.ready)
          ? document.fonts.ready.then(() => true).catch(() => true)
          : Promise.resolve(true)
        const imgs = Array.from(document.images || [])
        const imgsReady = Promise.all(imgs.map((img) => {
          if (img.complete) return true
          if (img.decode) return img.decode().then(() => true).catch(() => true)
          return new Promise((res) => {
            img.addEventListener('load', () => res(true), { once: true })
            img.addEventListener('error', () => res(true), { once: true })
          })
        }))
        const timeout = new Promise((res) => setTimeout(() => res(true), 3000))
        return Promise.race([Promise.all([fontsReady, imgsReady]), timeout]).then(() => true)
      })()`,
      true
    )
  } catch {
    // If the page context is gone or executeJavaScript fails, fall back to a
    // small fixed delay rather than throwing.
    await new Promise((r) => setTimeout(r, 50))
  }
}

export async function createPdf(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  try {
    const dataUrl =
      'data:text/html;charset=utf-8,' + encodeURIComponent(wrapForPrint(html))
    await win.loadURL(dataUrl)

    // Wait on a real font/image-ready signal before printing.
    await waitForContentReady(win.webContents)

    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' }
    })
    return buffer
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

// Print the given HTML using the same print CSS as createPdf. Opens a hidden
// window, waits for content, sends to the system printer, and always destroys
// the window. Never throws: returns { ok, error? }.
export async function printHtml(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  try {
    const dataUrl =
      'data:text/html;charset=utf-8,' + encodeURIComponent(wrapForPrint(html))
    await win.loadURL(dataUrl)
    await waitForContentReady(win.webContents)

    const result = await new Promise((resolve) => {
      try {
        win.webContents.print(
          { printBackground: true },
          (success, failureReason) => {
            if (success) resolve({ ok: true })
            else resolve({ ok: false, error: failureReason || 'Print canceled' })
          }
        )
      } catch (err) {
        resolve({ ok: false, error: String(err) })
      }
    })
    return result
  } catch (err) {
    return { ok: false, error: String(err) }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

// ---------------------------------------------------------------------------
// Atomic write: write to a temp file in the same directory, then rename over
// the target so a partial/failed write can never corrupt an existing file.
// ---------------------------------------------------------------------------

async function atomicWrite(targetPath, data) {
  const dir = path.dirname(targetPath)
  const base = path.basename(targetPath)
  const tmp = path.join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.tmp`
  )

  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')

  try {
    await fs.writeFile(tmp, payload)
    await fs.rename(tmp, targetPath)
  } catch (err) {
    // Best-effort cleanup of the temp file on failure.
    try {
      await fs.unlink(tmp)
    } catch {
      /* ignore */
    }
    throw err
  }
}

function extOf(filePath) {
  return path.extname(filePath).toLowerCase().replace(/^\./, '')
}

// ---------------------------------------------------------------------------
// Window title helper (set from ui:set-title / ui:set-dirty messages).
// ---------------------------------------------------------------------------

function windowFor(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? null
}

// ---------------------------------------------------------------------------
// Registration. Call once after the app is ready.
// ---------------------------------------------------------------------------

// Hooks set by registerIpc so other main modules can react to IPC events.
//   onRecentChanged() -> rebuild the Open Recent submenu.
//   onDirtyChanged(win, dirty) -> let the close guard track dirty state.
let hooks = { onRecentChanged: null, onDirtyChanged: null, onConfirmClose: null }

// Image file extensions the picker accepts, plus their MIME types.
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp'
}

function notifyRecentChanged() {
  try {
    hooks.onRecentChanged?.()
  } catch {
    /* never let a menu rebuild crash an IPC handler */
  }
}

// Shared importer: read+deserialize a path. Updates recent on success; drops it
// from recent on failure. Returns { path, html, format } or { error }.
async function importPath(filePath) {
  const module = byExtension(extOf(filePath))
  if (!module || typeof module.deserialize !== 'function') {
    removeRecent(filePath)
    notifyRecentChanged()
    return { error: 'Unsupported file type' }
  }
  try {
    const data = await fs.readFile(filePath)
    const html = await module.deserialize(data)
    addRecent(filePath)
    notifyRecentChanged()
    return { path: filePath, html, format: module.name }
  } catch (err) {
    // Missing/corrupt file: drop from recent so the submenu self-heals.
    removeRecent(filePath)
    notifyRecentChanged()
    return { error: String(err) }
  }
}

export function registerIpc(opts = {}) {
  hooks = {
    onRecentChanged: typeof opts.onRecentChanged === 'function' ? opts.onRecentChanged : null,
    onDirtyChanged: typeof opts.onDirtyChanged === 'function' ? opts.onDirtyChanged : null,
    onConfirmClose: typeof opts.onConfirmClose === 'function' ? opts.onConfirmClose : null
  }

  // --- Open flow ---------------------------------------------------------
  ipcMain.handle('file:open', async (event) => {
    const win = windowFor(event)
    try {
      const res = await showOpen(win)
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { canceled: true }
      }

      const filePath = res.filePaths[0]
      const result = await importPath(filePath)
      if (result.error) return { canceled: false, error: result.error }
      return { canceled: false, ...result }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- Open a specific path (recent files / programmatic) ----------------
  ipcMain.handle('file:open-path', async (_event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { error: 'No file path provided' }
      }
      return await importPath(filePath)
    } catch (err) {
      return { error: String(err) }
    }
  })

  // --- Pick an image -> data URL -----------------------------------------
  ipcMain.handle('file:pick-image', async (event) => {
    const win = windowFor(event)
    try {
      const opts = {
        title: 'Insert Image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: IMAGE_EXTS }]
      }
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)

      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { canceled: true }
      }

      const filePath = res.filePaths[0]
      const ext = extOf(filePath)
      const mime = IMAGE_MIME[ext] || 'application/octet-stream'
      const data = await fs.readFile(filePath)
      const dataUrl = `data:${mime};base64,${data.toString('base64')}`
      return { canceled: false, dataUrl }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- Print -------------------------------------------------------------
  ipcMain.handle('app:print', async (_event, html) => {
    return printHtml(html)
  })

  // --- Confirm close (renderer agreed to discard / finished saving) ------
  ipcMain.on('app:confirm-close', (event) => {
    const win = windowFor(event)
    if (win && hooks.onConfirmClose) {
      hooks.onConfirmClose(win)
    }
  })

  // --- Save flow ---------------------------------------------------------
  ipcMain.handle('file:save', async (event, payload) => {
    const win = windowFor(event)
    const { html, currentPath = null, saveAs = false } = payload ?? {}

    try {
      // 1. Determine target path.
      let targetPath = currentPath
      if (saveAs || !currentPath) {
        const res = await showSave(win, currentPath || undefined)
        if (res.canceled || !res.filePath) {
          return { canceled: true }
        }
        targetPath = res.filePath
      }

      // 2. Derive extension; default to docx when unknown.
      let module = byExtension(extOf(targetPath))
      if (!module) {
        module = byExtension('docx')
        // Append the default extension if the chosen path has no usable one.
        if (!extOf(targetPath)) targetPath = `${targetPath}.docx`
      }

      // 3. Serialize + atomic write.
      const data = await module.serialize(html, { createPdf })
      await atomicWrite(targetPath, data)

      // 4. Record in recent files and rebuild the submenu.
      addRecent(targetPath)
      notifyRecentChanged()

      // 5. Success.
      return { canceled: false, path: targetPath, format: module.name }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- UI state: dirty ---------------------------------------------------
  ipcMain.on('ui:set-dirty', (event, dirty) => {
    const win = windowFor(event)
    if (win) win.setDocumentEdited?.(!!dirty)
    // Let the OS-level close guard track dirty state synchronously.
    try {
      hooks.onDirtyChanged?.(win, !!dirty)
    } catch {
      /* ignore */
    }
  })

  // --- UI state: title ---------------------------------------------------
  ipcMain.on('ui:set-title', (event, title) => {
    const win = windowFor(event)
    if (win && typeof title === 'string') win.setTitle(title)
  })
}

// Exported for any caller that wants the print CSS / app metadata.
export { app }
