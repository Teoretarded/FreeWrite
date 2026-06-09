// outline.js — collapsible document outline / navigator.
//
// Lists the document's H1–H3 headings in order. Clicking an entry smoothly
// scrolls that heading into view. The list rebuilds (debounced) as headings
// change, and a subtle hint is shown when the document has no headings.
//
// The panel reads heading text straight from the ProseMirror doc (not getHTML),
// so the rebuild stays cheap even on large documents.

const OUTLINE_KEY = 'freewrite-outline'
const LEVELS = [1, 2, 3]

/**
 * Mount the outline panel.
 *
 * @param {HTMLElement} host - the side-panel container element.
 * @param {import('@tiptap/core').Editor} editor
 * @param {HTMLElement} scrollContainer - the scrollable editor area used to
 *        scroll a heading into view.
 * @returns {{
 *   rebuild: () => void,
 *   rebuildDebounced: () => void,
 *   toggle: () => boolean,
 *   setVisible: (v: boolean) => void,
 *   isVisible: () => boolean
 * }}
 */
export function mountOutline(host, editor, scrollContainer) {
  host.classList.add('outline-panel')
  host.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'outline-header'
  header.textContent = 'Outline'

  const list = document.createElement('div')
  list.className = 'outline-list'

  const empty = document.createElement('div')
  empty.className = 'outline-empty'
  empty.textContent = 'No headings yet. Use Heading 1–3 to build an outline.'

  host.append(header, list, empty)

  // Collect headings from the ProseMirror doc with their document positions.
  function collect() {
    const out = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && LEVELS.includes(node.attrs.level)) {
        out.push({ level: node.attrs.level, text: node.textContent || '(empty heading)', pos })
      }
      return true
    })
    return out
  }

  function scrollToPos(pos) {
    // Resolve the heading's DOM node and smoothly scroll it into view inside
    // the editor scroll container. Place the cursor there too for good UX.
    const dom = editor.view.nodeDOM(pos) || editor.view.domAtPos(pos + 1)?.node
    const elNode = dom && dom.nodeType === 1 ? dom : dom?.parentElement
    if (elNode && typeof elNode.scrollIntoView === 'function') {
      elNode.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    editor.chain().setTextSelection(pos + 1).run()
  }

  function rebuild() {
    const headings = collect()
    list.innerHTML = ''
    if (!headings.length) {
      empty.classList.add('show')
      return
    }
    empty.classList.remove('show')
    for (const h of headings) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = `outline-item outline-h${h.level}`
      item.textContent = h.text
      item.title = h.text
      item.addEventListener('mousedown', (e) => e.preventDefault())
      item.addEventListener('click', () => scrollToPos(h.pos))
      list.append(item)
    }
  }

  let rebuildTimer = null
  function rebuildDebounced() {
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(rebuild, 300)
  }

  let visible = false
  function setVisible(v) {
    visible = !!v
    host.classList.toggle('show', visible)
    try {
      localStorage.setItem(OUTLINE_KEY, visible ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (visible) rebuild()
  }
  function toggle() {
    setVisible(!visible)
    return visible
  }
  function isVisible() {
    return visible
  }

  // Restore persisted visibility.
  let persisted = false
  try {
    persisted = localStorage.getItem(OUTLINE_KEY) === '1'
  } catch {
    /* ignore */
  }
  setVisible(persisted)

  return { rebuild, rebuildDebounced, toggle, setVisible, isVisible }
}

export default mountOutline
