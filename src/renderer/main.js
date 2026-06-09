// main.js — FreeWrite renderer entry point and app wiring.
//
// Holds module-level state (currentPath, isDirty), creates the editor, builds
// the toolbar and status bar, subscribes to application-menu actions, and routes
// New / Open / Save / Save As through the window.freewrite bridge exposed by the
// preload script. All file I/O happens in the main process; this module only
// orchestrates and surfaces results/errors to the user.

import { createEditor } from './editor.js'
import { buildToolbar } from './toolbar.js'
import { buildStatusbar } from './statusbar.js'
import './styles.css'

// --- Module-level state ------------------------------------------------------
let currentPath = null
let isDirty = false
let editor = null
let toolbarApi = null
let statusApi = null

// The preload bridge. Guard so the module still imports cleanly under test/build
// (window.freewrite only exists at runtime inside Electron).
const fw =
  (typeof window !== 'undefined' && window.freewrite) || {
    openFile: async () => ({ canceled: true }),
    saveFile: async () => ({ canceled: true }),
    onMenu: () => {},
    setDirty: () => {},
    setTitle: () => {}
  }

// --- Title / dirty helpers ---------------------------------------------------
function baseName(p) {
  if (!p) return 'Untitled'
  const parts = String(p).split(/[\\/]/)
  return parts[parts.length - 1] || 'Untitled'
}

function updateTitle() {
  const name = baseName(currentPath)
  const title = `FreeWrite — ${name}${isDirty ? ' *' : ''}`
  document.title = title
  fw.setTitle(title)
}

function markDirty(dirty) {
  isDirty = dirty
  fw.setDirty(dirty)
  if (statusApi) statusApi.setSaved(!dirty)
  updateTitle()
}

// --- Toast -------------------------------------------------------------------
let toastTimer = null
function showToast(message, kind = 'error') {
  const host = document.getElementById('toast-host')
  if (!host) {
    // Fallback: never crash if the host is missing.
    // eslint-disable-next-line no-alert
    if (kind === 'error') alert(message)
    return
  }
  const toast = document.createElement('div')
  toast.className = `toast toast-${kind}`
  toast.textContent = message
  host.append(toast)
  // Force reflow then animate in.
  requestAnimationFrame(() => toast.classList.add('show'))
  const remove = () => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 250)
  }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(remove, 3800)
  toast.addEventListener('click', remove)
}

// --- Unsaved-changes guard ---------------------------------------------------
function confirmDiscardIfDirty() {
  if (!isDirty) return true
  // eslint-disable-next-line no-alert
  return window.confirm('You have unsaved changes. Discard them?')
}

// --- File actions ------------------------------------------------------------
function doNew() {
  if (!confirmDiscardIfDirty()) return
  editor.commands.setContent('<p></p>', { emitUpdate: false })
  currentPath = null
  markDirty(false)
  refreshUI()
  editor.commands.focus('end')
}

async function doOpen() {
  if (!confirmDiscardIfDirty()) return
  let result
  try {
    result = await fw.openFile()
  } catch (err) {
    showToast(`Open failed: ${String(err)}`)
    return
  }
  if (!result || result.canceled) return
  if (result.error) {
    showToast(`Could not open file: ${result.error}`)
    return
  }
  editor.commands.setContent(result.html || '<p></p>', { emitUpdate: false })
  currentPath = result.path || null
  markDirty(false)
  refreshUI()
  editor.commands.focus('end')
}

async function doSave({ saveAs = false } = {}) {
  let result
  try {
    result = await fw.saveFile(editor.getHTML(), { currentPath, saveAs })
  } catch (err) {
    showToast(`Save failed: ${String(err)}`)
    return
  }
  if (!result || result.canceled) return
  if (result.error) {
    showToast(`Could not save file: ${result.error}`)
    return
  }
  currentPath = result.path || currentPath
  markDirty(false)
  updateTitle()
}

function doSaveAs() {
  return doSave({ saveAs: true })
}

// --- UI refresh --------------------------------------------------------------
function refreshUI() {
  if (toolbarApi) toolbarApi.refresh()
  if (statusApi) statusApi.update(editor)
}

// --- Boot --------------------------------------------------------------------
function boot() {
  const pageEl = document.querySelector('.page')
  const toolbarEl = document.getElementById('toolbar')
  const statusbarEl = document.getElementById('statusbar')

  if (!pageEl || !toolbarEl || !statusbarEl) {
    // Structural failure — surface loudly.
    // eslint-disable-next-line no-console
    console.error('FreeWrite: required DOM elements are missing.')
    return
  }

  statusApi = buildStatusbar(statusbarEl)

  editor = createEditor({
    element: pageEl,
    content: '<p></p>',
    onUpdate: () => {
      if (!isDirty) markDirty(true)
      if (statusApi) statusApi.update(editor)
    },
    onSelectionUpdate: () => {
      if (toolbarApi) toolbarApi.refresh()
    },
    onCreate: () => {
      refreshUI()
    }
  })

  toolbarApi = buildToolbar(toolbarEl, editor, {
    onNew: doNew,
    onOpen: doOpen,
    onSave: () => doSave({ saveAs: false }),
    onSaveAs: doSaveAs
  })

  // Route application-menu actions.
  fw.onMenu((action) => {
    switch (action) {
      case 'new':
        doNew()
        break
      case 'open':
        doOpen()
        break
      case 'save':
        doSave({ saveAs: false })
        break
      case 'save-as':
        doSaveAs()
        break
      default:
        break
    }
  })

  // Keyboard shortcuts as a renderer-side backup to the application menu
  // (the menu also fires these, but this keeps things working if focus is odd).
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const key = e.key.toLowerCase()
    if (key === 'n') {
      e.preventDefault()
      doNew()
    } else if (key === 'o') {
      e.preventDefault()
      doOpen()
    } else if (key === 's') {
      e.preventDefault()
      if (e.shiftKey) doSaveAs()
      else doSave({ saveAs: false })
    }
  })

  // Initial state.
  markDirty(false)
  refreshUI()
  updateTitle()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
