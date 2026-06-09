// find.js — Find & Replace for the FreeWrite editor.
//
// Exports:
//   - SearchHighlight: a TipTap extension that paints ProseMirror Decorations
//     over every match (and a distinct style for the "current" match).
//   - mountFind(editor, container): builds the find-bar UI and wires it to the
//     extension, returning { open, close, toggle, isOpen }.
//
// No new npm dependency — uses '@tiptap/pm/*' (ProseMirror) which ships with
// TipTap. The extension stores search state in a plugin and recomputes the
// DecorationSet whenever the doc or the search term changes.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const searchPluginKey = new PluginKey('freewriteSearch')

// Escape a user string so it can be used as a literal RegExp.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Walk the document's text nodes and collect absolute match ranges.
// Returns an array of { from, to }.
function findMatches(doc, term, caseSensitive) {
  const results = []
  if (!term) return results
  let regex
  try {
    regex = new RegExp(escapeRegExp(term), caseSensitive ? 'g' : 'gi')
  } catch {
    return results
  }
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    let m
    regex.lastIndex = 0
    while ((m = regex.exec(text)) !== null) {
      const from = pos + m.index
      const to = from + m[0].length
      results.push({ from, to })
      if (m.index === regex.lastIndex) regex.lastIndex++ // avoid zero-width loop
    }
    return true
  })
  return results
}

function buildDecorations(doc, state) {
  const { term, caseSensitive, currentIndex } = state
  const matches = findMatches(doc, term, caseSensitive)
  const decos = matches.map((r, i) =>
    Decoration.inline(r.from, r.to, {
      class: i === currentIndex ? 'fw-search-match fw-search-current' : 'fw-search-match'
    })
  )
  return { matches, decoSet: DecorationSet.create(doc, decos) }
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addOptions() {
    return { onMatchesChange: null }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return {
              term: '',
              caseSensitive: false,
              currentIndex: 0,
              matches: [],
              decoSet: DecorationSet.empty
            }
          },
          apply(tr, prev) {
            const meta = tr.getMeta(searchPluginKey)
            let next = prev
            if (meta) {
              next = {
                ...prev,
                term: meta.term !== undefined ? meta.term : prev.term,
                caseSensitive:
                  meta.caseSensitive !== undefined ? meta.caseSensitive : prev.caseSensitive,
                currentIndex:
                  meta.currentIndex !== undefined ? meta.currentIndex : prev.currentIndex
              }
            }
            // Recompute matches/decorations when the doc changed or search input changed.
            if (meta || tr.docChanged) {
              const built = buildDecorations(tr.doc, next)
              let currentIndex = next.currentIndex
              if (built.matches.length === 0) currentIndex = 0
              else if (currentIndex >= built.matches.length) currentIndex = 0
              const rebuilt =
                currentIndex !== next.currentIndex
                  ? buildDecorations(tr.doc, { ...next, currentIndex })
                  : built
              next = {
                ...next,
                currentIndex,
                matches: rebuilt.matches,
                decoSet: rebuilt.decoSet
              }
              if (typeof extension.options.onMatchesChange === 'function') {
                // Defer so listeners can read view state safely.
                const total = next.matches.length
                const idx = total ? currentIndex : -1
                Promise.resolve().then(() =>
                  extension.options.onMatchesChange({ total, index: idx })
                )
              }
            }
            return next
          }
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state).decoSet
          }
        }
      })
    ]
  }
})

// Imperative helpers operating on an editor instance --------------------------

function getSearchState(editor) {
  return searchPluginKey.getState(editor.state)
}

function setSearch(editor, { term, caseSensitive, currentIndex }) {
  const meta = {}
  if (term !== undefined) meta.term = term
  if (caseSensitive !== undefined) meta.caseSensitive = caseSensitive
  if (currentIndex !== undefined) meta.currentIndex = currentIndex
  const tr = editor.state.tr.setMeta(searchPluginKey, meta)
  editor.view.dispatch(tr)
}

function scrollCurrentIntoView(editor) {
  const st = getSearchState(editor)
  const m = st.matches[st.currentIndex]
  if (!m) return
  // Scroll the DOM node containing the current match into view. We deliberately
  // do NOT move the editor selection, so focus can stay in the find input.
  const { view } = editor
  let dom
  try {
    dom = view.domAtPos(m.from)
  } catch {
    return
  }
  if (dom && dom.node) {
    const elNode = dom.node.nodeType === 3 ? dom.node.parentElement : dom.node
    if (elNode && elNode.scrollIntoView) {
      elNode.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
}

/**
 * Mount the find/replace bar UI into `container` and wire it to `editor`.
 * @param {import('@tiptap/core').Editor} editor
 * @param {HTMLElement} container
 */
export function mountFind(editor, container) {
  const bar = document.createElement('div')
  bar.className = 'fw-findbar'
  bar.setAttribute('role', 'search')
  bar.innerHTML = `
    <div class="fw-find-row">
      <input type="text" class="fw-find-input" placeholder="Find" aria-label="Find" />
      <span class="fw-find-count" aria-live="polite">0/0</span>
      <button type="button" class="fw-find-btn fw-find-prev" title="Previous (Shift+Enter)" aria-label="Previous match">▲</button>
      <button type="button" class="fw-find-btn fw-find-next" title="Next (Enter)" aria-label="Next match">▼</button>
      <button type="button" class="fw-find-btn fw-find-case" title="Match case" aria-label="Match case" aria-pressed="false">Aa</button>
      <button type="button" class="fw-find-btn fw-find-toggle-replace" title="Toggle replace" aria-label="Toggle replace">⇅</button>
      <button type="button" class="fw-find-btn fw-find-close" title="Close (Esc)" aria-label="Close find">✕</button>
    </div>
    <div class="fw-find-row fw-replace-row">
      <input type="text" class="fw-replace-input" placeholder="Replace with" aria-label="Replace with" />
      <button type="button" class="fw-find-btn fw-replace-one">Replace</button>
      <button type="button" class="fw-find-btn fw-replace-all">All</button>
    </div>
  `
  container.append(bar)

  const findInput = bar.querySelector('.fw-find-input')
  const replaceInput = bar.querySelector('.fw-replace-input')
  const countEl = bar.querySelector('.fw-find-count')
  const prevBtn = bar.querySelector('.fw-find-prev')
  const nextBtn = bar.querySelector('.fw-find-next')
  const caseBtn = bar.querySelector('.fw-find-case')
  const toggleReplaceBtn = bar.querySelector('.fw-find-toggle-replace')
  const closeBtn = bar.querySelector('.fw-find-close')
  const replaceOneBtn = bar.querySelector('.fw-replace-one')
  const replaceAllBtn = bar.querySelector('.fw-replace-all')
  const replaceRow = bar.querySelector('.fw-replace-row')

  let caseSensitive = false
  let isOpen = false
  let replaceVisible = false

  function updateCount() {
    const st = getSearchState(editor)
    const total = st.matches.length
    const idx = total ? st.currentIndex + 1 : 0
    countEl.textContent = `${idx}/${total}`
  }

  function refreshTerm() {
    setSearch(editor, { term: findInput.value, caseSensitive, currentIndex: 0 })
    updateCount()
    if (findInput.value) scrollCurrentIntoView(editor)
  }

  function step(dir) {
    const st = getSearchState(editor)
    const total = st.matches.length
    if (!total) return
    let idx = st.currentIndex + dir
    if (idx < 0) idx = total - 1
    if (idx >= total) idx = 0
    setSearch(editor, { currentIndex: idx })
    updateCount()
    scrollCurrentIntoView(editor)
  }

  function replaceCurrent() {
    const st = getSearchState(editor)
    const m = st.matches[st.currentIndex]
    if (!m) return
    const replacement = replaceInput.value
    editor
      .chain()
      .focus()
      .insertContentAt({ from: m.from, to: m.to }, replacement)
      .run()
    // After replacement the doc changed; keep the same index (now pointing to
    // the next match in document order) and re-scroll.
    setSearch(editor, { currentIndex: st.currentIndex })
    updateCount()
    scrollCurrentIntoView(editor)
  }

  function replaceAll() {
    const st = getSearchState(editor)
    if (!st.matches.length) return
    // Replace from the end backwards so earlier offsets stay valid.
    const matches = [...st.matches].sort((a, b) => b.from - a.from)
    const replacement = replaceInput.value
    let chain = editor.chain().focus()
    for (const m of matches) {
      chain = chain.insertContentAt({ from: m.from, to: m.to }, replacement)
    }
    chain.run()
    setSearch(editor, { currentIndex: 0 })
    updateCount()
  }

  function showReplace(show) {
    replaceVisible = show
    replaceRow.style.display = show ? 'flex' : 'none'
    toggleReplaceBtn.setAttribute('aria-pressed', String(show))
  }

  function open({ replace = false } = {}) {
    isOpen = true
    bar.classList.add('open')
    showReplace(replace)
    // Seed with current selection text if any.
    const { from, to } = editor.state.selection
    if (from !== to) {
      const sel = editor.state.doc.textBetween(from, to, ' ')
      if (sel && sel.length < 200) findInput.value = sel
    }
    refreshTerm()
    findInput.focus()
    findInput.select()
  }

  function close() {
    isOpen = false
    bar.classList.remove('open')
    setSearch(editor, { term: '', currentIndex: 0 })
    editor.commands.focus()
  }

  function toggle(opts) {
    if (isOpen) close()
    else open(opts)
  }

  // Wire events ---------------------------------------------------------------
  findInput.addEventListener('input', refreshTerm)
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      replaceCurrent()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  prevBtn.addEventListener('click', () => step(-1))
  nextBtn.addEventListener('click', () => step(1))
  caseBtn.addEventListener('click', () => {
    caseSensitive = !caseSensitive
    caseBtn.classList.toggle('is-active', caseSensitive)
    caseBtn.setAttribute('aria-pressed', String(caseSensitive))
    refreshTerm()
  })
  toggleReplaceBtn.addEventListener('click', () => showReplace(!replaceVisible))
  closeBtn.addEventListener('click', close)
  replaceOneBtn.addEventListener('click', replaceCurrent)
  replaceAllBtn.addEventListener('click', replaceAll)

  // Keep the count fresh when the doc changes underneath us (typing/undo).
  editor.on('update', () => {
    if (isOpen) updateCount()
  })

  showReplace(false)

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen
  }
}

export default { SearchHighlight, mountFind }
