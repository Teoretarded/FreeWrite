// pagination.js — on-screen page pagination for the FreeWrite editor.
//
// Renders the editing surface as discrete US-Letter page sheets that break
// automatically, like Microsoft Word. This is a DECORATION-only feature: the
// document is never modified, so getHTML() / exports stay clean (the PDF export
// paginates independently). Spacer "page-break" widgets are injected as
// ProseMirror decorations to push whole blocks onto the next page; the white
// sheets themselves are drawn into a separate .page-sheets layer that sits
// behind the text.
//
// No new npm dependency — uses '@tiptap/pm/*' (ProseMirror), which ships with
// TipTap, exactly like find.js.
//
// ALGORITHM (decoration-based block pagination, no mid-block splitting):
//   1. Walk the top-level block nodes (doc.forEach), measuring each block's
//      outer height (getBoundingClientRect) and normalizing for the current
//      CSS zoom so all math is in logical px at 100%.
//   2. Greedy fill: track `used` px in the current page's content band. When a
//      block would overflow the band, emit a spacer widget before it that fills
//      the rest of the current band + bottom margin + grey gap + next page's
//      top margin, then start the new page with that block.
//   3. Record the page count K, then render K white sheets into .page-sheets and
//      size .page-wrap so scrolling matches.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const paginationPluginKey = new PluginKey('freewritePagination')

// US-Letter page metrics in logical CSS px at 100% zoom.
export const PAGE_W = 816 // 8.5in * 96
export const PAGE_H = 1056 // 11in * 96
export const MARGIN = 96 // 1in
export const CONTENT_H = PAGE_H - 2 * MARGIN // 864 — usable content band height
export const GAP = 28 // grey desk gap between consecutive sheets

// Read the current zoom factor. main.js applies `zoom` as a CSS `zoom` style on
// .page-wrap; we read it back from the live computed style so measurements can
// be normalized to logical px. Defaults to 1 when unavailable (tests/build).
function readZoomFactor(view) {
  try {
    const wrap = view.dom.closest('.page-wrap') || view.dom.parentElement
    if (!wrap) return 1
    const z = parseFloat(wrap.style.zoom || getComputedStyle(wrap).zoom || '1')
    if (!z || Number.isNaN(z) || z <= 0) return 1
    return z
  } catch {
    return 1
  }
}

// Measure a block DOM node's outer height INCLUDING vertical margins, in logical
// px (normalized for zoom). getBoundingClientRect already includes borders and
// padding but NOT margins, so we add the collapsed-ish vertical margins from the
// computed style. This is an approximation that is good enough for greedy fill.
function measureBlockHeight(dom, zoom) {
  if (!dom || dom.nodeType !== 1) return 0
  const rect = dom.getBoundingClientRect()
  let h = rect.height
  try {
    const cs = getComputedStyle(dom)
    const mt = parseFloat(cs.marginTop) || 0
    const mb = parseFloat(cs.marginBottom) || 0
    h += mt + mb
  } catch {
    /* ignore */
  }
  return h / zoom
}

// Compute the page breaks and sheet count.
// Returns { decorations: Decoration[], pageCount: number }.
function computePagination(view) {
  const { state } = view
  const { doc } = state
  const zoom = readZoomFactor(view)

  const decorations = []
  let used = 0 // logical px used in the current page's content band
  let pageCount = 1

  let pos = 0
  doc.forEach((node) => {
    const nodeStart = pos
    pos += node.nodeSize

    const dom = view.nodeDOM(nodeStart)
    const h = measureBlockHeight(dom, zoom)
    if (h <= 0) return // unmeasurable (e.g. not yet laid out) — skip cleanly

    if (used > 0 && used + h > CONTENT_H) {
      // This block starts a NEW page. Reserve the rest of the current content
      // band, the bottom margin, the grey gap, and the next page's top margin.
      const spacerH = CONTENT_H - used + MARGIN + GAP + MARGIN
      decorations.push(
        Decoration.widget(
          nodeStart,
          () => {
            const el = document.createElement('div')
            el.className = 'fw-page-break'
            el.style.height = `${spacerH}px`
            el.setAttribute('contenteditable', 'false')
            return el
          },
          { side: -1, key: `pb-${nodeStart}-${Math.round(spacerH)}`, ignoreSelection: true }
        )
      )
      pageCount += 1
      used = h
    } else {
      used += h
    }
  })

  return { decorations, pageCount }
}

// Render exactly `pageCount` white sheets into the .page-sheets layer and size
// the .page-wrap so the scroll height matches the stacked sheets. Pure DOM work,
// driven from the plugin's view update.
function renderSheets(view, pageCount) {
  const wrap = view.dom.closest('.page-wrap')
  if (!wrap) return
  const sheets = wrap.querySelector('.page-sheets')
  if (!sheets) return

  // Reconcile the number of sheet elements (reuse where possible).
  const existing = sheets.children
  while (existing.length > pageCount) sheets.removeChild(sheets.lastChild)
  while (existing.length < pageCount) {
    const s = document.createElement('div')
    s.className = 'fw-sheet'
    sheets.appendChild(s)
  }
  for (let i = 0; i < pageCount; i++) {
    const s = existing[i]
    s.style.top = `${i * (PAGE_H + GAP)}px`
    s.style.height = `${PAGE_H}px`
    s.style.width = `${PAGE_W}px`
  }

  // Size the wrap so the grey desk scroll height matches the stacked sheets.
  wrap.style.minHeight = `${pageCount * PAGE_H + (pageCount - 1) * GAP}px`
}

export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paginationPluginKey,
        state: {
          init() {
            return { decoSet: DecorationSet.empty, pageCount: 1 }
          },
          apply(tr, prev) {
            // The decoration set is produced by the view (it needs DOM
            // measurement), then stashed back into plugin state via a meta
            // transaction. Map the existing set forward on ordinary edits so
            // the spacers don't jump before the next measurement lands.
            const meta = tr.getMeta(paginationPluginKey)
            if (meta) return meta
            if (tr.docChanged) {
              return { ...prev, decoSet: prev.decoSet.map(tr.mapping, tr.doc) }
            }
            return prev
          }
        },
        props: {
          decorations(state) {
            return paginationPluginKey.getState(state).decoSet
          }
        },
        view(editorView) {
          let raf = null
          let lastSig = ''

          const recompute = () => {
            raf = null
            const view = editorView
            if (!view || !view.docView) return

            const { decorations, pageCount } = computePagination(view)

            // Cheap change detection: signature of (pageCount + spacer specs).
            // Bail if nothing changed so we don't dispatch redundant txns.
            const sig =
              pageCount + '|' + decorations.map((d) => `${d.from}:${d.spec.key}`).join(',')
            if (sig === lastSig) return
            lastSig = sig

            renderSheets(view, pageCount)

            const decoSet = DecorationSet.create(view.state.doc, decorations)
            const tr = view.state.tr.setMeta(paginationPluginKey, { decoSet, pageCount })
            tr.setMeta('addToHistory', false)
            view.dispatch(tr)
          }

          const schedule = () => {
            if (raf != null) return
            raf = requestAnimationFrame(recompute)
          }

          // Recompute on relevant layout-affecting changes.
          const onResize = () => schedule()
          window.addEventListener('resize', onResize)

          // Zoom changes apply a CSS `zoom` on .page-wrap; observe attribute
          // (style) mutations on it so we re-paginate when zoom changes.
          let zoomObserver = null
          const wrap = editorView.dom.closest('.page-wrap')
          if (wrap && typeof MutationObserver !== 'undefined') {
            zoomObserver = new MutationObserver(() => schedule())
            zoomObserver.observe(wrap, { attributes: true, attributeFilter: ['style'] })
          }

          // Images load asynchronously and change block heights after the fact.
          const onLoadCapture = (e) => {
            if (e.target && e.target.tagName === 'IMG') schedule()
          }
          editorView.dom.addEventListener('load', onLoadCapture, true)

          // Initial pass once the DOM has laid out.
          schedule()

          return {
            update(view, prevState) {
              // Recompute when the doc changed OR the editor was re-laid out.
              if (view.state.doc !== prevState.doc) schedule()
            },
            destroy() {
              if (raf != null) cancelAnimationFrame(raf)
              window.removeEventListener('resize', onResize)
              editorView.dom.removeEventListener('load', onLoadCapture, true)
              if (zoomObserver) zoomObserver.disconnect()
            }
          }
        }
      })
    ]
  }
})

export default Pagination
