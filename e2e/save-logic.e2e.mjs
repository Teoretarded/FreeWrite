// Exercises the save round-trip through the real preload bridge WITHOUT popping
// a native dialog.
//
// `file:save` (src/main/ipc.js) only shows the OS Save dialog when saveAs is
// true or currentPath is null. By passing a concrete currentPath to a temp file
// with a known extension, the handler serializes + atomic-writes the file with
// no dialog — so we can verify the full main-process save path end to end.

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js')

let app
let page
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freewrite-e2e-'))

test.beforeAll(async () => {
  app = await electron.launch({
    args: [mainEntry],
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 30_000 })
})

test.afterAll(async () => {
  // Avoid the dirty-document close-guard dialog hanging teardown.
  try {
    await page.evaluate(() => window.freewrite && window.freewrite.setDirty(false))
  } catch {
    /* page may already be gone */
  }
  if (app) await app.close()
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* ignore cleanup errors */
  }
})

test('saving HTML to a known path writes the file (no dialog)', async () => {
  const target = path.join(tmpDir, 'roundtrip.html').replace(/\\/g, '\\')

  // Drive window.freewrite.saveFile from inside the renderer. Because we pass a
  // currentPath with an .html extension and saveAs:false, no OS dialog appears.
  const result = await page.evaluate(async (targetPath) => {
    const html = '<h1>Saved Heading</h1><p>roundtrip body text</p>'
    return window.freewrite.saveFile(html, { currentPath: targetPath, saveAs: false })
  }, target)

  expect(result.canceled).toBeFalsy()
  expect(result.error).toBeFalsy()
  expect(result.path).toBe(target)

  // The file exists on disk and contains the saved content.
  expect(fs.existsSync(target)).toBe(true)
  const written = fs.readFileSync(target, 'utf8')
  expect(written).toContain('Saved Heading')
  expect(written).toContain('roundtrip body text')
})

test('saving then opening the same path round-trips the content back', async () => {
  const target = path.join(tmpDir, 'reopen.html')

  await page.evaluate(async (targetPath) => {
    const html = '<p>open me back</p>'
    return window.freewrite.saveFile(html, { currentPath: targetPath, saveAs: false })
  }, target)

  // openPath does NOT pop a dialog (it takes an explicit path).
  const opened = await page.evaluate(async (targetPath) => {
    return window.freewrite.openPath(targetPath)
  }, target)

  expect(opened.error).toBeFalsy()
  expect(opened.path).toBe(target)
  expect(opened.html).toContain('open me back')
})
