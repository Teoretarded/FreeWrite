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
import { mountFind } from './find.js'
import { mountOutline } from './outline.js'
import { createFocusMode } from './focusmode.js'
import './styles.css'

// --- Module-level state ------------------------------------------------------
let currentPath = null
let isDirty = false
let editor = null
let toolbarApi = null
let statusApi = null
let findApi = null
let outlineApi = null
let focusApi = null
let autosaveTimer = null

const AUTOSAVE_KEY = 'freewrite-autosave'
const THEME_KEY = 'freewrite-theme'
const ZOOM_KEY = 'freewrite-zoom'

// The preload bridge. Guard so the module still imports cleanly under test/build
// (window.freewrite only exists at runtime inside Electron). Includes both the
// original surface and the new methods added by the main-process agent.
const fw =
  (typeof window !== 'undefined' && window.freewrite) || {
    openFile: async () => ({ canceled: true }),
    saveFile: async () => ({ canceled: true }),
    onMenu: () => {},
    setDirty: () => {},
    setTitle: () => {},
    onSaveThenClose: () => {},
    confirmClose: () => {},
    onOpenRecent: () => {},
    openPath: async () => ({ canceled: true }),
    pickImage: async () => ({ canceled: true }),
    print: async () => ({ ok: false, error: 'unavailable' }),
    // Added in parallel by the main/preload agent; guarded so this module still
    // builds and runs (drag & drop degrades gracefully) if they are absent.
    getPathForFile: () => '',
    readImage: async () => ({ canceled: true })
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
  if (statusApi) statusApi.setFile(baseName(currentPath))
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

// --- Autosave / recovery -----------------------------------------------------
function scheduleAutosave() {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    try {
      const draft = { html: editor.getHTML(), path: currentPath, ts: Date.now() }
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft))
    } catch {
      /* storage full / unavailable — ignore */
    }
  }, 1500)
}

function clearAutosave() {
  clearTimeout(autosaveTimer)
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* ignore */
  }
}

function maybeShowRecovery() {
  let draft = null
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (raw) draft = JSON.parse(raw)
  } catch {
    draft = null
  }
  if (!draft || !draft.html) return

  const banner = document.getElementById('recovery-banner')
  if (!banner) return
  banner.innerHTML = ''
  const msg = document.createElement('span')
  msg.className = 'rb-text'
  const when = draft.ts ? new Date(draft.ts).toLocaleString() : ''
  msg.textContent = `Recover unsaved document${when ? ` from ${when}` : ''}?`
  const recoverBtn = document.createElement('button')
  recoverBtn.className = 'rb-btn rb-recover'
  recoverBtn.textContent = 'Recover'
  const discardBtn = document.createElement('button')
  discardBtn.className = 'rb-btn rb-discard'
  discardBtn.textContent = 'Discard'

  const hide = () => banner.classList.remove('show')

  recoverBtn.addEventListener('click', () => {
    editor.commands.setContent(draft.html, { emitUpdate: false })
    currentPath = draft.path || null
    markDirty(true)
    refreshUI()
    hide()
    editor.commands.focus('end')
  })
  discardBtn.addEventListener('click', () => {
    clearAutosave()
    hide()
  })

  banner.append(msg, recoverBtn, discardBtn)
  banner.classList.add('show')
}

// --- File actions ------------------------------------------------------------
function loadIntoEditor(html, path) {
  editor.commands.setContent(html || '<p></p>', { emitUpdate: false })
  currentPath = path || null
  markDirty(false)
  refreshUI()
  editor.commands.focus('end')
}

function doNew() {
  if (!confirmDiscardIfDirty()) return
  editor.commands.setContent('<p></p>', { emitUpdate: false })
  currentPath = null
  markDirty(false)
  clearAutosave()
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
  loadIntoEditor(result.html, result.path)
  clearAutosave()
}

async function doSave({ saveAs = false } = {}) {
  let result
  try {
    result = await fw.saveFile(editor.getHTML(), { currentPath, saveAs })
  } catch (err) {
    showToast(`Save failed: ${String(err)}`)
    return { error: String(err) }
  }
  if (!result || result.canceled) return result || { canceled: true }
  if (result.error) {
    showToast(`Could not save file: ${result.error}`)
    return result
  }
  currentPath = result.path || currentPath
  markDirty(false)
  clearAutosave()
  updateTitle()
  // Return the save result so the close-then-save flow can detect success.
  return result
}

function doSaveAs() {
  return doSave({ saveAs: true })
}

// --- Image / link / print actions -------------------------------------------
async function doInsertImage() {
  let r
  try {
    r = await fw.pickImage()
  } catch (err) {
    showToast(`Image insert failed: ${String(err)}`)
    return
  }
  if (!r || r.canceled) return
  if (r.error) {
    showToast(`Could not insert image: ${r.error}`)
    return
  }
  if (r.dataUrl) editor.chain().focus().setImage({ src: r.dataUrl }).run()
}

function doSetLink() {
  const prev = editor.getAttributes('link').href || ''
  // eslint-disable-next-line no-alert
  const url = window.prompt('Link URL (leave empty to remove):', prev)
  if (url === null) return // cancelled
  if (url.trim() === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
}

function doUnlink() {
  editor.chain().focus().extendMarkRange('link').unsetLink().run()
}

async function doPrint() {
  let r
  try {
    r = await fw.print(editor.getHTML())
  } catch (err) {
    showToast(`Print failed: ${String(err)}`)
    return
  }
  if (r && r.error) showToast(`Print failed: ${r.error}`)
}

// --- Drag & drop -------------------------------------------------------------
const DOC_EXTS = ['docx', 'md', 'markdown', 'html', 'htm', 'txt']
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''))
  return m ? m[1].toLowerCase() : ''
}

// Open a dropped document file through the existing open pipeline (with guard).
async function openDroppedDocument(path) {
  if (!confirmDiscardIfDirty()) return
  let r
  try {
    r = await fw.openPath(path)
  } catch (err) {
    showToast(`Open failed: ${String(err)}`)
    return
  }
  if (!r || r.canceled) return
  if (r.error) {
    showToast(`Could not open file: ${r.error}`)
    return
  }
  if (r.html != null) {
    loadIntoEditor(r.html, r.path)
    clearAutosave()
  }
}

// Insert a dropped image at the cursor via the preload readImage bridge.
async function insertDroppedImage(path) {
  let r
  try {
    r = await fw.readImage(path)
  } catch (err) {
    showToast(`Could not insert image: ${String(err)}`)
    return
  }
  if (!r || r.canceled) return
  if (r.error) {
    showToast(`Could not insert image: ${r.error}`)
    return
  }
  if (r.dataUrl) editor.chain().focus().setImage({ src: r.dataUrl }).run()
}

function setupDragAndDrop() {
  // Prevent the browser from navigating to a dropped file in every case.
  const stop = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('dragover', stop)
  window.addEventListener('dragenter', stop)

  window.addEventListener('drop', async (e) => {
    const files = e.dataTransfer?.files
    if (!files || !files.length) return
    e.preventDefault()
    e.stopPropagation()

    // Route each dropped file by extension. Resolve the real path via the
    // preload bridge (Electron strips File.path under contextIsolation).
    for (const file of files) {
      const path = fw.getPathForFile ? fw.getPathForFile(file) : ''
      const ext = extOf(path || file.name)
      if (IMG_EXTS.includes(ext)) {
        if (path) await insertDroppedImage(path)
      } else if (DOC_EXTS.includes(ext)) {
        if (path) {
          // Open the first document and stop — opening replaces the editor.
          await openDroppedDocument(path)
          return
        }
      }
    }
  })
}

// --- Theme (dark mode) -------------------------------------------------------
function applyTheme(theme) {
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  if (toolbarApi) toolbarApi.setDarkActive(dark)
}

function loadTheme() {
  let theme = 'light'
  try {
    theme = localStorage.getItem(THEME_KEY) || 'light'
  } catch {
    /* ignore */
  }
  applyTheme(theme)
  return theme
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark')
  const next = isDark ? 'light' : 'dark'
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    /* ignore */
  }
  applyTheme(next)
}

// --- Zoom --------------------------------------------------------------------
const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 175, 200]
let zoom = 100

function applyZoom(pct) {
  zoom = pct
  const pageEl = document.querySelector('.page')
  if (pageEl) pageEl.style.zoom = String(pct / 100)
  if (statusApi) statusApi.setZoom(pct)
  try {
    localStorage.setItem(ZOOM_KEY, String(pct))
  } catch {
    /* ignore */
  }
}

function loadZoom() {
  let pct = 100
  try {
    const raw = parseInt(localStorage.getItem(ZOOM_KEY) || '100', 10)
    if (!Number.isNaN(raw)) pct = raw
  } catch {
    /* ignore */
  }
  applyZoom(pct)
}

function zoomStep(dir) {
  const idx = ZOOM_LEVELS.indexOf(zoom)
  let nextIdx
  if (idx === -1) {
    // Snap to nearest level.
    nextIdx = ZOOM_LEVELS.findIndex((z) => z >= zoom)
    if (nextIdx === -1) nextIdx = ZOOM_LEVELS.length - 1
  } else {
    nextIdx = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, idx + dir))
  }
  applyZoom(ZOOM_LEVELS[nextIdx])
}

// --- Insert date -------------------------------------------------------------
function doInsertDate() {
  // Renderer-side Date is allowed here (this is not a workflow script).
  const formatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  editor.chain().focus().insertContent(formatted).run()
}

// --- Focus mode / outline toggles --------------------------------------------
function toggleFocus() {
  if (focusApi) focusApi.toggle()
}

function toggleOutline() {
  if (outlineApi) outlineApi.toggle()
  if (toolbarApi && outlineApi) toolbarApi.setOutlineActive(outlineApi.isVisible())
}

// --- UI refresh --------------------------------------------------------------
function refreshUI() {
  if (toolbarApi) toolbarApi.refresh()
  if (statusApi) statusApi.update(editor)
  if (outlineApi) outlineApi.rebuild()
}

// --- Boot --------------------------------------------------------------------
function boot() {
  const pageEl = document.querySelector('.page')
  const toolbarEl = document.getElementById('toolbar')
  const statusbarEl = document.getElementById('statusbar')
  const findHost = document.getElementById('find-host')

  if (!pageEl || !toolbarEl || !statusbarEl) {
    // Structural failure — surface loudly.
    // eslint-disable-next-line no-console
    console.error('FreeWrite: required DOM elements are missing.')
    return
  }

  statusApi = buildStatusbar(statusbarEl, {
    zoomLevels: ZOOM_LEVELS,
    onZoomIn: () => zoomStep(1),
    onZoomOut: () => zoomStep(-1),
    onZoomSet: (pct) => applyZoom(pct)
  })

  // Debounced toolbar active-state refresh. Selection changes/focus drive this
  // (NOT every keystroke); the debounce coalesces rapid selection movement so
  // the hot path stays cheap on large documents.
  let toolbarRefreshTimer = null
  const refreshToolbarDebounced = () => {
    clearTimeout(toolbarRefreshTimer)
    toolbarRefreshTimer = setTimeout(() => {
      if (toolbarApi) toolbarApi.refresh()
    }, 120)
  }

  editor = createEditor({
    element: pageEl,
    content: '<p></p>',
    onUpdate: () => {
      if (!isDirty) markDirty(true)
      // Counts + outline are debounced off the hot typing path. We deliberately
      // do NOT call getHTML() here — autosave (below) serializes at most once
      // per its own 1.5s debounce.
      if (statusApi) statusApi.updateDebounced(editor)
      if (outlineApi && outlineApi.isVisible()) outlineApi.rebuildDebounced()
      scheduleAutosave()
    },
    onSelectionUpdate: () => {
      refreshToolbarDebounced()
      // Selection-count readout in the status bar (debounced).
      if (statusApi) statusApi.updateDebounced(editor)
    },
    onCreate: () => {
      refreshUI()
    }
  })

  if (findHost) findApi = mountFind(editor, findHost)

  // Outline panel (side navigator) + focus mode.
  const outlineHost = document.getElementById('outline-panel')
  const editorArea = document.getElementById('editor-area')
  if (outlineHost) outlineApi = mountOutline(outlineHost, editor, editorArea)
  focusApi = createFocusMode((active) => {
    if (toolbarApi) toolbarApi.setFocusActive(active)
  })

  toolbarApi = buildToolbar(toolbarEl, editor, {
    onNew: doNew,
    onOpen: doOpen,
    onSave: () => doSave({ saveAs: false }),
    onSaveAs: doSaveAs,
    onFind: () => findApi && findApi.open({ replace: false }),
    onReplace: () => findApi && findApi.open({ replace: true }),
    onImage: doInsertImage,
    onLink: doSetLink,
    onUnlink: doUnlink,
    onPrint: doPrint,
    onInsertDate: doInsertDate,
    onToggleOutline: toggleOutline,
    onToggleFocus: toggleFocus,
    onToggleTheme: toggleTheme
  })

  // Reflect persisted theme/zoom now that toolbar/status exist.
  loadTheme()
  loadZoom()

  // Reflect persisted outline / focus state on their toolbar toggles.
  if (outlineApi) toolbarApi.setOutlineActive(outlineApi.isVisible())
  if (focusApi) toolbarApi.setFocusActive(focusApi.isActive())

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

  // Close guard: main asks us to save, then we confirm the close once it lands.
  fw.onSaveThenClose(async () => {
    const r = await doSave({ saveAs: false })
    if (r && !r.canceled && !r.error) fw.confirmClose()
  })

  // Open Recent: main sends a path to load.
  fw.onOpenRecent(async (p) => {
    if (!confirmDiscardIfDirty()) return
    let r
    try {
      r = await fw.openPath(p)
    } catch (err) {
      showToast(`Open failed: ${String(err)}`)
      return
    }
    if (r && r.html != null) {
      loadIntoEditor(r.html, r.path)
      clearAutosave()
    } else if (r && r.error) {
      showToast(r.error)
    }
  })

  // Keyboard shortcuts as a renderer-side backup to the application menu.
  window.addEventListener('keydown', (e) => {
    // Focus / distraction-free mode: F11 or Ctrl+Shift+F (no Ctrl needed for F11).
    if (e.key === 'F11' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f')) {
      e.preventDefault()
      toggleFocus()
      return
    }
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
    } else if (key === 'f') {
      e.preventDefault()
      if (findApi) findApi.open({ replace: false })
    } else if (key === 'h') {
      e.preventDefault()
      if (findApi) findApi.open({ replace: true })
    } else if (key === 'p') {
      e.preventDefault()
      doPrint()
    }
  })

  // --- Drag & drop (window level) -------------------------------------------
  // Dropping a document file opens it (after the unsaved-changes guard);
  // dropping an image inserts it at the cursor. We prevent the browser's
  // default behaviour of navigating to the dropped file.
  setupDragAndDrop()

  // Initial state.
  markDirty(false)
  refreshUI()
  updateTitle()

  // Offer to recover any autosaved draft from a previous crash/close.
  maybeShowRecovery()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
