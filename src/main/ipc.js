// IPC handlers for the main process: file open/save flows, UI state messages
// (dirty / title), and the createPdf helper used by the PDF format and any
// other "print to PDF" needs.

import { ipcMain, BrowserWindow, app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { byExtension } from './formats/index.js'
import { showOpen, showSave } from './dialogs.js'

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

function wrapForPrint(bodyHtml) {
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

    // Give the renderer a tick to finish layout before printing.
    await new Promise((r) => setTimeout(r, 50))

    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' }
    })
    return buffer
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

export function registerIpc() {
  // --- Open flow ---------------------------------------------------------
  ipcMain.handle('file:open', async (event) => {
    const win = windowFor(event)
    try {
      const res = await showOpen(win)
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { canceled: true }
      }

      const filePath = res.filePaths[0]
      const module = byExtension(extOf(filePath))
      if (!module || typeof module.deserialize !== 'function') {
        return { canceled: false, error: 'Unsupported file type' }
      }

      const data = await fs.readFile(filePath)
      const html = await module.deserialize(data)
      return {
        canceled: false,
        path: filePath,
        html,
        format: module.name
      }
    } catch (err) {
      return { canceled: false, error: String(err) }
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

      // 4. Success.
      return { canceled: false, path: targetPath, format: module.name }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- UI state: dirty ---------------------------------------------------
  ipcMain.on('ui:set-dirty', (event, dirty) => {
    const win = windowFor(event)
    if (win) win.setDocumentEdited?.(!!dirty)
  })

  // --- UI state: title ---------------------------------------------------
  ipcMain.on('ui:set-title', (event, title) => {
    const win = windowFor(event)
    if (win && typeof title === 'string') win.setTitle(title)
  })
}

// Exported for any caller that wants the print CSS / app metadata.
export { app }
