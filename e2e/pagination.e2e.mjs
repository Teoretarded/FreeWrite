// End-to-end test for on-screen page pagination.
//
// Launches the built app, fills the editor with enough content to exceed a
// single US-Letter page, waits for the pagination plugin to lay out the white
// sheets, and asserts that MORE THAN ONE .fw-sheet is rendered. Also captures a
// full-window screenshot to e2e/screenshots/pagination.png for visual review.
//
// Launch/teardown mirrors app.e2e.mjs (including the afterAll dirty-flag clear
// so the close-guard dialog can't hang teardown).

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js')
const screenshotPath = path.join(__dirname, 'screenshots', 'pagination.png')

let app
let page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [mainEntry],
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 30_000 })

  // Deterministic baseline: focus mode OFF, outline closed, 100% zoom.
  await page.evaluate(() => {
    try {
      localStorage.removeItem('freewrite-focus')
      localStorage.removeItem('freewrite-outline')
      localStorage.setItem('freewrite-zoom', '100')
    } catch {
      /* ignore */
    }
  })
  await page.reload()
  await page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 30_000 })
})

test.afterAll(async () => {
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

test('content exceeding one page renders multiple sheets', async () => {
  // Build ~80 paragraphs of real text — comfortably more than one US-Letter
  // page can hold — and set them through the live editor (exposed as
  // window.__fwEditor) so ProseMirror builds the real document and the
  // pagination plugin measures actual block heights.
  await page.evaluate(() => {
    const ed = window.__fwEditor
    if (!ed) throw new Error('editor not exposed for test')
    const paras = []
    for (let i = 1; i <= 80; i++) {
      paras.push(
        `<p>Paragraph ${i}: The quick brown fox jumps over the lazy dog, ` +
          `again and again, filling the page with words so pagination has ` +
          `something to break across multiple letter-sized sheets.</p>`
      )
    }
    ed.commands.setContent(paras.join(''))
  })

  // Wait for pagination (debounced via requestAnimationFrame, plus image/layout
  // settling) to render at least 2 sheets.
  await expect
    .poll(async () => page.locator('.fw-sheet').count(), { timeout: 15_000 })
    .toBeGreaterThan(1)

  const sheetCount = await page.locator('.fw-sheet').count()
  expect(sheetCount).toBeGreaterThan(1)

  // Let the final layout settle before the screenshot.
  await page.waitForTimeout(300)

  // Scroll so the boundary between sheet 1 and sheet 2 (the grey gap) is in
  // view, which makes the multi-sheet pagination visible in the screenshot.
  await page.evaluate(() => {
    const sheets = document.querySelectorAll('.fw-sheet')
    const area = document.getElementById('editor-area')
    if (sheets.length >= 2 && area) {
      const wrap = document.querySelector('.page-wrap')
      const zoom = parseFloat(wrap?.style.zoom || '1') || 1
      // Second sheet's top in logical px; multiply by zoom for actual px.
      const secondTop = parseFloat(sheets[1].style.top || '0') * zoom
      // Scroll so the gap above sheet 2 sits comfortably in the viewport.
      area.scrollTop = Math.max(0, secondTop - 220)
    }
  })
  await page.waitForTimeout(200)

  // Capture a full-window screenshot for visual review.
  await page.screenshot({ path: screenshotPath, fullPage: false })
})
