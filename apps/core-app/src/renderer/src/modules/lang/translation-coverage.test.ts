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
 * Rather than pin the one key, this covers the whole renderer. It began as a ratchet over the gap
 * that existed then; the last nine keys in it were added on 2026-10-26, so both halves - every
 * statically written key resolves, and the two locales hold the same keys - are equalities now.
 *
 * Only statically written keys are covered. `t(\`a.${b}\`)` cannot be resolved by reading source,
 * and there is no attempt to pretend otherwise.
 */

const LANG_DIR = __dirname
const RENDERER_SRC = path.resolve(__dirname, '../..')

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
    // is what it is: t() returns no string for it. `download.status` was that shape: a namespace
    // of status names, handed to t() as the "Status" label.
    const missing = [...usedKeys].filter((key) => !enUS.has(key) && !zhCN.has(key)).sort()

    expect(missing).toEqual([])
  })

  it('keeps the two locales on exactly the same key set', () => {
    // #503 closed the last gap here, so this is an equality rather than a ratchet: any key added to
    // one file must be added to the other, in either direction.
    expect([...enUS].filter((key) => !zhCN.has(key))).toEqual([])
    expect([...zhCN].filter((key) => !enUS.has(key))).toEqual([])
  })
})
