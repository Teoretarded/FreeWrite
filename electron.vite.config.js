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
      // Electron 42 bundles Node ~22; target it so esbuild doesn't down-level
      // modern JS the runtime already supports.
      target: 'node20',
      sourcemap: false,
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
      target: 'node20',
      sourcemap: false,
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
      // The renderer only ever runs inside the bundled Chromium (~134 in
      // Electron 42), so target a modern Chromium to skip legacy-browser
      // transpilation/polyfills and produce a smaller, faster-parsing bundle.
      target: 'chrome130',
      sourcemap: false,
      // The @tiptap editor core is large; don't warn on its chunk.
      chunkSizeWarningLimit: 2000,
      // esbuild minification is the production default — keep it explicit.
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        // Defensive: the renderer must not bundle Node-only main-process deps.
        // The @tiptap/* packages are intentionally NOT listed and bundle normally.
        external: nodeOnlyDeps,
        output: {
          // Split the @tiptap/* editor packages into their own vendor chunk so
          // the editor core is cached/parsed separately from app code.
          manualChunks(id) {
            if (id.includes('node_modules/@tiptap/')) return 'tiptap'
          }
        }
      }
    }
  }
})
