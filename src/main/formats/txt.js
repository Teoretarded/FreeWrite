// Plain Text format.
// serialize:   editor HTML -> readable plain text (block elements become newlines).
// deserialize: plain text  -> HTML (each line/paragraph wrapped in <p>…</p>).

export const name = 'Plain Text'
export const extensions = ['txt']

// Block-level tags whose CLOSING boundary becomes a line break in plain text.
// Note: 'br' is handled separately by the dedicated <br> replace below, so it
// is intentionally absent here. Table cells are separated by a tab (see below).
const BLOCK_TAGS = [
  'p', 'div', 'li', 'tr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer',
  'ul', 'ol', 'table', 'hr'
]

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
}

export async function serialize(html) {
  let text = String(html ?? '')

  // Normalize <br> and closing block tags into newline markers.
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Table cells: separate adjacent cells with a tab so they don't concatenate.
  text = text.replace(/<\/(td|th)\s*>/gi, '\t')

  // After each closing block tag, insert a newline.
  const closeRe = new RegExp(`</(${BLOCK_TAGS.join('|')})\\s*>`, 'gi')
  text = text.replace(closeRe, '\n')

  // Self-closing / void block elements (hr) -> newline.
  text = text.replace(/<hr\s*\/?>/gi, '\n')

  // Strip every remaining tag.
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities.
  text = decodeEntities(text)

  // Collapse runs of 3+ newlines to a max of 2 (one blank line), trim trailing
  // spaces on each line, and trim the document edges.
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\r\n?/g, '\n')
    .replace(/\t+$/gm, '')
    .trim()

  return text + '\n'
}

export async function deserialize(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '')

  // Split on blank lines into paragraphs; within a paragraph, single newlines
  // become <br>. Empty line -> a paragraph break (handled by the split).
  const normalized = text.replace(/\r\n?/g, '\n')
  const blocks = normalized.split(/\n{2,}/)

  const escape = (s) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const paras = blocks.map((block) => {
    const inner = block
      .split('\n')
      .map((line) => escape(line))
      .join('<br>')
    return `<p>${inner || '<br>'}</p>`
  })

  return paras.join('')
}
