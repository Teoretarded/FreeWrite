// Thin wrappers around Electron's file dialogs, pre-wired with the format
// registry's filters so the rest of the main process never repeats them.

import { dialog } from 'electron'
import { openFilters, saveFilters } from './formats/index.js'

// Show the "Open" dialog. Returns Electron's result object:
//   { canceled: boolean, filePaths: string[] }
export function showOpen(browserWindow) {
  const opts = {
    title: 'Open',
    properties: ['openFile'],
    filters: openFilters()
  }
  return browserWindow
    ? dialog.showOpenDialog(browserWindow, opts)
    : dialog.showOpenDialog(opts)
}

// Show the "Save" dialog. Returns Electron's result object:
//   { canceled: boolean, filePath?: string }
export function showSave(browserWindow, defaultPath) {
  const opts = {
    title: 'Save As',
    filters: saveFilters()
  }
  if (defaultPath) opts.defaultPath = defaultPath

  return browserWindow
    ? dialog.showSaveDialog(browserWindow, opts)
    : dialog.showSaveDialog(opts)
}
