import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A `t()` call whose key is in neither locale renders the key itself (#502).
 *
 * The download-folder failure path did exactly that: a user whose picker failed saw the literal
 * string `settings.settingDownload.messages.destinationSelectFailed` in a toast. Nothing catches
 * this — `t()` returns the key rather than throwing, so the only symptom is in the UI, on an error
 * path, in the moment the user is already stuck.
 *
 * Rather than pin the one key, this is a ratchet over the whole renderer: the inventory below
 * is the gap that exists today, and the assertions are that nothing outside it is broken *and* that
 * everything inside it is still broken. A new gap fails the first; fixing a listed one fails the
 * second, so the list cannot rot into a permanent excuse. Locale parity is already exact, so that
 * half is asserted as an equality.
 *
 * Only statically written keys are covered. `t(\`a.${b}\`)` cannot be resolved by reading source,
 * and there is no attempt to pretend otherwise.
 */

const LANG_DIR = __dirname
const RENDERER_SRC = path.resolve(__dirname, '../..')

/**
 * Keys the renderer passes to `t()` that resolve to no string in either locale.
 *
 * Mostly plain absences, tracked by #487, #491 and #503. `download.status` is the other shape:
 * it exists in both files as a *namespace* holding pending/downloading/paused/…, so `t()` is
 * handed an object and the label renders as the key. Absent and non-leaf are the same defect
 * from the user's side, so they are listed together.
 */
const MISSING_FROM_BOTH = [
  'common.back',
  'download.status',
  'coreBox.intelligence.assistantLabel',
  'coreBox.intelligence.userLabel',
  'download.view_logs',
  'intelligence.info.configurationPanel',
  'intelligence.item.selectProvider',
  // 10 entries left this baseline on 2026-08-13: the app-shell-v2 convergence deleted
  // SettingMessages.vue and the intelligence search clear affordance, taking their unresolved
  // keys' only call sites with them. A baseline may only shrink; carrying them would let 10 new
  // dead keys in unnoticed.
  'store.official',
  'system.unknownError',
  'systemPermission.requiredPermission'
]

function loadLocale(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(LANG_DIR, `${name}.json`), 'utf8'))
}

function flatten(value: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      for (const nested of flatten(child as Record<string, unknown>, full)) keys.add(nested)
    } else {
      keys.add(full)
    }
  }
  return keys
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (full !== LANG_DIR) found.push(...sourceFiles(full))
      continue
    }
    if (/\.(?:vue|ts)$/.test(entry) && !/\.test\.ts$/.test(entry)) found.push(full)
  }
  return found
}

const enUS = flatten(loadLocale('en-US'))
const zhCN = flatten(loadLocale('zh-CN'))

const usedKeys = (() => {
  const keys = new Set<string>()
  for (const file of sourceFiles(RENDERER_SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?:\$t|\bt|i18n\.t)\(\s*'([a-z][\w.]*\.[\w.]+)'/gi)) {
      keys.add(match[1]!)
    }
  }
  return keys
})()

describe('translation coverage', () => {
  it('scans a plausible amount of the renderer', () => {
    // Positive control. Both ratchets are satisfied by an empty scan, which is what a wrong root or
    // a broken pattern produces — and `$t(` appears nowhere, so a `t(`-only pattern is complete.
    expect(usedKeys.size).toBeGreaterThan(2000)
    expect(enUS.size).toBeGreaterThan(4000)
    expect(usedKeys.has('settings.settingDownload.messages.saveFailed')).toBe(true)
  })

  it('resolves the download destination failure message', () => {
    // #502 itself: the toast a user sees when the folder picker fails.
    const key = 'settings.settingDownload.messages.destinationSelectFailed'

    expect(usedKeys.has(key)).toBe(true)
    expect(enUS.has(key)).toBe(true)
    expect(zhCN.has(key)).toBe(true)
  })

  it('introduces no key that resolves to nothing in both locales', () => {
    // flatten() keeps leaves only, so a key pointing at a namespace counts as unresolved — which
    // is what it is: t() returns no string for it.
    const missing = [...usedKeys].filter((key) => !enUS.has(key) && !zhCN.has(key)).sort()

    expect(missing).toEqual([...MISSING_FROM_BOTH].sort())
  })

  it('keeps the two locales on exactly the same key set', () => {
    // #503 closed the last gap here, so this is an equality rather than a ratchet: any key added to
    // one file must be added to the other, in either direction.
    expect([...enUS].filter((key) => !zhCN.has(key))).toEqual([])
    expect([...zhCN].filter((key) => !enUS.has(key))).toEqual([])
  })
})
