// PDF Document format. EXPORT ONLY — no deserialize.
// serialize: render the editor HTML to a PDF Buffer via ctx.createPdf.

export const name = 'PDF Document'
export const extensions = ['pdf']

export async function serialize(html, ctx) {
  if (!ctx || typeof ctx.createPdf !== 'function') {
    throw new Error('PDF export requires a createPdf renderer in the context')
  }
  return ctx.createPdf(String(html ?? ''))
}

// No deserialize: PDF is export-only and therefore not importable.
