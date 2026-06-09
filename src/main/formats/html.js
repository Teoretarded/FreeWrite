// Web Page (HTML) format.
// serialize:   editor body HTML -> a complete, standalone HTML document.
// deserialize: a full HTML document -> the inner HTML of its <body>.

export const name = 'Web Page'
export const extensions = ['html', 'htm']

const TEMPLATE_CSS = `
  :root { color-scheme: light dark; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.6;
    max-width: 48rem;
    margin: 2rem auto;
    padding: 0 1rem;
    color: #1a1a1a;
  }
  h1 { font-size: 2em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; }
  img { max-width: 100%; height: auto; }
  pre {
    background: #f4f4f4;
    padding: 0.75em 1em;
    overflow: auto;
    border-radius: 4px;
  }
  code { font-family: 'Courier New', monospace; }
  blockquote {
    margin: 0;
    padding-left: 1em;
    border-left: 3px solid #ccc;
    color: #555;
  }
`.trim()

export async function serialize(html) {
  const body = String(html ?? '')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Document</title>
<style>
${TEMPLATE_CSS}
</style>
</head>
<body>
${body}
</body>
</html>
`
}

export async function deserialize(data) {
  const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '')

  // Extract the inner HTML of the <body> if present; otherwise return as-is.
  const match = str.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (match) return match[1].trim()
  return str.trim()
}
