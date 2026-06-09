// focusmode.js — distraction-free writing mode.
//
// Toggling focus mode adds `focus-mode` to the document root, which hides the
// toolbar / status bar chrome and centers the page on a calm background (see
// styles.css). The choice is persisted so it survives reloads. Toggling is a
// pure class flip, so it is smooth and free of layout thrash.

const FOCUS_KEY = 'freewrite-focus'

/**
 * @param {(active: boolean) => void} [onChange] - notified after each toggle so
 *        the toolbar can reflect the active state.
 * @returns {{ toggle: () => boolean, setActive: (v: boolean) => void, isActive: () => boolean }}
 */
export function createFocusMode(onChange) {
  function apply(active) {
    document.documentElement.classList.toggle('focus-mode', !!active)
    if (typeof onChange === 'function') onChange(!!active)
  }

  function setActive(active) {
    apply(active)
    try {
      localStorage.setItem(FOCUS_KEY, active ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  function isActive() {
    return document.documentElement.classList.contains('focus-mode')
  }

  function toggle() {
    const next = !isActive()
    setActive(next)
    return next
  }

  // Restore persisted choice.
  let persisted = false
  try {
    persisted = localStorage.getItem(FOCUS_KEY) === '1'
  } catch {
    /* ignore */
  }
  apply(persisted)

  return { toggle, setActive, isActive }
}

export default createFocusMode
