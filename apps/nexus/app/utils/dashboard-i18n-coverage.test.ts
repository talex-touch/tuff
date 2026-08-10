import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/route/en/dashboard'
import zh from '../../i18n/locales/route/zh/dashboard'

/**
 * The page calls `t('dashboard.notifications.*', '<Chinese default>')` throughout.
 * vue-i18n falls back to that second argument when the key is undefined, so a
 * missing key is invisible in review and in Chinese — it only shows up as Chinese
 * text rendered to an English user (#682).
 *
 * That fallback is exactly why this has to be checked rather than eyeballed: the
 * page renders fine either way. notifications.vue was missing 23 keys and team.vue
 * 39, in BOTH locales — zh simply had no visible symptom, because the fallback
 * literal was already Chinese (#682, #683).
 */

const KEY_PREFIX = 'dashboard.'

const PAGES = [
  { file: 'notifications.vue', namespace: 'dashboard.notifications', minKeys: 40 },
  { file: 'team.vue', namespace: 'dashboard.team', minKeys: 40 },
] as const

/**
 * Matches any quoted occurrence of the key, not just `t(key, 'default')`.
 * team.vue reaches `dashboard.team.seatUsage` as `t(key, { used, total })` with no
 * default at all — a shape the narrower pattern misses, and the one with the worst
 * symptom, since a missing key there renders the raw key path to every locale.
 */
function usedKeys(page: (typeof PAGES)[number]): string[] {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../pages/dashboard', page.file),
    'utf8',
  )
  const pattern = new RegExp(`['"\`](${page.namespace.replace('.', '\\.')}\\.[\\w.]+)['"\`]`, 'g')
  return [...new Set([...source.matchAll(pattern)].map(match => match[1]!))]
}

function resolveKey(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, tree)
}

function missingIn(locale: unknown, page: (typeof PAGES)[number]): string[] {
  return usedKeys(page).filter(
    key => typeof resolveKey(locale, key.slice(KEY_PREFIX.length)) !== 'string',
  )
}

describe('dashboard i18n key coverage', () => {
  it.each(PAGES)('finds the keys to check at all in $file', (page) => {
    // Positive control. If the regex ever stops matching — the page switches to
    // $t, or to a computed key — every assertion below would pass vacuously.
    expect(usedKeys(page).length).toBeGreaterThan(page.minKeys)
  })

  it.each(PAGES)('defines every key $file uses in English', (page) => {
    expect(missingIn(en, page)).toEqual([])
  })

  it.each(PAGES)('defines every key $file uses in Chinese', (page) => {
    expect(missingIn(zh, page)).toEqual([])
  })

  it('keeps the relative-time values usable as suffixes', () => {
    // relativeTime() concatenates these after a number rather than interpolating,
    // so dropping the leading space silently renders "5minutes ago".
    for (const locale of [en, zh]) {
      for (const key of ['minutesAgo', 'hoursAgo', 'daysAgo']) {
        const value = resolveKey(locale, `notifications.${key}`)
        expect(typeof value).toBe('string')
        expect(value as string).toMatch(/^\s/)
      }
    }
  })
})
