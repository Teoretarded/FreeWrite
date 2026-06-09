// Recent files persistence.
// Stores an array of absolute file paths (most-recent first, deduped, max 10)
// as JSON under the app's userData directory. All operations are best-effort:
// a missing/corrupt file simply yields an empty list, and write failures are
// swallowed so the recent list can never crash the main process.

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const MAX_RECENT = 10

function storePath() {
  return path.join(app.getPath('userData'), 'freewrite-recent.json')
}

// Read the current list. Always returns an array of strings.
export function getRecent() {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((p) => typeof p === 'string')
    }
  } catch {
    /* missing or corrupt -> empty */
  }
  return []
}

function writeRecent(list) {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(list, null, 2), 'utf8')
  } catch {
    /* best-effort */
  }
}

// Add a path to the front (deduped, capped). Returns the new list.
export function addRecent(filePath) {
  if (!filePath || typeof filePath !== 'string') return getRecent()
  const abs = path.resolve(filePath)
  const current = getRecent().filter((p) => path.resolve(p) !== abs)
  const next = [abs, ...current].slice(0, MAX_RECENT)
  writeRecent(next)
  return next
}

// Remove a path (e.g. when it failed to open). Returns the new list.
export function removeRecent(filePath) {
  if (!filePath) return getRecent()
  const abs = path.resolve(filePath)
  const next = getRecent().filter((p) => path.resolve(p) !== abs)
  writeRecent(next)
  return next
}

// Clear the entire list. Returns [].
export function clearRecent() {
  writeRecent([])
  return []
}
