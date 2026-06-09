// Window state persistence.
// Remembers the main window's size, position, and maximized state across
// launches as JSON under the app's userData directory. All operations are
// best-effort: a missing/corrupt file or any fs error yields no state (callers
// fall back to defaults) and write failures are swallowed so persistence can
// never crash the main process.

import { app, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

function storePath() {
  return path.join(app.getPath('userData'), 'freewrite-window.json')
}

// Read the saved state. Returns an object (possibly empty) — never throws.
export function loadWindowState() {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* missing or corrupt -> defaults */
  }
  return {}
}

// Persist the given state. Best-effort; swallows all errors.
export function saveWindowState(state) {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    /* best-effort */
  }
}

// True if the given bounds are at least partially on a connected display, so we
// never restore a window entirely offscreen (e.g. an unplugged monitor).
function boundsAreVisible(bounds) {
  try {
    const displays = screen.getAllDisplays()
    return displays.some((display) => {
      const wa = display.workArea
      return (
        bounds.x < wa.x + wa.width &&
        bounds.x + bounds.width > wa.x &&
        bounds.y < wa.y + wa.height &&
        bounds.y + bounds.height > wa.y
      )
    })
  } catch {
    return false
  }
}

// Resolve the BrowserWindow constructor options to apply for restored bounds.
// Returns { width, height, x?, y? } — falls back to the given defaults when the
// saved bounds are missing or offscreen. Never throws.
export function restoredBounds(defaults) {
  const state = loadWindowState()
  const b = state.bounds
  if (
    b &&
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    b.width > 0 &&
    b.height > 0 &&
    boundsAreVisible(b)
  ) {
    return { width: b.width, height: b.height, x: b.x, y: b.y }
  }
  return { width: defaults.width, height: defaults.height }
}

// True if the last session left the window maximized.
export function wasMaximized() {
  return loadWindowState().isMaximized === true
}

// Capture and persist a window's current state. Uses normal (un-maximized)
// bounds so restoring an un-maximize later lands in the right place. Best-effort.
export function captureWindowState(win) {
  try {
    if (!win || win.isDestroyed() || win.isMinimized()) return
    const isMaximized = win.isMaximized()
    // getNormalBounds() returns the restored (non-maximized) frame even while
    // the window is maximized.
    const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds()
    saveWindowState({ bounds, isMaximized })
  } catch {
    /* best-effort */
  }
}
