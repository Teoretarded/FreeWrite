// settings.js — tiny app-wide settings store for FreeWrite.
//
// Settings are GLOBAL (per-install, not per-document): they persist to
// localStorage under a single JSON key and take effect on startup, on New, and
// on Open. The store applies the visual settings by writing CSS custom
// properties on <html> (consumed by styles.css):
//   --fw-text-color  → default text color (the fallback for text WITHOUT an
//                      explicit color mark; see .ProseMirror in styles.css)
//   --fw-page-color  → page/paper color (.fw-sheet background)
//
// Explicit colors chosen from the toolbar still create real TextStyle color
// marks and are unaffected by these defaults — the CSS var is only a fallback.

const STORAGE_KEY = 'freewrite-settings'

export const DEFAULTS = {
  textColor: '#1a1a1a',
  pageColor: '#ffffff',
  normalizePaste: true
}

let settings = { ...DEFAULTS }
const subscribers = new Set()

// --- Persistence -------------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        settings = { ...DEFAULTS, ...parsed }
      }
    }
  } catch {
    /* malformed / unavailable — fall back to defaults */
    settings = { ...DEFAULTS }
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* storage full / unavailable — ignore */
  }
}

// --- Public API --------------------------------------------------------------
/** Get a shallow copy of the current settings. */
export function get() {
  return { ...settings }
}

/**
 * Merge `patch` into the settings, persist, apply the visual settings, and
 * notify subscribers. Returns the new settings snapshot.
 */
export function set(patch = {}) {
  settings = { ...settings, ...patch }
  persist()
  apply()
  for (const fn of subscribers) {
    try {
      fn(get())
    } catch {
      /* a misbehaving subscriber must not break the store */
    }
  }
  return get()
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  if (typeof fn === 'function') subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Restore the built-in defaults (persisted + applied + notified). */
export function reset() {
  return set({ ...DEFAULTS })
}

/**
 * Apply the visual settings to the document by writing CSS custom properties on
 * <html>. styles.css reads these for the editor text color and the page sheets.
 */
export function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--fw-text-color', settings.textColor)
  root.style.setProperty('--fw-page-color', settings.pageColor)
}

// Load + apply on module import so saved settings take effect immediately on
// startup (and therefore on every new/opened document — they are global).
load()
apply()

export default { get, set, subscribe, reset, apply, DEFAULTS }
