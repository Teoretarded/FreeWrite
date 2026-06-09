// End-to-end tests that drive the real FreeWrite Electron app.
//
// We launch the built app (out/main/index.js) with Playwright's Electron
// driver, grab the first BrowserWindow, and exercise the smoke paths plus the
// key editor flows that do NOT require native OS dialogs (Open/Save/Print are
// driven by the OS and can't be automated headlessly, so they're avoided here —
// the save *logic* is exercised separately in save-logic.e2e.mjs via the
// preload bridge in a way that won't pop a dialog).

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js')

let app
let page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [mainEntry],
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  // Wait for the renderer to finish booting: the editor mounts a ProseMirror
  // contenteditable inside .page.
  await page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 30_000 })
})

test.afterAll(async () => {
  // The editor is "dirty" after these tests, which would make the main process
  // close-guard pop a synchronous Save/Don't-Save/Cancel dialog and hang the
  // teardown. Tell main the document is clean first so the window can close
  // without a dialog.
  try {
    await page.evaluate(() => window.freewrite && window.freewrite.setDirty(false))
  } catch {
    /* page may already be gone */
  }
  if (app) await app.close()
})

// Helper: type into the editor after focusing it.
async function typeInEditor(text) {
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type(text)
}

// Helper: reset editor to empty so tests don't bleed into each other.
async function resetEditor() {
  await page.evaluate(() => {
    // Select-all + delete via the editor if exposed, else clear DOM content.
    const pm = document.querySelector('.ProseMirror')
    if (pm) {
      pm.focus()
    }
  })
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}

test('app boots and the editor mounts', async () => {
  // The editor's contenteditable region is visible.
  await expect(page.locator('.ProseMirror')).toBeVisible()
  // The toolbar built its buttons.
  await expect(page.locator('#toolbar .tb-btn[data-name="bold"]')).toBeVisible()
  // The status bar exists.
  await expect(page.locator('#statusbar .sb-words')).toBeVisible()
})

test('typing text appears in the editor', async () => {
  await resetEditor()
  await typeInEditor('Hello FreeWrite')
  await expect(page.locator('.ProseMirror')).toContainText('Hello FreeWrite')
})

test('word count updates in the status bar', async () => {
  await resetEditor()
  await typeInEditor('one two three four')
  // 4 words.
  await expect(page.locator('#statusbar .sb-words')).toHaveText(/\b4 words\b/)
})

test('Bold button wraps selection in <strong>', async () => {
  await resetEditor()
  await typeInEditor('bold me')
  await page.keyboard.press('Control+A')
  await page.locator('#toolbar .tb-btn[data-name="bold"]').click()
  // ProseMirror renders bold as <strong>.
  await expect(page.locator('.ProseMirror strong')).toHaveText('bold me')
  // The bold button reflects active state.
  await expect(page.locator('#toolbar .tb-btn[data-name="bold"]')).toHaveClass(/is-active/)
})

test('Heading 1 style makes an <h1>', async () => {
  await resetEditor()
  await typeInEditor('My Heading')
  await page.keyboard.press('Control+A')
  // The paragraph-style dropdown is the first select in the toolbar.
  await page.locator('#toolbar .tb-style-select').selectOption('h1')
  await expect(page.locator('.ProseMirror h1')).toHaveText('My Heading')
})

test('dark-mode toggle adds the "dark" class to <html>', async () => {
  // Ensure we start in light mode for a deterministic toggle.
  const wasDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  )
  if (wasDark) {
    await page.locator('#toolbar .tb-btn[data-name="theme"]').click()
  }
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.locator('#toolbar .tb-btn[data-name="theme"]').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  // Toggle back to leave a clean state.
  await page.locator('#toolbar .tb-btn[data-name="theme"]').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('insert table creates a <table>', async () => {
  await resetEditor()
  await page.locator('.ProseMirror').click()
  // Open the Table dropdown then click "Insert table (3×3)".
  await page.locator('#toolbar .tb-dropdown-trigger').click()
  await page.locator('#toolbar .tb-menu-item', { hasText: 'Insert table' }).click()
  await expect(page.locator('.ProseMirror table')).toBeVisible()
  // 3 columns in the (header) first row.
  const headerCells = page.locator('.ProseMirror table tr').first().locator('th, td')
  await expect(headerCells).toHaveCount(3)
})

test('find bar (Ctrl+F) opens', async () => {
  await resetEditor()
  await typeInEditor('find this word, find that word')
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+F')
  await expect(page.locator('.fw-findbar')).toHaveClass(/open/)
  await expect(page.locator('.fw-find-input')).toBeVisible()
  // Searching "find" should report 2 matches in the counter.
  await page.locator('.fw-find-input').fill('find')
  await expect(page.locator('.fw-find-count')).toHaveText(/\/2$/)
  // Close it.
  await page.keyboard.press('Escape')
  await expect(page.locator('.fw-findbar')).not.toHaveClass(/open/)
})

test('italic and underline marks render correctly', async () => {
  await resetEditor()
  await typeInEditor('styled text')
  await page.keyboard.press('Control+A')
  await page.locator('#toolbar .tb-btn[data-name="italic"]').click()
  await page.locator('#toolbar .tb-btn[data-name="underline"]').click()
  await expect(page.locator('.ProseMirror em')).toHaveText('styled text')
  await expect(page.locator('.ProseMirror u')).toHaveText('styled text')
})

test('bullet list button creates a <ul>', async () => {
  await resetEditor()
  await typeInEditor('list item')
  await page.locator('#toolbar .tb-btn[data-name="bulletList"]').click()
  await expect(page.locator('.ProseMirror ul li')).toContainText('list item')
})
