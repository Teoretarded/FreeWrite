// Formats registry.
// Aggregates every format module and provides lookup + dialog-filter helpers.

import * as txt from './txt.js'
import * as html from './html.js'
import * as markdown from './markdown.js'
import * as docx from './docx.js'
import * as pdf from './pdf.js'

// All known format modules.
export const formats = [txt, html, markdown, docx, pdf]

// Look up a format module by file extension (lowercase, no leading dot).
export function byExtension(ext) {
  if (!ext) return undefined
  const e = String(ext).toLowerCase().replace(/^\./, '')
  return formats.find((f) => f.extensions.includes(e))
}

// Save dialog filters.
// ORDER (per contract): Word Document(docx) FIRST, then PDF, Markdown,
// Web Page(html), Plain Text(txt).
export function saveFilters() {
  return [
    { name: docx.name, extensions: docx.extensions },
    { name: pdf.name, extensions: pdf.extensions },
    { name: markdown.name, extensions: markdown.extensions },
    { name: html.name, extensions: html.extensions },
    { name: txt.name, extensions: txt.extensions }
  ]
}

// Open dialog filters.
// importable = modules that expose deserialize (docx, md, html, txt — NOT pdf).
// First entry is a combined "All supported" filter, then each importable type.
export function openFilters() {
  const importable = formats.filter((f) => typeof f.deserialize === 'function')

  const allExtensions = []
  for (const f of importable) {
    for (const ext of f.extensions) {
      if (!allExtensions.includes(ext)) allExtensions.push(ext)
    }
  }

  return [
    { name: 'All supported', extensions: allExtensions },
    ...importable.map((f) => ({ name: f.name, extensions: f.extensions }))
  ]
}
