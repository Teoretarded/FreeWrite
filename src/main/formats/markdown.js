// Markdown format.
// serialize:   editor HTML -> Markdown (turndown, GFM-ish settings).
// deserialize: Markdown    -> HTML (marked.parse).

import TurndownService from 'turndown'
import { marked } from 'marked'

export const name = 'Markdown'
export const extensions = ['md', 'markdown']

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx', // # Heading
    hr: '---',
    bulletListMarker: '-', // '-' bullets
    codeBlockStyle: 'fenced', // ``` fenced code
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })

  // GFM-ish strikethrough support without pulling in the optional plugin dep.
  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => `~~${content}~~`
  })

  return td
}

export async function serialize(html) {
  const td = makeTurndown()
  return td.turndown(String(html ?? ''))
}

export async function deserialize(data) {
  const md = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '')
  return marked.parse(md)
}
