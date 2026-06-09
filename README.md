# FreeWrite

A free, open-source desktop word processor — the comfort of a real writing app, none of the lock-in.

FreeWrite is a clean, distraction-light editor that opens and saves the formats you actually use: Word, PDF, Markdown, HTML, and plain text. No subscription, no account, no telemetry.

## Features

A full Tier-1 formatting toolbar, all wired to a live rich-text editor:

- **History** — Undo / Redo
- **Paragraph styles** — Paragraph, Heading 1/2/3
- **Fonts** — Font family and font size dropdowns
- **Inline formatting** — Bold, Italic, Underline, Strikethrough
- **Color** — Text color picker and multi-color highlighter
- **Scripts** — Subscript and Superscript
- **Clear formatting** — strip marks back to plain text
- **Lists** — Bullet and ordered lists
- **Alignment** — Left, Center, Right, Justify
- **Spacing** — Line-spacing dropdown, Indent and Outdent
- **File** — New, Open, Save, Save As

A **live status bar** shows word count, character count, and a saved / unsaved indicator.

## Multi-format Save

Save once, in whatever format the destination needs. The file extension you choose picks the converter:

| Format | Extension | Open | Save |
| --- | --- | :-: | :-: |
| Word Document | `.docx` | ✓ | ✓ (default) |
| PDF Document | `.pdf` | — | ✓ |
| Markdown | `.md` | ✓ | ✓ |
| Web Page | `.html` | ✓ | ✓ |
| Plain Text | `.txt` | ✓ | ✓ |

`.docx` is the default save format. PDF is export-only. Saves are atomic (temp file + rename), so a failed export never corrupts an existing document.

## Tech stack

- **[Electron](https://www.electronjs.org/)** — cross-platform desktop shell
- **[TipTap](https://tiptap.dev/)** — the rich-text editor (built on ProseMirror)
- **[electron-vite](https://electron-vite.org/)** + **[Vite](https://vite.dev/)** — build tooling
- **[Vitest](https://vitest.dev/)** — tests
- Converters: **[@turbodocx/html-to-docx](https://www.npmjs.com/package/@turbodocx/html-to-docx)** & **[mammoth](https://www.npmjs.com/package/mammoth)** (Word), **[turndown](https://www.npmjs.com/package/turndown)** & **[marked](https://www.npmjs.com/package/marked)** (Markdown)

## Build & Run

Requires Node.js 18+ and npm.

```bash
# Install dependencies
npm install

# Run the app in development (hot reload)
npm run dev

# Build the production bundle (headless)
npm run build

# Run the test suite
npm test

# Package a distributable installer
npm run dist
```

## License

FreeWrite is licensed under the **GNU General Public License v3.0** (GPL-3.0-only). See the [LICENSE](./LICENSE) file for the full text.
