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

/**
 * Create the FreeWrite editor.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.element   - the .page element to mount on.
 * @param {string}      [opts.content] - initial HTML.
 * @param {() => void}  [opts.onUpdate] - "dirty" callback fired on every change.
 * @param {(editor: Editor) => void} [opts.onSelectionUpdate] - fired on
 *        selection/transaction so the toolbar can refresh active states.
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
    extensions: [
      StarterKit.configure({
        // Keep StarterKit defaults; everything we need is on by default.
        // Underline is included by StarterKit, so we rely on it here.
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
      FontSize,
      LineHeight,
      BlockIndent
    ],
    onCreate: ({ editor: ed }) => {
      if (typeof onCreate === 'function') onCreate(ed)
    },
    onUpdate: () => {
      if (typeof onUpdate === 'function') onUpdate()
    },
    onSelectionUpdate: ({ editor: ed }) => {
      if (typeof onSelectionUpdate === 'function') onSelectionUpdate(ed)
    },
    onTransaction: ({ editor: ed }) => {
      // Active-state of toolbar buttons can change without a selection change
      // (e.g. toggling a mark), so refresh on every transaction too.
      if (typeof onSelectionUpdate === 'function') onSelectionUpdate(ed)
    }
  })

  return editor
}

export default createEditor
