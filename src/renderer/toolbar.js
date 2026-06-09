// toolbar.js — builds the Tier-1 toolbar and wires every control to the editor.
//
// The toolbar is built programmatically so the markup and the wiring live
// together. `buildToolbar` returns a `refresh()` function that the app calls on
// every editor transaction to reflect active state (toggling `.is-active`).

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Calibri', value: 'Calibri, Carlito, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' }
]

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72']

const LINE_HEIGHTS = [
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' },
  { label: '2.5', value: '2.5' },
  { label: '3', value: '3' }
]

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#ffffff',
  '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
  '#ff0000', '#ff6600', '#88ff00', '#00ffff', '#0000ff', '#ff00ff'
]

const HIGHLIGHT_COLORS = [
  '#fff2a8', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#ffe599', '#f9cb9c', '#b6d7a8', '#a2c4c9', '#9fc5e8', '#b4a7d6', '#ffff00',
  '#00ff00', '#00ffff', '#ff00ff'
]

// Small inline-SVG icon set (kept tiny and dependency-free).
function icon(name) {
  const paths = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
    italic: '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="21" x2="20" y2="21"/>',
    strike: '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/>',
    subscript: '<path d="m4 5 8 8"/><path d="m12 5-8 8"/><path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/>',
    superscript: '<path d="m4 19 8-8"/><path d="m12 19-8-8"/><path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06"/>',
    clear: '<path d="M4 7V5h16v2"/><path d="M9 5 7 19"/><path d="m15 5 1 7"/><line x1="5" y1="21" x2="19" y2="21"/><line x1="14" y1="14" x2="21" y2="21"/>',
    bulletList: '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.4"/><circle cx="4" cy="12" r="1.4"/><circle cx="4" cy="18" r="1.4"/>',
    orderedList: '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 14H4l2 2.5V18H4"/>',
    alignLeft: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>',
    alignCenter: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/>',
    alignRight: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>',
    alignJustify: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    indent: '<polyline points="3 8 7 12 3 16"/><line x1="11" y1="6" x2="21" y2="6"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="11" y1="18" x2="21" y2="18"/>',
    outdent: '<polyline points="7 8 3 12 7 16"/><line x1="11" y1="6" x2="21" y2="6"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="11" y1="18" x2="21" y2="18"/>',
    lineHeight: '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M5 4v16"/><polyline points="3 7 5 4 7 7"/><polyline points="3 17 5 20 7 17"/>',
    newFile: '<path d="M14 3v5h5"/><path d="M5 3h9l5 5v13H5z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    open: '<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z"/><path d="M3 7V5h5l2 2"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="5"/>',
    saveAs: '<path d="M5 3h9l3 3v8"/><path d="M5 3v18h7"/><path d="M8 3v5h6"/><circle cx="18" cy="18" r="3"/><line x1="18" y1="16.5" x2="18" y2="19.5"/><line x1="16.5" y1="18" x2="19.5" y2="18"/>',
    find: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    unlink: '<path d="M18.84 12.25 21 10.07a5 5 0 0 0-7.07-7.07l-2.18 2.16"/><path d="M5.16 11.75 3 13.93a5 5 0 0 0 7.07 7.07l2.18-2.16"/><line x1="2" y1="2" x2="22" y2="22"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    hr: '<line x1="3" y1="12" x2="21" y2="12"/>',
    quote: '<path d="M7 7H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v3a1 1 0 0 1-1 1H4"/><path d="M17 7h-3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v3a1 1 0 0 1-1 1h-1"/>',
    date: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>',
    outline: '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="16" y2="18"/><line x1="4" y1="6" x2="5" y2="6"/><line x1="4" y1="12" x2="5" y2="12"/><line x1="4" y1="18" x2="5" y2="18"/>',
    focus: '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M20 8V5a1 1 0 0 0-1-1h-3"/><path d="M4 16v3a1 1 0 0 0 1 1h3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><circle cx="12" cy="12" r="2.5"/>'
  }
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else if (k === 'title') node.title = v
    else if (k.startsWith('data-')) node.setAttribute(k, v)
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c == null) continue
    node.append(c.nodeType ? c : document.createTextNode(c))
  }
  return node
}

function makeButton({ name, iconName, title, label, onClick }) {
  const btn = el('button', {
    type: 'button',
    class: 'tb-btn',
    title: title || label || name,
    'data-name': name || ''
  })
  if (iconName) btn.innerHTML = icon(iconName)
  else if (label) btn.textContent = label
  btn.addEventListener('mousedown', (e) => e.preventDefault()) // keep editor focus
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    onClick(e)
  })
  return btn
}

function makeSep() {
  return el('span', { class: 'tb-sep', 'aria-hidden': 'true' })
}

function makeGroup() {
  return el('div', { class: 'tb-group' })
}

// A reusable color-swatch popup button.
function makeColorControl({ label, title, colors, swatchVarClass, onPick, onClear }) {
  const wrap = el('div', { class: 'tb-color' })
  const trigger = el('button', {
    type: 'button',
    class: `tb-btn tb-color-trigger ${swatchVarClass}`,
    title
  })
  trigger.innerHTML = `<span class="tb-color-label">${label}</span><span class="tb-color-bar"></span><span class="tb-caret">▾</span>`
  const pop = el('div', { class: 'tb-popup tb-color-popup', role: 'menu' })

  const grid = el('div', { class: 'tb-swatch-grid' })
  for (const c of colors) {
    const sw = el('button', {
      type: 'button',
      class: 'tb-swatch',
      title: c,
      style: `background:${c}`
    })
    sw.addEventListener('mousedown', (e) => e.preventDefault())
    sw.addEventListener('click', () => {
      onPick(c)
      pop.classList.remove('open')
    })
    grid.append(sw)
  }
  pop.append(grid)

  const custom = el('div', { class: 'tb-color-custom' })
  const input = el('input', { type: 'color', class: 'tb-color-input', value: '#000000' })
  input.addEventListener('input', () => onPick(input.value))
  const clearBtn = el('button', { type: 'button', class: 'tb-color-clear' }, 'Clear')
  clearBtn.addEventListener('mousedown', (e) => e.preventDefault())
  clearBtn.addEventListener('click', () => {
    onClear()
    pop.classList.remove('open')
  })
  custom.append(input, clearBtn)
  pop.append(custom)

  trigger.addEventListener('mousedown', (e) => e.preventDefault())
  trigger.addEventListener('click', (e) => {
    e.preventDefault()
    // close any other open popups
    document.querySelectorAll('.tb-popup.open').forEach((p) => {
      if (p !== pop) p.classList.remove('open')
    })
    pop.classList.toggle('open')
  })

  wrap.append(trigger, pop)
  return { wrap, trigger, pop }
}

// A generic icon-triggered dropdown menu (used for the Table menu).
function makeDropdown({ iconName, title, items }) {
  const wrap = el('div', { class: 'tb-color' })
  const trigger = el('button', { type: 'button', class: 'tb-btn tb-dropdown-trigger', title })
  trigger.innerHTML = `${icon(iconName)}<span class="tb-caret">▾</span>`
  const pop = el('div', { class: 'tb-popup tb-dropdown-popup', role: 'menu' })

  for (const item of items) {
    if (item.separator) {
      pop.append(el('div', { class: 'tb-menu-sep' }))
      continue
    }
    const mi = el('button', { type: 'button', class: 'tb-menu-item' }, item.label)
    mi.addEventListener('mousedown', (e) => e.preventDefault())
    mi.addEventListener('click', () => {
      item.onClick()
      pop.classList.remove('open')
    })
    pop.append(mi)
  }

  trigger.addEventListener('mousedown', (e) => e.preventDefault())
  trigger.addEventListener('click', (e) => {
    e.preventDefault()
    document.querySelectorAll('.tb-popup.open').forEach((p) => {
      if (p !== pop) p.classList.remove('open')
    })
    pop.classList.toggle('open')
  })

  wrap.append(trigger, pop)
  return { wrap, trigger, pop }
}

function makeSelect({ title, options, onChange, className }) {
  const sel = el('select', { class: `tb-select ${className || ''}`, title })
  for (const opt of options) {
    const o = el('option', { value: opt.value }, opt.label)
    sel.append(o)
  }
  sel.addEventListener('mousedown', (e) => e.stopPropagation())
  sel.addEventListener('change', () => onChange(sel.value))
  return sel
}

/**
 * Build the toolbar into `container`, wiring all controls to `editor` and to the
 * file-action callbacks.
 *
 * @param {HTMLElement} container
 * @param {import('@tiptap/core').Editor} editor
 * @param {Object} actions - { onNew, onOpen, onSave, onSaveAs }
 * @returns {{ refresh: () => void }}
 */
export function buildToolbar(container, editor, actions = {}) {
  container.innerHTML = ''
  container.classList.add('toolbar')

  // --- File group -----------------------------------------------------------
  const fileGroup = makeGroup()
  fileGroup.append(
    makeButton({ name: 'new', iconName: 'newFile', title: 'New (Ctrl+N)', onClick: () => actions.onNew?.() }),
    makeButton({ name: 'open', iconName: 'open', title: 'Open (Ctrl+O)', onClick: () => actions.onOpen?.() }),
    makeButton({ name: 'save', iconName: 'save', title: 'Save (Ctrl+S)', onClick: () => actions.onSave?.() }),
    makeButton({ name: 'save-as', iconName: 'saveAs', title: 'Save As (Ctrl+Shift+S)', onClick: () => actions.onSaveAs?.() })
  )

  // --- Undo / Redo ----------------------------------------------------------
  const histGroup = makeGroup()
  const undoBtn = makeButton({ name: 'undo', iconName: 'undo', title: 'Undo (Ctrl+Z)', onClick: () => editor.chain().focus().undo().run() })
  const redoBtn = makeButton({ name: 'redo', iconName: 'redo', title: 'Redo (Ctrl+Y)', onClick: () => editor.chain().focus().redo().run() })
  histGroup.append(undoBtn, redoBtn)

  // --- Paragraph / heading style --------------------------------------------
  const styleGroup = makeGroup()
  const styleSelect = makeSelect({
    title: 'Paragraph style',
    className: 'tb-style-select',
    options: [
      { label: 'Normal text', value: 'paragraph' },
      { label: 'Heading 1', value: 'h1' },
      { label: 'Heading 2', value: 'h2' },
      { label: 'Heading 3', value: 'h3' }
    ],
    onChange: (val) => {
      if (val === 'paragraph') editor.chain().focus().setParagraph().run()
      else {
        const level = Number(val.slice(1))
        editor.chain().focus().toggleHeading({ level }).run()
      }
    }
  })
  styleGroup.append(styleSelect)

  // --- Font family ----------------------------------------------------------
  const fontGroup = makeGroup()
  const fontSelect = makeSelect({
    title: 'Font',
    className: 'tb-font-select',
    options: FONT_FAMILIES,
    onChange: (val) => {
      if (!val) editor.chain().focus().unsetFontFamily().run()
      else editor.chain().focus().setFontFamily(val).run()
    }
  })
  fontGroup.append(fontSelect)

  // --- Font size ------------------------------------------------------------
  const sizeGroup = makeGroup()
  const sizeSelect = makeSelect({
    title: 'Font size',
    className: 'tb-size-select',
    options: [{ label: 'Size', value: '' }, ...FONT_SIZES.map((s) => ({ label: s, value: s }))],
    onChange: (val) => {
      if (!val) editor.chain().focus().unsetFontSize().run()
      else editor.chain().focus().setFontSize(`${val}pt`).run()
    }
  })
  sizeGroup.append(sizeSelect)

  // --- Inline marks ---------------------------------------------------------
  const markGroup = makeGroup()
  const boldBtn = makeButton({ name: 'bold', iconName: 'bold', title: 'Bold (Ctrl+B)', onClick: () => editor.chain().focus().toggleBold().run() })
  const italicBtn = makeButton({ name: 'italic', iconName: 'italic', title: 'Italic (Ctrl+I)', onClick: () => editor.chain().focus().toggleItalic().run() })
  const underlineBtn = makeButton({ name: 'underline', iconName: 'underline', title: 'Underline (Ctrl+U)', onClick: () => editor.chain().focus().toggleUnderline().run() })
  const strikeBtn = makeButton({ name: 'strike', iconName: 'strike', title: 'Strikethrough', onClick: () => editor.chain().focus().toggleStrike().run() })
  markGroup.append(boldBtn, italicBtn, underlineBtn, strikeBtn)

  // --- Colors ---------------------------------------------------------------
  const colorGroup = makeGroup()
  const textColor = makeColorControl({
    label: 'A',
    title: 'Text color',
    colors: TEXT_COLORS,
    swatchVarClass: 'tb-color-text',
    onPick: (c) => editor.chain().focus().setColor(c).run(),
    onClear: () => editor.chain().focus().unsetColor().run()
  })
  const highlightColor = makeColorControl({
    label: '✎',
    title: 'Highlight color',
    colors: HIGHLIGHT_COLORS,
    swatchVarClass: 'tb-color-highlight',
    onPick: (c) => editor.chain().focus().toggleHighlight({ color: c }).run(),
    onClear: () => editor.chain().focus().unsetHighlight().run()
  })
  colorGroup.append(textColor.wrap, highlightColor.wrap)

  // --- Sub/superscript + clear ----------------------------------------------
  const scriptGroup = makeGroup()
  const subBtn = makeButton({ name: 'subscript', iconName: 'subscript', title: 'Subscript', onClick: () => editor.chain().focus().toggleSubscript().run() })
  const superBtn = makeButton({ name: 'superscript', iconName: 'superscript', title: 'Superscript', onClick: () => editor.chain().focus().toggleSuperscript().run() })
  const clearBtn = makeButton({
    name: 'clear',
    iconName: 'clear',
    title: 'Clear formatting',
    onClick: () => editor.chain().focus().unsetAllMarks().clearNodes().run()
  })
  scriptGroup.append(subBtn, superBtn, clearBtn)

  // --- Lists ----------------------------------------------------------------
  const listGroup = makeGroup()
  const bulletBtn = makeButton({ name: 'bulletList', iconName: 'bulletList', title: 'Bullet list', onClick: () => editor.chain().focus().toggleBulletList().run() })
  const orderedBtn = makeButton({ name: 'orderedList', iconName: 'orderedList', title: 'Numbered list', onClick: () => editor.chain().focus().toggleOrderedList().run() })
  listGroup.append(bulletBtn, orderedBtn)

  // --- Alignment ------------------------------------------------------------
  const alignGroup = makeGroup()
  const alignLeftBtn = makeButton({ name: 'align-left', iconName: 'alignLeft', title: 'Align left', onClick: () => editor.chain().focus().setTextAlign('left').run() })
  const alignCenterBtn = makeButton({ name: 'align-center', iconName: 'alignCenter', title: 'Align center', onClick: () => editor.chain().focus().setTextAlign('center').run() })
  const alignRightBtn = makeButton({ name: 'align-right', iconName: 'alignRight', title: 'Align right', onClick: () => editor.chain().focus().setTextAlign('right').run() })
  const alignJustifyBtn = makeButton({ name: 'align-justify', iconName: 'alignJustify', title: 'Justify', onClick: () => editor.chain().focus().setTextAlign('justify').run() })
  alignGroup.append(alignLeftBtn, alignCenterBtn, alignRightBtn, alignJustifyBtn)

  // --- Line spacing ---------------------------------------------------------
  const spacingGroup = makeGroup()
  const lineHeightWrap = el('div', { class: 'tb-color' })
  const lhTrigger = el('button', { type: 'button', class: 'tb-btn tb-lh-trigger', title: 'Line spacing' })
  lhTrigger.innerHTML = `${icon('lineHeight')}<span class="tb-caret">▾</span>`
  const lhPop = el('div', { class: 'tb-popup tb-lh-popup', role: 'menu' })
  for (const lh of LINE_HEIGHTS) {
    const item = el('button', { type: 'button', class: 'tb-menu-item' }, lh.label)
    item.addEventListener('mousedown', (e) => e.preventDefault())
    item.addEventListener('click', () => {
      editor.chain().focus().setLineHeight(lh.value).run()
      lhPop.classList.remove('open')
    })
    lhPop.append(item)
  }
  const lhClear = el('button', { type: 'button', class: 'tb-menu-item tb-menu-clear' }, 'Reset')
  lhClear.addEventListener('mousedown', (e) => e.preventDefault())
  lhClear.addEventListener('click', () => {
    editor.chain().focus().unsetLineHeight().run()
    lhPop.classList.remove('open')
  })
  lhPop.append(lhClear)
  lhTrigger.addEventListener('mousedown', (e) => e.preventDefault())
  lhTrigger.addEventListener('click', (e) => {
    e.preventDefault()
    document.querySelectorAll('.tb-popup.open').forEach((p) => {
      if (p !== lhPop) p.classList.remove('open')
    })
    lhPop.classList.toggle('open')
  })
  lineHeightWrap.append(lhTrigger, lhPop)
  spacingGroup.append(lineHeightWrap)

  // --- Indent / outdent -----------------------------------------------------
  const indentGroup = makeGroup()
  // Indent/outdent: use list sink/lift when in a list, otherwise nudge the
  // block's left margin via a textStyle-free inline style on the node.
  const indentBtn = makeButton({
    name: 'indent',
    iconName: 'indent',
    title: 'Increase indent',
    onClick: () => applyIndent(editor, +1)
  })
  const outdentBtn = makeButton({
    name: 'outdent',
    iconName: 'outdent',
    title: 'Decrease indent',
    onClick: () => applyIndent(editor, -1)
  })
  indentGroup.append(indentBtn, outdentBtn)

  // --- Blocks: blockquote + horizontal rule ---------------------------------
  const blockGroup = makeGroup()
  const quoteBtn = makeButton({
    name: 'blockquote',
    iconName: 'quote',
    title: 'Blockquote',
    onClick: () => editor.chain().focus().toggleBlockquote().run()
  })
  const hrBtn = makeButton({
    name: 'hr',
    iconName: 'hr',
    title: 'Horizontal rule',
    onClick: () => editor.chain().focus().setHorizontalRule().run()
  })
  blockGroup.append(quoteBtn, hrBtn)

  // --- Insert: table dropdown + image + link --------------------------------
  const insertGroup = makeGroup()

  const tableMenu = makeDropdown({
    iconName: 'table',
    title: 'Table',
    items: [
      { label: 'Insert table (3×3)', onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { separator: true },
      { label: 'Add row above', onClick: () => editor.chain().focus().addRowBefore().run() },
      { label: 'Add row below', onClick: () => editor.chain().focus().addRowAfter().run() },
      { label: 'Add column left', onClick: () => editor.chain().focus().addColumnBefore().run() },
      { label: 'Add column right', onClick: () => editor.chain().focus().addColumnAfter().run() },
      { separator: true },
      { label: 'Delete row', onClick: () => editor.chain().focus().deleteRow().run() },
      { label: 'Delete column', onClick: () => editor.chain().focus().deleteColumn().run() },
      { label: 'Toggle header row', onClick: () => editor.chain().focus().toggleHeaderRow().run() },
      { separator: true },
      { label: 'Delete table', onClick: () => editor.chain().focus().deleteTable().run() }
    ]
  })

  const imageBtn = makeButton({
    name: 'image',
    iconName: 'image',
    title: 'Insert image',
    onClick: () => actions.onImage?.()
  })
  const linkBtn = makeButton({
    name: 'link',
    iconName: 'link',
    title: 'Insert/edit link',
    onClick: () => actions.onLink?.()
  })
  const unlinkBtn = makeButton({
    name: 'unlink',
    iconName: 'unlink',
    title: 'Remove link',
    onClick: () => actions.onUnlink?.()
  })
  const dateBtn = makeButton({
    name: 'insert-date',
    iconName: 'date',
    title: 'Insert date',
    onClick: () => actions.onInsertDate?.()
  })
  insertGroup.append(tableMenu.wrap, imageBtn, linkBtn, unlinkBtn, dateBtn)

  // --- Tools: find + print --------------------------------------------------
  const toolsGroup = makeGroup()
  const findBtn = makeButton({
    name: 'find',
    iconName: 'find',
    title: 'Find & replace (Ctrl+F)',
    onClick: () => actions.onFind?.()
  })
  const printBtn = makeButton({
    name: 'print',
    iconName: 'print',
    title: 'Print (Ctrl+P)',
    onClick: () => actions.onPrint?.()
  })
  toolsGroup.append(findBtn, printBtn)

  // --- View: outline + focus + dark-mode toggles ----------------------------
  const viewGroup = makeGroup()
  const outlineBtn = makeButton({
    name: 'outline',
    iconName: 'outline',
    title: 'Toggle document outline',
    onClick: () => actions.onToggleOutline?.()
  })
  const focusBtn = makeButton({
    name: 'focus',
    iconName: 'focus',
    title: 'Focus / distraction-free mode (Ctrl+Shift+F)',
    onClick: () => actions.onToggleFocus?.()
  })
  const themeBtn = makeButton({
    name: 'theme',
    iconName: 'moon',
    title: 'Toggle dark mode',
    onClick: () => actions.onToggleTheme?.()
  })
  viewGroup.append(outlineBtn, focusBtn, themeBtn)

  // Assemble.
  container.append(
    fileGroup, makeSep(),
    histGroup, makeSep(),
    styleGroup, fontGroup, sizeGroup, makeSep(),
    markGroup, makeSep(),
    colorGroup, makeSep(),
    scriptGroup, makeSep(),
    listGroup, alignGroup, makeSep(),
    spacingGroup, indentGroup, makeSep(),
    blockGroup, makeSep(),
    insertGroup, makeSep(),
    toolsGroup, makeSep(),
    viewGroup
  )

  // Close popups when clicking elsewhere.
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.tb-color') && !e.target.closest('.tb-popup')) {
      document.querySelectorAll('.tb-popup.open').forEach((p) => p.classList.remove('open'))
    }
  })

  // --- Active-state refresh -------------------------------------------------
  function setActive(btn, active) {
    btn.classList.toggle('is-active', !!active)
    btn.setAttribute('aria-pressed', String(!!active))
  }
  function setDisabled(btn, disabled) {
    btn.disabled = !!disabled
    btn.classList.toggle('is-disabled', !!disabled)
  }

  function refresh() {
    if (!editor) return
    setActive(boldBtn, editor.isActive('bold'))
    setActive(italicBtn, editor.isActive('italic'))
    setActive(underlineBtn, editor.isActive('underline'))
    setActive(strikeBtn, editor.isActive('strike'))
    setActive(subBtn, editor.isActive('subscript'))
    setActive(superBtn, editor.isActive('superscript'))
    setActive(bulletBtn, editor.isActive('bulletList'))
    setActive(orderedBtn, editor.isActive('orderedList'))
    setActive(alignLeftBtn, editor.isActive({ textAlign: 'left' }))
    setActive(alignCenterBtn, editor.isActive({ textAlign: 'center' }))
    setActive(alignRightBtn, editor.isActive({ textAlign: 'right' }))
    setActive(alignJustifyBtn, editor.isActive({ textAlign: 'justify' }))
    setActive(quoteBtn, editor.isActive('blockquote'))
    setActive(linkBtn, editor.isActive('link'))

    setDisabled(undoBtn, !editor.can().undo())
    setDisabled(redoBtn, !editor.can().redo())

    // Style dropdown reflects current block.
    if (editor.isActive('heading', { level: 1 })) styleSelect.value = 'h1'
    else if (editor.isActive('heading', { level: 2 })) styleSelect.value = 'h2'
    else if (editor.isActive('heading', { level: 3 })) styleSelect.value = 'h3'
    else styleSelect.value = 'paragraph'

    // Font family dropdown reflects current mark.
    const currentFont = editor.getAttributes('textStyle').fontFamily || ''
    const matchFont = FONT_FAMILIES.find((f) => f.value === currentFont)
    fontSelect.value = matchFont ? matchFont.value : ''

    // Font size dropdown reflects current mark (strip 'pt'/'px').
    const rawSize = editor.getAttributes('textStyle').fontSize || ''
    const numSize = rawSize.replace(/p[tx]$/i, '')
    sizeSelect.value = FONT_SIZES.includes(numSize) ? numSize : ''
  }

  // Reflect dark-mode active state on the theme button (icon + pressed state).
  function setDarkActive(dark) {
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon')
    themeBtn.classList.toggle('is-active', !!dark)
    themeBtn.setAttribute('aria-pressed', String(!!dark))
    themeBtn.title = dark ? 'Switch to light mode' : 'Switch to dark mode'
  }

  // Reflect outline-panel / focus-mode active state on their toggle buttons.
  function setOutlineActive(active) {
    outlineBtn.classList.toggle('is-active', !!active)
    outlineBtn.setAttribute('aria-pressed', String(!!active))
  }
  function setFocusActive(active) {
    focusBtn.classList.toggle('is-active', !!active)
    focusBtn.setAttribute('aria-pressed', String(!!active))
  }

  refresh()
  return { refresh, setDarkActive, setOutlineActive, setFocusActive }
}

// Indentation helper. In lists, sink/lift list items. Outside lists, adjust a
// left-margin style on the current block in ~40px steps (0..200px).
function applyIndent(editor, dir) {
  if (editor.isActive('listItem')) {
    if (dir > 0) editor.chain().focus().sinkListItem('listItem').run()
    else editor.chain().focus().liftListItem('listItem').run()
    return
  }
  const STEP = 40
  const MAX = 200
  const types = ['paragraph', 'heading']
  const activeType = types.find((t) => editor.isActive(t)) || 'paragraph'
  const current = parseInt(editor.getAttributes(activeType).marginLeft || '0', 10) || 0
  let next = current + dir * STEP
  if (next < 0) next = 0
  if (next > MAX) next = MAX
  editor
    .chain()
    .focus()
    .updateAttributes(activeType, { marginLeft: next ? `${next}px` : null })
    .run()
}

export default buildToolbar
