// statusbar.js — live word/character count and a saved/unsaved indicator.

function countWords(text) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  // Split on any run of whitespace.
  return trimmed.split(/\s+/).length
}

/**
 * Build the status bar inside `container`.
 *
 * @param {HTMLElement} container
 * @returns {{
 *   update: (editor: import('@tiptap/core').Editor) => void,
 *   setSaved: (saved: boolean) => void
 * }}
 */
export function buildStatusbar(container) {
  container.innerHTML = ''
  container.classList.add('statusbar')

  const left = document.createElement('div')
  left.className = 'sb-left'

  const wordEl = document.createElement('span')
  wordEl.className = 'sb-item sb-words'
  wordEl.textContent = '0 words'

  const charEl = document.createElement('span')
  charEl.className = 'sb-item sb-chars'
  charEl.textContent = '0 characters'

  left.append(wordEl, charEl)

  const right = document.createElement('div')
  right.className = 'sb-right'

  const savedEl = document.createElement('span')
  savedEl.className = 'sb-item sb-saved is-saved'
  savedEl.innerHTML = '<span class="sb-dot"></span><span class="sb-saved-text">Saved</span>'

  right.append(savedEl)

  container.append(left, right)

  function update(editor) {
    if (!editor) return
    const text = editor.getText()
    const words = countWords(text)
    const chars = text.length
    wordEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`
    charEl.textContent = `${chars} ${chars === 1 ? 'character' : 'characters'}`
  }

  function setSaved(saved) {
    savedEl.classList.toggle('is-saved', saved)
    savedEl.classList.toggle('is-unsaved', !saved)
    const txt = savedEl.querySelector('.sb-saved-text')
    if (txt) txt.textContent = saved ? 'Saved' : 'Unsaved changes'
  }

  setSaved(true)

  return { update, setSaved }
}

export default buildStatusbar
