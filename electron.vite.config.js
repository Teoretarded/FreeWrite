import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Node-only dependencies. These are used in the MAIN process only and must never
// be pulled into a bundle (renderer or main). externalizeDepsPlugin keeps every
// production dependency external in the main/preload builds; for the renderer we
// also list them explicitly so an accidental import fails loudly instead of
// silently bundling a Node-only module into the browser context.
const nodeOnlyDeps = [
  'mammoth',
  '@turbodocx/html-to-docx',
  'turndown',
  'marked'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        // Defensive: the renderer must not bundle Node-only main-process deps.
        // The @tiptap/* packages are intentionally NOT listed and bundle normally.
        external: nodeOnlyDeps
      }
    }
  }
})
