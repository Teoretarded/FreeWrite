// statusbar.js — live word/character count, selection count, reading-time
// estimate, a saved/unsaved indicator, the current file name, and a zoom
// control.

function countWords(text) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  // Split on any run of whitespace.
  return trimmed.split(/\s+/).length
}

function readingTime(words) {
  // ~200 wpm.
  const mins = words / 200
  if (words === 0) return '0 min read'
  if (mins < 1) return '<1 min read'
  return `${Math.round(mins)} min read`
}

/**
 * Build the status bar inside `container`.
 *
 * @param {HTMLElement} container
 * @param {Object} [opts]
 * @param {number[]} [opts.zoomLevels]
 * @param {() => void} [opts.onZoomIn]
 * @param {() => void} [opts.onZoomOut]
 * @param {(pct:number) => void} [opts.onZoomSet]
 * @returns {{
 *   update: (editor: import('@tiptap/core').Editor) => void,
 *   updateDebounced: (editor: import('@tiptap/core').Editor) => void,
 *   setSaved: (saved: boolean) => void,
 *   setFile: (name: string) => void,
 *   setZoom: (pct: number) => void
 * }}
 */
export function buildStatusbar(container, opts = {}) {
  container.innerHTML = ''
  container.classList.add('statusbar')

  const zoomLevels = opts.zoomLevels || [50, 75, 90, 100, 110, 125, 150, 175, 200]

  const left = document.createElement('div')
  left.className = 'sb-left'

  const wordEl = document.createElement('span')
  wordEl.className = 'sb-item sb-words'
  wordEl.textContent = '0 words'

  const charEl = document.createElement('span')
  charEl.className = 'sb-item sb-chars'
  charEl.textContent = '0 characters'

  const readEl = document.createElement('span')
  readEl.className = 'sb-item sb-read'
  readEl.textContent = '0 min read'

  left.append(wordEl, charEl, readEl)

  const right = document.createElement('div')
  right.className = 'sb-right'

  // File name.
  const fileEl = document.createElement('span')
  fileEl.className = 'sb-item sb-file'
  fileEl.textContent = 'Untitled'

  // Zoom control.
  const zoomWrap = document.createElement('span')
  zoomWrap.className = 'sb-item sb-zoom'

  const zoomOut = document.createElement('button')
  zoomOut.type = 'button'
  zoomOut.className = 'sb-zoom-btn'
  zoomOut.title = 'Zoom out'
  zoomOut.textContent = '−'

  const zoomSelect = document.createElement('select')
  zoomSelect.className = 'sb-zoom-select'
  zoomSelect.title = 'Zoom level'
  for (const z of zoomLevels) {
    const o = document.createElement('option')
    o.value = String(z)
    o.textContent = `${z}%`
    zoomSelect.append(o)
  }

  const zoomIn = document.createElement('button')
  zoomIn.type = 'button'
  zoomIn.className = 'sb-zoom-btn'
  zoomIn.title = 'Zoom in'
  zoomIn.textContent = '+'

  zoomOut.addEventListener('click', () => opts.onZoomOut && opts.onZoomOut())
  zoomIn.addEventListener('click', () => opts.onZoomIn && opts.onZoomIn())
  zoomSelect.addEventListener('change', () => {
    const pct = parseInt(zoomSelect.value, 10)
    if (opts.onZoomSet && !Number.isNaN(pct)) opts.onZoomSet(pct)
  })

  zoomWrap.append(zoomOut, zoomSelect, zoomIn)

  // Saved indicator.
  const savedEl = document.createElement('span')
  savedEl.className = 'sb-item sb-saved is-saved'
  savedEl.innerHTML = '<span class="sb-dot"></span><span class="sb-saved-text">Saved</span>'

  right.append(fileEl, zoomWrap, savedEl)

  container.append(left, right)

  function update(editor) {
    if (!editor) return
    const text = editor.getText()
    const totalWords = countWords(text)
    const totalChars = text.length

    const { from, to } = editor.state.selection
    if (from !== to) {
      const selText = editor.state.doc.textBetween(from, to, ' ', ' ')
      const selWords = countWords(selText)
      wordEl.textContent = `${selWords} of ${totalWords} ${totalWords === 1 ? 'word' : 'words'} selected`
      charEl.textContent = `${selText.length} of ${totalChars} characters`
    } else {
      wordEl.textContent = `${totalWords} ${totalWords === 1 ? 'word' : 'words'}`
      charEl.textContent = `${totalChars} ${totalChars === 1 ? 'character' : 'characters'}`
    }
    readEl.textContent = readingTime(totalWords)
  }

  // Debounced variant for the hot typing path: recomputing word/char/reading
  // counts on every keystroke is wasteful on large documents, so coalesce to
  // ~220ms. Selection changes go through here too — a slight delay on the
  // "N of M words selected" readout is imperceptible and keeps typing snappy.
  let updateTimer = null
  function updateDebounced(editor) {
    clearTimeout(updateTimer)
    updateTimer = setTimeout(() => update(editor), 220)
  }

  function setSaved(saved) {
    savedEl.classList.toggle('is-saved', saved)
    savedEl.classList.toggle('is-unsaved', !saved)
    const txt = savedEl.querySelector('.sb-saved-text')
    if (txt) txt.textContent = saved ? 'Saved' : 'Unsaved changes'
  }

  function setFile(name) {
    fileEl.textContent = name || 'Untitled'
  }

  function setZoom(pct) {
    // Reflect the active zoom in the select; if it's an off-list value, add it.
    const val = String(pct)
    if (![...zoomSelect.options].some((o) => o.value === val)) {
      const o = document.createElement('option')
      o.value = val
      o.textContent = `${pct}%`
      zoomSelect.append(o)
    }
    zoomSelect.value = val
  }

  setSaved(true)

  return { update, updateDebounced, setSaved, setFile, setZoom }
}

export default buildStatusbar
