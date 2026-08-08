import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import zh from '../../i18n/locales/zh'
import enDashboard from '../../i18n/locales/route/en/dashboard'
import enLanding from '../../i18n/locales/route/en/landing'
import zhDashboard from '../../i18n/locales/route/zh/dashboard'
import zhLanding from '../../i18n/locales/route/zh/landing'

/**
 * Repo-wide guard for the class of defect behind #682, #683 and #684.
 *
 * `t(key, 'Chinese default')` renders the default when the key is undefined, so
 * a missing key is invisible: the page looks correct in review and correct in
 * Chinese, and only an English user ever sees the symptom. Nothing fails, which
 * is why 91 of these accumulated.
 *
 * The route chunks are namespaced rather than spread at the top level — the
 * `dashboard` chunk supplies `dashboard.*`. Merging them flat makes every
 * `dashboard.*` key look missing, which is exactly the wrong answer this test
 * would otherwise confidently report, so the controls below are not optional.
 */

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function mergeLocale(
  base: unknown,
  dashboard: unknown,
  landing: unknown,
): Record<string, unknown> {
  const root = base as Record<string, unknown>
  return {
    ...root,
    dashboard: { ...((root.dashboard as object | undefined) ?? {}), ...(dashboard as object) },
    landing: { ...((root.landing as object | undefined) ?? {}), ...(landing as object) },
  }
}

const LOCALES = {
  en: mergeLocale(en, enDashboard, enLanding),
  zh: mergeLocale(zh, zhDashboard, zhLanding),
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (/\.(?:vue|ts)$/.test(name) && !/\.test\.ts$/.test(name)) found.push(path)
  }
  return found
}

function resolveKey(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, tree)
}

interface Fallback { file: string, key: string }

/** Call sites of the form `t('key', 'default')` whose default contains CJK. */
function cjkFallbacks(): Fallback[] {
  const found: Fallback[] = []
  for (const file of sourceFiles(APP_ROOT)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bt\(\s*'([\w.]+)'\s*,\s*'([^']*)'/g)) {
      if (!/[一-鿿]/.test(match[2]!)) continue
      found.push({ file: file.slice(APP_ROOT.length + 1), key: match[1]! })
    }
  }
  return found
}

function missing(locale: keyof typeof LOCALES): Fallback[] {
  return cjkFallbacks().filter(
    entry => typeof resolveKey(LOCALES[locale], entry.key) !== 'string',
  )
}

describe('i18n CJK fallback coverage', () => {
  it('finds call sites to check at all', () => {
    // Positive control on the scan. Without it, a regex that stops matching turns
    // every assertion below green while the defect is untouched.
    expect(cjkFallbacks().length).toBeGreaterThan(100)
  })

  it('resolves keys from the namespaced route chunks', () => {
    // Positive control on the merge. A flat spread makes these undefined, which
    // is the mistake that produced a bogus 357-missing count while writing this.
    expect(typeof resolveKey(LOCALES.en, 'dashboard.team.subtitle')).toBe('string')
    expect(typeof resolveKey(LOCALES.en, 'dashboard.notifications.title')).toBe('string')
    expect(typeof resolveKey(LOCALES.en, 'auth.resetTitle')).toBe('string')
  })

  it('reports a key that genuinely does not exist', () => {
    // Negative control: the lookup must be capable of returning undefined.
    expect(resolveKey(LOCALES.en, 'auth.thisKeyDoesNotExist')).toBeUndefined()
  })

  it('has no English fallback that can never be translated', () => {
    expect(missing('en').map(entry => `${entry.file}: ${entry.key}`)).toEqual([])
  })

  it('has no Chinese fallback that can never be translated', () => {
    // zh has the same gaps but no visible symptom, since the fallback literal is
    // already the Chinese text. Left unchecked it drifts silently.
    expect(missing('zh').map(entry => `${entry.file}: ${entry.key}`)).toEqual([])
  })
})
