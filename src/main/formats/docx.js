// Word Document (.docx) format.
// serialize:   editor HTML -> .docx Buffer (@turbodocx/html-to-docx).
// deserialize: .docx Buffer -> HTML (mammoth.convertToHtml).

import htmlToDocx from '@turbodocx/html-to-docx'
import mammoth from 'mammoth'

export const name = 'Word Document'
export const extensions = ['docx']

// Normalize whatever html-to-docx returns (Buffer | Blob | ArrayBuffer | Uint8Array)
// into a Node Buffer.
async function toBuffer(out) {
  if (Buffer.isBuffer(out)) return out
  if (out instanceof ArrayBuffer) return Buffer.from(out)
  if (ArrayBuffer.isView(out)) {
    // Typed array / DataView view onto an ArrayBuffer.
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
  }
  // Blob (has arrayBuffer()).
  if (out && typeof out.arrayBuffer === 'function') {
    return Buffer.from(await out.arrayBuffer())
  }
  throw new Error('html-to-docx returned an unsupported type')
}

export async function serialize(html) {
  // html-to-docx expects a full/standalone HTML string for best results; it
  // tolerates a fragment, but wrapping ensures a well-formed document body.
  const source = String(html ?? '')
  const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${source}</body></html>`

  const out = await htmlToDocx(wrapped, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false
  })

  return toBuffer(out)
}

// Normalize a Buffer | ArrayBuffer | TypedArray/DataView into a Node Buffer.
// Never treats a string as document bytes (a string here is a programming error,
// not docx content).
function toInputBuffer(data) {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  throw new Error('Not a valid .docx (expected file bytes)')
}

export async function deserialize(data) {
  const buffer = toInputBuffer(data)
  try {
    const result = await mammoth.convertToHtml({ buffer })
    return result.value
  } catch {
    throw new Error('Not a valid .docx file')
  }
}
