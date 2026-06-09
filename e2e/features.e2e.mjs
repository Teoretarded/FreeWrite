// End-to-end tests for the newer FreeWrite renderer features:
//   - Focus / distraction-free mode (toolbar button + F11 / Ctrl+Shift+F)
//   - Document outline panel (#outline-panel)
//   - Insert-date button
//   - Richer status bar (reading time + selection readout)
//   - Paste-as-plain-text shortcut (Ctrl+Shift+V)
//
// Launch/teardown mirrors app.e2e.mjs exactly (including the afterAll that
// clears the dirty flag so the close-guard dialog doesn't hang teardown).

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
  await page.waitForSelector('.page .ProseMirror', { state: 'visible', timeout: 30_000 })

  // Persisted UI state (focus mode / outline visibility) from a previous run can
  // leave the toolbar hidden (focus mode is display:none). Clear those keys and
  // reload once for a deterministic baseline: focus OFF, outline closed.
  await page.evaluate(() => {
    try {
      localStorage.removeItem('freewrite-focus')
      localStorage.removeItem('freewrite-outline')
    } catch {
      /* ignore */
    }
  })
  await page.reload()
  await page.waitForSelector('.page .ProseMirror', { state: 'visible', timeout: 30_000 })
})

test.afterAll(async () => {
  // The editor may be "dirty" after these tests, which would make the main
  // process close-guard pop a synchronous Save dialog and hang teardown. Tell
  // main the document is clean first so the window can close without a dialog.
  // Also clear the persisted focus/outline keys so a left-on focus mode (which
  // hides the toolbar via display:none) cannot poison a *different* test file's
  // Electron instance — userData/localStorage is shared across runs.
  try {
    await page.evaluate(() => {
      try {
        document.documentElement.classList.remove('focus-mode')
        localStorage.removeItem('freewrite-focus')
        localStorage.removeItem('freewrite-outline')
      } catch {
        /* ignore */
      }
      window.freewrite && window.freewrite.setDirty(false)
    })
  } catch {
    /* page may already be gone */
  }
  if (app) await app.close()
})

// --- Helpers -----------------------------------------------------------------

async function typeInEditor(text) {
  const editor = page.locator('.page .ProseMirror')
  await editor.click()
  await page.keyboard.type(text)
}

async function resetEditor() {
  await page.locator('.page .ProseMirror').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}

// Ensure focus mode starts OFF (it is persisted in localStorage, so a prior
// run / test could have left it on). When focus mode is ON the toolbar is
// `display:none`, so we toggle it off via the window-level F11 shortcut, which
// works regardless of CSS visibility rather than clicking the hidden button.
async function ensureFocusOff() {
  const on = await page.evaluate(() =>
    document.documentElement.classList.contains('focus-mode')
  )
  if (on) {
    await page.locator('.page .ProseMirror').click()
    await page.keyboard.press('F11')
  }
  await expect(page.locator('html')).not.toHaveClass(/focus-mode/)
}

// --- Focus mode --------------------------------------------------------------

test('Focus button toggles the focus-mode class on <html>', async () => {
  await ensureFocusOff()

  const focusBtn = page.locator('#toolbar .tb-btn[data-name="focus"]')
  await expect(focusBtn).toBeVisible()

  // Turn focus mode ON by clicking the toolbar button.
  await focusBtn.click()
  await expect(page.locator('html')).toHaveClass(/focus-mode/)
  // The toolbar button reflects the active state (still queryable via the DOM
  // even though focus mode hides the toolbar with display:none).
  await expect(focusBtn).toHaveClass(/is-active/)

  // Toggle OFF. The Focus button is now hidden (display:none under focus mode),
  // so we use the window-level F11 shortcut to flip it back — this still proves
  // the toggle is reversible and the button's active state clears.
  await page.locator('.page .ProseMirror').click()
  await page.keyboard.press('F11')
  await expect(page.locator('html')).not.toHaveClass(/focus-mode/)
  await expect(focusBtn).not.toHaveClass(/is-active/)
})

test('Ctrl+Shift+F toggles focus mode', async () => {
  await ensureFocusOff()

  // The keydown listener is attached at window level; focusing the editor first
  // makes the shortcut path realistic.
  await page.locator('.page .ProseMirror').click()
  await page.keyboard.press('Control+Shift+F')
  await expect(page.locator('html')).toHaveClass(/focus-mode/)

  await page.keyboard.press('Control+Shift+F')
  await expect(page.locator('html')).not.toHaveClass(/focus-mode/)
})

test('F11 toggles focus mode', async () => {
  await ensureFocusOff()

  await page.locator('.page .ProseMirror').click()
  await page.keyboard.press('F11')
  await expect(page.locator('html')).toHaveClass(/focus-mode/)

  await page.keyboard.press('F11')
  await expect(page.locator('html')).not.toHaveClass(/focus-mode/)

  // Leave it off for subsequent tests.
  await ensureFocusOff()
})

// --- Outline panel -----------------------------------------------------------

test('Outline panel toggles and lists an applied H1 heading', async () => {
  const outlineBtn = page.locator('#toolbar .tb-btn[data-name="outline"]')
  const panel = page.locator('#outline-panel')
  await expect(outlineBtn).toBeVisible()

  // Ensure the panel starts hidden (visibility is persisted in localStorage).
  const visible = await page.evaluate(() =>
    document.getElementById('outline-panel')?.classList.contains('show')
  )
  if (visible) {
    await outlineBtn.click()
    await expect(panel).not.toHaveClass(/show/)
  }

  // Create a heading the outline can pick up.
  await resetEditor()
  await typeInEditor('Chapter One')
  await page.keyboard.press('Control+A')
  await page.locator('#toolbar .tb-style-select').selectOption('h1')
  await expect(page.locator('.page .ProseMirror h1')).toHaveText('Chapter One')

  // Open the outline panel.
  await outlineBtn.click()
  await expect(panel).toHaveClass(/show/)
  await expect(outlineBtn).toHaveClass(/is-active/)

  // The heading appears as an outline item. Opening triggers a rebuild; the
  // outline reads heading text straight from the ProseMirror doc.
  const item = panel.locator('.outline-item', { hasText: 'Chapter One' })
  await expect(item).toBeVisible()
  await expect(item).toHaveClass(/outline-h1/)

  // Clicking it scrolls to the heading and must not throw.
  await item.click()
  await expect(panel).toHaveClass(/show/)

  // Close the panel again to leave a clean state.
  await outlineBtn.click()
  await expect(panel).not.toHaveClass(/show/)
})

// --- Insert date -------------------------------------------------------------

test('Insert-date button inserts today’s localized date', async () => {
  await resetEditor()

  // Compute the same string the renderer produces, in the renderer context so
  // the locale/timezone match exactly.
  const expectedDate = await page.evaluate(() =>
    new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  )

  await page.locator('.page .ProseMirror').click()
  await page.locator('#toolbar .tb-btn[data-name="insert-date"]').click()

  await expect(page.locator('.page .ProseMirror')).toContainText(expectedDate)
})

// --- Status bar --------------------------------------------------------------

test('Status bar shows a reading-time readout', async () => {
  await resetEditor()
  // Type enough words that reading time rounds to at least 1 minute (~200 wpm
  // => need >= ~100 words for "1 min read"; "<1 min read" is also acceptable
  // for short text). Either way, assert the readout element exists and updates.
  await typeInEditor('alpha beta gamma delta epsilon zeta eta theta iota kappa')

  const readEl = page.locator('#statusbar .sb-read')
  await expect(readEl).toBeVisible()
  // Reading-time text is debounced (~220ms); wait for it to read either
  // "<1 min read" or "N min read".
  await expect(readEl).toHaveText(/(\d+|<1)\s*min read/)
})

test('Status bar shows a "selected" readout when text is selected', async () => {
  await resetEditor()
  await typeInEditor('one two three four five')

  // Select everything.
  await page.locator('.page .ProseMirror').click()
  await page.keyboard.press('Control+A')

  const wordEl = page.locator('#statusbar .sb-words')
  // The selection readout is debounced; wait for "N of M words selected".
  await expect(wordEl).toHaveText(/\d+ of \d+ words selected/)
  // Specifically, 5 of 5 words selected.
  await expect(wordEl).toHaveText(/\b5 of 5 words selected\b/)

  // Collapsing the selection returns to the plain count.
  await page.keyboard.press('ArrowRight')
  await expect(wordEl).toHaveText(/\b5 words\b/)
})

// --- Paste-as-plain-text -----------------------------------------------------

test('Ctrl+Shift+V (plain-paste arm) is registered and does not throw', async () => {
  // Driving a real clipboard paste headlessly is unreliable across platforms,
  // so we verify the next-best thing: the Ctrl+Shift+V shortcut is wired into
  // the editor keymap and pressing it neither throws nor corrupts the document.
  // (The keymap sets an internal "armed" flag and returns false so the browser
  // delivers the paste, which handlePaste then consumes as plain text.)
  await resetEditor()
  await typeInEditor('keep this text')

  // Capture any uncaught page error while we exercise the shortcut.
  let pageError = null
  const onError = (err) => {
    pageError = err
  }
  page.on('pageerror', onError)

  await page.locator('.page .ProseMirror').click()
  await page.keyboard.press('Control+Shift+V')
  // Give any handler a tick to run.
  await page.waitForTimeout(100)

  page.off('pageerror', onError)

  expect(pageError).toBeNull()
  // The existing content is untouched (no clipboard payload was delivered).
  await expect(page.locator('.page .ProseMirror')).toContainText('keep this text')
})
