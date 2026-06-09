// settings-panel.js — the Settings modal for FreeWrite.
//
// A clean overlay + centered card that lets the user pick a default text color,
// a page color, and toggle smart paste-normalization. Every change is
// live-previewed and persisted immediately via the settings store (no Apply
// button). Closes on the Done button, the overlay backdrop, or Esc.

import * as settings from './settings.js'

// Small DOM helper mirroring toolbar.js's `el`.
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c == null) continue
    node.append(c.nodeType ? c : document.createTextNode(c))
  }
  return node
}

// Swatch presets.
const TEXT_SWATCHES = [
  { value: '#1a1a1a', label: 'Black' },
  { value: '#434343', label: 'Dark grey' },
  { value: '#ffffff', label: 'White' },
  { value: '#0066cc', label: 'Blue' },
  { value: '#cc0000', label: 'Red' },
  { value: '#008a00', label: 'Green' }
]

const PAGE_SWATCHES = [
  { value: '#ffffff', label: 'White' },
  { value: '#faf3e0', label: 'Cream' },
  { value: '#f3f4f6', label: 'Soft grey' },
  { value: '#1e1e1e', label: 'Dark' },
  { value: '#111111', label: 'Black' }
]

/**
 * Mount the settings panel into the document. Returns an API the toolbar / app
 * can use: { open, close, toggle, isOpen }.
 *
 * @param {HTMLElement} [host] - container to append into (defaults to body).
 */
export function mountSettingsPanel(host = document.body) {
  // --- Overlay + card shell --------------------------------------------------
  const overlay = el('div', { class: 'fw-settings-overlay', role: 'presentation' })
  const card = el('div', {
    class: 'fw-settings-card',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Settings'
  })

  const header = el('div', { class: 'fw-settings-header' }, [
    el('h2', { class: 'fw-settings-title' }, 'Settings'),
    (() => {
      const x = el('button', { type: 'button', class: 'fw-settings-x', title: 'Close', 'aria-label': 'Close' }, '✕')
      x.addEventListener('click', close)
      return x
    })()
  ])
  card.append(header)

  const body = el('div', { class: 'fw-settings-body' })
  card.append(body)

  // --- A reusable color row (swatches + native picker + hex readout) ---------
  function colorRow({ title, hint, swatches, getValue, onChange }) {
    const row = el('div', { class: 'fw-set-row' })
    row.append(el('div', { class: 'fw-set-label' }, title))
    if (hint) row.append(el('div', { class: 'fw-set-hint' }, hint))

    const controls = el('div', { class: 'fw-set-colors' })
    const swatchEls = []
    for (const sw of swatches) {
      const b = el('button', {
        type: 'button',
        class: 'fw-set-swatch',
        title: sw.label,
        'aria-label': sw.label,
        style: `background:${sw.value}`,
        'data-value': sw.value
      })
      b.addEventListener('click', () => onChange(sw.value))
      swatchEls.push(b)
      controls.append(b)
    }

    const picker = el('input', { type: 'color', class: 'fw-set-picker', title: `Custom ${title.toLowerCase()}` })
    picker.addEventListener('input', () => onChange(picker.value))
    controls.append(picker)

    const hex = el('span', { class: 'fw-set-hex' })
    controls.append(hex)

    row.append(controls)

    const sync = () => {
      const cur = String(getValue() || '').toLowerCase()
      picker.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000'
      hex.textContent = cur
      for (const s of swatchEls) {
        s.classList.toggle('is-selected', s.getAttribute('data-value').toLowerCase() === cur)
      }
    }
    sync()
    return { row, sync }
  }

  // Default text color.
  const textRow = colorRow({
    title: 'Default text color',
    hint: 'Used for text that has no explicit color of its own.',
    swatches: TEXT_SWATCHES,
    getValue: () => settings.get().textColor,
    onChange: (v) => settings.set({ textColor: v })
  })
  body.append(textRow.row)

  // Page color.
  const pageRow = colorRow({
    title: 'Page color',
    hint: 'The color of the paper sheets. Recolors every page instantly.',
    swatches: PAGE_SWATCHES,
    getValue: () => settings.get().pageColor,
    onChange: (v) => settings.set({ pageColor: v })
  })
  body.append(pageRow.row)

  // Normalize-paste toggle.
  const toggleRow = el('div', { class: 'fw-set-row' })
  const toggleLabel = el('label', { class: 'fw-set-toggle' })
  const checkbox = el('input', { type: 'checkbox', class: 'fw-set-checkbox' })
  checkbox.addEventListener('change', () => settings.set({ normalizePaste: checkbox.checked }))
  toggleLabel.append(
    checkbox,
    el('span', { class: 'fw-set-toggle-text' }, [
      el('span', { class: 'fw-set-label' }, 'Normalize text color when pasting (recommended)'),
      el('span', { class: 'fw-set-hint' }, 'Strips pasted text/background colors so pasted text is never invisible on your page.')
    ])
  )
  toggleRow.append(toggleLabel)
  body.append(toggleRow)

  // --- Footer: reset + done --------------------------------------------------
  const footer = el('div', { class: 'fw-settings-footer' })
  const resetBtn = el('button', { type: 'button', class: 'fw-set-btn fw-set-reset' }, 'Reset to defaults')
  resetBtn.addEventListener('click', () => {
    settings.reset()
    syncAll()
  })
  const doneBtn = el('button', { type: 'button', class: 'fw-set-btn fw-set-done' }, 'Done')
  doneBtn.addEventListener('click', close)
  footer.append(resetBtn, doneBtn)
  card.append(footer)

  overlay.append(card)
  host.append(overlay)

  // --- Sync UI from the store ------------------------------------------------
  function syncAll() {
    textRow.sync()
    pageRow.sync()
    checkbox.checked = !!settings.get().normalizePaste
  }

  // Keep the panel in sync if settings change elsewhere while it's open.
  settings.subscribe(() => {
    if (overlay.classList.contains('open')) syncAll()
  })

  // --- Open / close ----------------------------------------------------------
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  function open() {
    syncAll()
    overlay.classList.add('open')
    document.addEventListener('keydown', onKeydown)
    doneBtn.focus()
  }

  function close() {
    overlay.classList.remove('open')
    document.removeEventListener('keydown', onKeydown)
  }

  function toggle() {
    if (overlay.classList.contains('open')) close()
    else open()
  }

  function isOpen() {
    return overlay.classList.contains('open')
  }

  // Close when clicking the backdrop (but not the card).
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })

  return { open, close, toggle, isOpen }
}

export default mountSettingsPanel
