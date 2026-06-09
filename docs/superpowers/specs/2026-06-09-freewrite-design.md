# FreeWrite — Design Spec

**Date:** 2026-06-09
**Status:** Approved scope, pending spec review
**One-liner:** A free, open-source, Word-class desktop word processor that saves to .docx, .pdf, .md, .html, and .txt from a single Save dialog.

---

## 1. Goal & non-goals

**Goal:** A genuinely usable desktop word processor that feels like Microsoft Word for everyday writing, is fast and pleasant, and is 100% free and open source (GPL-3.0). The headline differentiator over Word's friction: **choosing your output format (.docx / .pdf / .md / …) is a one-click dropdown in the Save dialog.**

**Non-goals (for the MVP):**
- Not aiming for byte-perfect .docx fidelity with Word's every feature.
- No real-time collaboration, track changes, mail merge, or macros in v1.
- Not a Google Docs / cloud product — this is a local-first desktop app.

---

## 2. Scope

### MVP = Word "Tier 1" (the ~80% core)
- **Editing:** type/select, cut/copy/paste, undo/redo, delete.
- **Text formatting:** bold, italic, underline, strikethrough, font family, font size, text color, highlight, subscript/superscript, clear formatting.
- **Paragraph:** headings (H1–H3 + Normal), bullet & numbered lists, alignment (left/center/right/justify), line spacing, indent/outdent.
- **Document:** New, Open, Save, Save As (multi-format), word & character count, basic find.
- **View:** page-style writing canvas, zoom.

### Fast-follow (Tier 2, explicitly out of MVP)
Tables · image insert · find & replace · hyperlinks · page setup & margins · print · spell-check · dark mode · autosave & crash recovery.

### Later (Tier 3)
Track changes & comments · named styles/themes · headers/footers & page numbers · table of contents · templates · collaboration.

---

## 3. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Desktop shell | **Electron** | Native menus, OS Save/Open dialogs, offline, full filesystem access. Node already installed. |
| Editor engine | **TipTap** (built on ProseMirror) | Schema-based structured document model; every Tier-1/Tier-2 feature exists as an extension; serializes cleanly to HTML → docx/md. |
| Build/dev | **electron-vite** | Bundles main + preload + renderer; fast HMR for the renderer. |
| Packaging | **electron-builder** | Real installers for Windows/Mac/Linux when ready to distribute. |
| Tests | **Vitest** | Unit tests for the format-conversion layer (the highest-risk code). |
| License | **GPL-3.0** | Strong copyleft — derivatives must stay open source. |

**Node:** v24.x · **npm:** 11.x (confirmed present on the build machine).

---

## 4. Architecture

Three isolated processes, each with a single responsibility:

```
┌─────────────────────────────┐     IPC      ┌──────────────────────────────┐
│ Renderer (browser context)  │ <==========> │ Main (Node)                  │
│ - TipTap editor             │   preload    │ - app lifecycle, windows     │
│ - toolbar / status bar      │   bridge     │ - native menus               │
│ - document state (dirty?)   │              │ - Open/Save dialogs          │
│ - getHTML() / setHTML()     │              │ - file read/write            │
│   NO filesystem access      │              │ - format conversion (Node)   │
└─────────────────────────────┘              └──────────────────────────────┘
```

- **Main process** owns everything that touches the OS or filesystem: window/menu creation, native `dialog.showOpenDialog`/`showSaveDialog`, reading/writing bytes, and running all format converters (they are Node libraries).
- **Renderer** owns the editing experience only. It holds the document as TipTap state and can emit it as HTML. It never reads or writes files directly.
- **Preload** exposes a tiny, locked-down API over `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`) — e.g. `window.freewrite.open()`, `window.freewrite.save(html, opts)`. This is the only channel between renderer and main.

### Module layout
```
FreeWrite/
  package.json
  electron.vite.config.js
  LICENSE                       # GPL-3.0
  README.md
  .gitignore
  src/
    main/
      index.js                  # app lifecycle, window, application menu
      ipc.js                    # IPC handlers: open, save, save-as
      dialogs.js                # native open/save dialog wrappers
      formats/
        index.js                # registry: extension -> { serialize, deserialize }
        docx.js                 # html-to-docx (out) / mammoth (in)
        pdf.js                  # webContents.printToPDF (out only)
        markdown.js             # turndown (out) / marked (in)
        html.js                 # passthrough
        txt.js                  # strip to plain text
    preload/
      index.js                  # contextBridge API surface
    renderer/
      index.html
      main.js                   # bootstrap
      editor.js                 # TipTap instance + extensions
      toolbar.js                # formatting controls
      statusbar.js              # word/char count, save state
      styles.css                # app + print stylesheet
  test/
    formats.test.js             # round-trip unit tests
  docs/superpowers/specs/
    2026-06-09-freewrite-design.md
```

Each `formats/*.js` is a small, independently testable unit exposing a consistent interface:
- `serialize(html: string) => Buffer | string` — produce the file bytes/text for that format.
- `deserialize(input: Buffer | string) => string` — produce editor HTML from a file (where import is supported).

---

## 5. Data flow

### Document model
- Source of truth lives in the renderer as TipTap/ProseMirror state.
- The interchange currency across the IPC boundary is **HTML** (`editor.getHTML()` / `editor.commands.setContent(html)`). HTML is the lowest-common-denominator that every converter understands and TipTap produces/consumes natively.

### Save / Save As (headline feature)
1. User triggers Save (Ctrl+S) or Save As.
2. Renderer calls `window.freewrite.save(html, { currentPath })`.
3. If there is no current path, or it's Save As: main shows `showSaveDialog` with **format filters**:
   - `Word Document (*.docx)`
   - `PDF Document (*.pdf)`
   - `Markdown (*.md)`
   - `Plain Text (*.txt)`
   - `Web Page (*.html)`
4. The chosen filter / file extension selects the converter from `formats/index.js`.
5. Converter runs in main; bytes are written to the chosen path.
6. Main returns `{ path, format }`; renderer clears the dirty flag, updates the window title and status bar.

> Example: typing "the monkey walks in the street" → Ctrl+S → pick **PDF** (or **Word**, or **Markdown**) from the dropdown → file written. The format choice is per-save, never buried in menus.

### Open
1. File → Open → `showOpenDialog` filtered to supported types.
2. Main reads the file; by extension routes to the matching `deserialize` (`mammoth` for .docx, `marked` for .md, passthrough for .html/.txt).
3. Returns HTML → renderer loads it via `setContent`, records the path, clears dirty flag.

### PDF specifics
- PDF export uses Electron's native `webContents.printToPDF()` against the rendered document, giving real pagination.
- A dedicated **print stylesheet** (page size, margins, typography) ensures the PDF looks like a document, not a web page. Implemented either by printing a hidden offscreen window loaded with the document HTML + print CSS, or by toggling a print-mode class before `printToPDF`.

---

## 6. Error handling

- **File read/write failure:** caught in main, surfaced as a native error dialog; the in-memory document is never affected.
- **Unsupported file on Open:** friendly "Can't open this file type" dialog; no crash.
- **Conversion failure (e.g. docx export throws):** caught; user sees an error; the document and any existing saved file are left intact (never destroy user content on a failed save — write to a temp file then atomically replace).
- **Unsaved-changes guard:** New / Open / window-close while the document is dirty prompts Save / Don't Save / Cancel.
- **Dirty tracking:** renderer maintains a dirty flag set on edit, cleared on successful save/open.

---

## 7. Testing strategy

Automated testing concentrates on the **format-conversion layer**, which carries the most logic and risk:
- **Round-trip assertions:** `html → markdown → html` preserves bold, italics, headings, lists; `html → docx` produces a file whose extracted text contains the input; `marked`/`mammoth` import produces expected HTML structure from committed fixture files.
- **Pure-function shape:** each `formats/*.js` serializer/deserializer is tested in isolation with sample inputs — no Electron runtime needed.
- Runner: **Vitest**. Fixtures (sample `.docx`, `.md`) committed under `test/fixtures/`.

Renderer/UI behavior is verified manually for the MVP; Playwright-based e2e is a Tier-2 consideration.

---

## 8. Build & run

- `npm run dev` — launch the app with electron-vite (HMR on the renderer).
- `npm test` — run Vitest.
- `npm run build` / `npm run dist` — package installers with electron-builder (used once the MVP is stable; not required to develop).

---

## 9. Repository & licensing

- **Name:** FreeWrite
- **License:** GPL-3.0 (full `LICENSE` text + per-file headers optional).
- **Hosting:** new public GitHub repository (created with `gh repo create` only after spec review and explicit go-ahead).
- **README:** project pitch, feature list, screenshots (added once UI exists), build/run instructions, contribution + license notes.

---

## 10. Milestones (build order)

1. **Scaffold:** electron-vite project, GPL LICENSE, .gitignore, README, runnable empty window.
2. **Editor:** TipTap mounted in the renderer with Tier-1 formatting extensions; toolbar wired to commands; status bar word count.
3. **File pipeline:** preload bridge + main IPC + `formats/` (txt, html, md first — pure/simple — then docx, then pdf). Open + Save + Save As working end-to-end.
4. **Polish & safety:** dirty-state guard, error dialogs, application menu + keyboard shortcuts (Ctrl+S/O/N/Z/Y/B/I/U), zoom.
5. **Tests:** Vitest round-trip suite for the format layer.
6. **Ship:** README with screenshots; optional electron-builder installer; push to GitHub.
