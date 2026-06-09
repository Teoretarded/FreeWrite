// End-to-end tests for the Settings panel + configurable default colors +
// smart paste color-normalization.
//
//   - Opening the panel via the toolbar gear button
//   - Changing the page color recolors the .fw-sheet background
//   - Changing the default text color updates --fw-text-color on <html>
//   - Toggling the normalize-paste checkbox
//   - Smart paste strips foreground color from pasted HTML (headless, via the
//     exposed window.__fwTransformPastedHTML)
//   - Captures a screenshot of the open panel to e2e/screenshots/settings.png
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
const screenshotPath = path.join(__dirname, 'screenshots', 'settings.png')

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

  // Deterministic baseline: focus mode OFF, outline closed, default settings.
  await page.evaluate(() => {
    try {
      localStorage.removeItem('freewrite-focus')
      localStorage.removeItem('freewrite-outline')
      localStorage.removeItem('freewrite-settings')
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
        localStorage.removeItem('freewrite-settings')
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

// --- Open / close ------------------------------------------------------------

test('Gear button opens the Settings panel', async () => {
  const gear = page.locator('#toolbar .tb-btn[data-name="settings"]')
  await expect(gear).toBeVisible()

  const overlay = page.locator('.fw-settings-overlay')
  await expect(overlay).not.toHaveClass(/open/)

  await gear.click()
  await expect(overlay).toHaveClass(/open/)
  await expect(page.locator('.fw-settings-card')).toBeVisible()
  await expect(page.locator('.fw-settings-title')).toHaveText('Settings')
})

// --- Page color --------------------------------------------------------------

test('Changing page color recolors the page sheets', async () => {
  // Ensure panel open.
  const overlay = page.locator('.fw-settings-overlay')
  if (!(await overlay.evaluate((n) => n.classList.contains('open')))) {
    await page.locator('#toolbar .tb-btn[data-name="settings"]').click()
  }
  await expect(overlay).toHaveClass(/open/)

  const sheet = page.locator('.fw-sheet').first()
  const before = await sheet.evaluate((n) => getComputedStyle(n).backgroundColor)

  // Click the "Cream" page swatch (#faf3e0).
  await page.locator('.fw-set-swatch[data-value="#faf3e0"]').click()

  await expect
    .poll(async () => sheet.evaluate((n) => getComputedStyle(n).backgroundColor))
    .not.toBe(before)

  // Cream #faf3e0 = rgb(250, 243, 224).
  const after = await sheet.evaluate((n) => getComputedStyle(n).backgroundColor)
  expect(after).toBe('rgb(250, 243, 224)')
})

// --- Default text color ------------------------------------------------------

test('Changing default text color updates --fw-text-color on <html>', async () => {
  const overlay = page.locator('.fw-settings-overlay')
  if (!(await overlay.evaluate((n) => n.classList.contains('open')))) {
    await page.locator('#toolbar .tb-btn[data-name="settings"]').click()
  }

  // Click the "Blue" default-text swatch (#0066cc).
  await page.locator('.fw-set-row').first().locator('.fw-set-swatch[data-value="#0066cc"]').click()

  await expect
    .poll(async () =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--fw-text-color').trim()
      )
    )
    .toBe('#0066cc')
})

// --- Normalize-paste toggle --------------------------------------------------

test('Toggling normalize-paste updates the persisted setting', async () => {
  const overlay = page.locator('.fw-settings-overlay')
  if (!(await overlay.evaluate((n) => n.classList.contains('open')))) {
    await page.locator('#toolbar .tb-btn[data-name="settings"]').click()
  }

  const checkbox = page.locator('.fw-set-checkbox')
  // Default is checked (true).
  await expect(checkbox).toBeChecked()

  await checkbox.uncheck()
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('freewrite-settings')
        return raw ? JSON.parse(raw).normalizePaste : null
      })
    )
    .toBe(false)

  // Re-enable so smart-paste behaviour below is exercised under the recommended
  // default.
  await checkbox.check()
  await expect(checkbox).toBeChecked()
})

// --- Smart paste color normalization (headless) ------------------------------

test('Smart paste strips foreground color from pasted HTML', async () => {
  // The paste transform is exposed on window for deterministic headless testing.
  const out = await page.evaluate(() => {
    const fn = window.__fwTransformPastedHTML
    if (typeof fn !== 'function') return null
    return fn('<span style="color: rgb(255,255,255)">hello</span>')
  })

  expect(out).not.toBeNull()
  // No leftover foreground color anywhere in the transformed HTML.
  expect(out.toLowerCase()).not.toContain('color: rgb(255')
  expect(out.toLowerCase()).not.toContain('color:rgb(255')
  expect(out.toLowerCase()).not.toMatch(/\bcolor\s*:/)
  // The text content survives.
  expect(out).toContain('hello')
})

test('Smart paste preserves other formatting while removing color', async () => {
  const out = await page.evaluate(() => {
    const fn = window.__fwTransformPastedHTML
    return fn(
      '<p><strong style="color:#fff">bold</strong> and <em style="background-color:#000">italic</em></p>'
    )
  })
  expect(out.toLowerCase()).toContain('<strong')
  expect(out.toLowerCase()).toContain('<em')
  expect(out.toLowerCase()).not.toMatch(/\bcolor\s*:/)
  expect(out.toLowerCase()).not.toContain('background-color')
})

// --- Explicit color marks survive export -------------------------------------

test('Explicitly chosen text color creates a TextStyle mark preserved in getHTML', async () => {
  // Close the settings panel if open so it doesn't intercept toolbar clicks.
  const overlay = page.locator('.fw-settings-overlay')
  if (await overlay.evaluate((n) => n.classList.contains('open'))) {
    await page.locator('.fw-set-done').click()
  }

  // Type and select some text.
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.type('colored words')
  await page.keyboard.press('Control+A')

  // Apply an explicit text color via the toolbar color picker swatch (#e60000).
  // The Text-color trigger carries the .tb-color-text class; its popup is the
  // adjacent sibling within the same .tb-color wrapper.
  const textColorWrap = page.locator('#toolbar .tb-color', { has: page.locator('.tb-color-text') })
  await textColorWrap.locator('.tb-color-trigger').click()
  await textColorWrap.locator('.tb-swatch[title="#e60000"]').click()

  // getHTML must contain a real color mark for the explicitly colored text.
  const html = await page.evaluate(() => window.__fwEditor.getHTML())
  expect(html.toLowerCase()).toMatch(/color:\s*#e60000|color:\s*rgb\(230,\s*0,\s*0\)/)
  expect(html).toContain('colored words')

  // Clean up the doc.
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
})

// --- Screenshot --------------------------------------------------------------

test('Capture a screenshot of the open Settings panel', async () => {
  const overlay = page.locator('.fw-settings-overlay')
  if (!(await overlay.evaluate((n) => n.classList.contains('open')))) {
    await page.locator('#toolbar .tb-btn[data-name="settings"]').click()
  }
  await expect(overlay).toHaveClass(/open/)
  await expect(page.locator('.fw-settings-card')).toBeVisible()

  await page.screenshot({ path: screenshotPath })

  // Close via the Done button to leave clean state.
  await page.locator('.fw-set-done').click()
  await expect(overlay).not.toHaveClass(/open/)
})
