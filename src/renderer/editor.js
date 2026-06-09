// editor.js — creates and exports the FreeWrite TipTap editor.
//
// TipTap v3 (3.26). StarterKit@3.26 ALREADY bundles, and we therefore do NOT
// re-register, the following (verified against
// node_modules/@tiptap/starter-kit/src/starter-kit.ts):
//   Document, Text, Paragraph, Heading, Bold, Italic, Strike, Code, CodeBlock,
//   Blockquote, HardBreak, HorizontalRule, BulletList, OrderedList, ListItem,
//   ListKeymap, Link, Underline, Dropcursor, Gapcursor, TrailingNode, UndoRedo.
//
// In particular Underline IS in StarterKit — re-registering it would throw a
// duplicate-extension error, so it is intentionally absent below.
//
// We add only the marks/extensions NOT in StarterKit: TextStyle, Color,
// Highlight, FontFamily, TextAlign, Subscript, Superscript — plus the tiny
// CUSTOM extensions (FontSize, LineHeight, BlockIndent) built on the standard
// TipTap global-attributes pattern (no extra npm dependency).

import { Editor, Extension } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { FontFamily } from '@tiptap/extension-font-family'
import { TextAlign } from '@tiptap/extension-text-align'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Image } from '@tiptap/extension-image'
import { SearchHighlight } from './find.js'

// --- Custom FontSize extension (built on the textStyle mark) -----------------
// Adds a `fontSize` global attribute to textStyle and set/unset commands.
export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})

// --- Custom LineHeight extension ---------------------------------------------
// Line height is a block property, so it is applied to paragraphs and headings
// (not to the inline textStyle mark).
export const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return { types: ['paragraph', 'heading'] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight) =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.updateAttributes(type, { lineHeight }))
            .every(Boolean)
        },
      unsetLineHeight:
        () =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.resetAttributes(type, 'lineHeight'))
            .every(Boolean)
        }
    }
  }
})

// --- Custom BlockIndent extension --------------------------------------------
// Adds a `marginLeft` block attribute to paragraphs and headings so the toolbar
// indent/outdent buttons can nudge non-list blocks. Standard global-attributes
// pattern; no extra npm dependency.
export const BlockIndent = Extension.create({
  name: 'blockIndent',

  addOptions() {
    return { types: ['paragraph', 'heading'] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          marginLeft: {
            default: null,
            parseHTML: (element) => element.style.marginLeft || null,
            renderHTML: (attributes) => {
              if (!attributes.marginLeft) return {}
              return { style: `margin-left: ${attributes.marginLeft}` }
            }
          }
        }
      }
    ]
  }
})

// --- Plain-paste arming flag -------------------------------------------------
// Set by the Ctrl/Cmd+Shift+V keymap and consumed by editorProps.handlePaste.
let plainPasteArmed = false

// --- Extra keyboard shortcuts ------------------------------------------------
// Google-Docs / Word style muscle-memory shortcuts plus a plain-paste arm and
// Tab/Shift+Tab block indent outside of lists.
export const EditorKeymaps = Extension.create({
  name: 'editorKeymaps',

  addKeyboardShortcuts() {
    const indent = (dir) => () => {
      const ed = this.editor
      // Let the Table extension own Tab/Shift+Tab for cell navigation.
      if (ed.isActive('table')) return false
      if (ed.isActive('listItem')) {
        return dir > 0
          ? ed.chain().focus().sinkListItem('listItem').run()
          : ed.chain().focus().liftListItem('listItem').run()
      }
      const types = ['paragraph', 'heading']
      const activeType = types.find((t) => ed.isActive(t)) || 'paragraph'
      const current = parseInt(ed.getAttributes(activeType).marginLeft || '0', 10) || 0
      let next = current + dir * 40
      if (next < 0) next = 0
      if (next > 200) next = 200
      return ed
        .chain()
        .focus()
        .updateAttributes(activeType, { marginLeft: next ? `${next}px` : null })
        .run()
    }
    return {
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),
      'Mod-Alt-1': () => this.editor.chain().focus().toggleHeading({ level: 1 }).run(),
      'Mod-Alt-2': () => this.editor.chain().focus().toggleHeading({ level: 2 }).run(),
      'Mod-Alt-3': () => this.editor.chain().focus().toggleHeading({ level: 3 }).run(),
      'Mod-Shift-7': () => this.editor.chain().focus().toggleOrderedList().run(),
      'Mod-Shift-8': () => this.editor.chain().focus().toggleBulletList().run(),
      'Mod-Space': () => this.editor.chain().focus().unsetAllMarks().run(),
      'Mod-Shift-v': () => {
        plainPasteArmed = true
        return false // let the browser deliver the paste, handlePaste consumes it
      },
      Tab: indent(1),
      'Shift-Tab': indent(-1)
    }
  }
})

/**
 * Create the FreeWrite editor.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.element   - the .page element to mount on.
 * @param {string}      [opts.content] - initial HTML.
 * @param {() => void}  [opts.onUpdate] - "dirty" callback fired on every change.
 * @param {(editor: Editor) => void} [opts.onSelectionUpdate] - fired on
 *        selection change / focus so the toolbar can refresh active states.
 *        Deliberately NOT fired on every transaction (typing) — that keeps the
 *        hot path cheap on large documents.
 * @param {() => void}  [opts.onCreate] - fired once the editor is ready.
 * @returns {Editor}
 */
export function createEditor({
  element,
  content = '<p></p>',
  onUpdate,
  onSelectionUpdate,
  onCreate
} = {}) {
  const editor = new Editor({
    element,
    content,
    autofocus: 'end',
    editorProps: {
      attributes: {
        // Enable the OS spellchecker on the editable surface.
        spellcheck: 'true'
      },
      // Paste-as-plain-text when Ctrl/Cmd+Shift+V is held (the keymap below sets
      // a flag); otherwise default rich paste. Also ingest pasted image files.
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (items) {
          for (const it of items) {
            if (it.kind === 'file' && it.type.startsWith('image/')) {
              const file = it.getAsFile()
              if (file) {
                event.preventDefault()
                const reader = new FileReader()
                reader.onload = () => {
                  editor.chain().focus().setImage({ src: String(reader.result) }).run()
                }
                reader.readAsDataURL(file)
                return true
              }
            }
          }
        }
        if (plainPasteArmed) {
          plainPasteArmed = false
          const text = event.clipboardData?.getData('text/plain')
          if (text) {
            event.preventDefault()
            editor.commands.insertContent(text)
            return true
          }
        }
        return false
      }
      // Note: file drag-and-drop (images + documents) is handled at the window
      // level in main.js, which routes via the preload bridge (getPathForFile /
      // readImage / openPath). We intentionally do NOT handle dropped files here
      // to avoid double-inserting them.
    },
    extensions: [
      StarterKit.configure({
        // Underline is included by StarterKit. Configure the bundled Link mark
        // here (do NOT add a second Link extension).
        link: {
          openOnClick: false,
          autolink: true
        }
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify']
      }),
      Subscript,
      Superscript,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      SearchHighlight,
      FontSize,
      LineHeight,
      BlockIndent,
      EditorKeymaps
    ],
    onCreate: ({ editor: ed }) => {
      if (typeof onCreate === 'function') onCreate(ed)
    },
    onUpdate: () => {
      if (typeof onUpdate === 'function') onUpdate()
    },
    onSelectionUpdate: ({ editor: ed }) => {
      // Refresh toolbar active-state only on selection changes (and focus,
      // below) — NOT on every transaction/keystroke. This keeps typing on
      // large documents cheap. The caller debounces this further.
      if (typeof onSelectionUpdate === 'function') onSelectionUpdate(ed)
    },
    onFocus: ({ editor: ed }) => {
      // Focus can change which marks are "active" relative to a collapsed
      // cursor; refresh once on focus so the toolbar is correct.
      if (typeof onSelectionUpdate === 'function') onSelectionUpdate(ed)
    }
  })

  return editor
}

export default createEditor
