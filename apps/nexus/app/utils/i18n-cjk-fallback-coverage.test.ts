import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import dashEn from '../../i18n/locales/route/en/dashboard'
import landEn from '../../i18n/locales/route/en/landing'
import zh from '../../i18n/locales/zh'
import dashZh from '../../i18n/locales/route/zh/dashboard'

/**
 * No `t()` call may fall back to a Chinese literal (#684).
 *
 * vue-i18n renders the second argument when the key is undefined, so a missing key is invisible in
 * review and invisible in Chinese. It shows up only as Chinese text rendered to an English user —
 * an expired reset link reading 重置链接无效, a device-authorization flow in Chinese, a Retry button
 * that never translates.
 *
 * `dashboard-i18n-coverage.test.ts` covers `notifications.vue` and `team.vue` by namespace (#682,
 * #683). This is the repo-wide rule the same defect kept producing: 27 keys were still missing
 * across device-auth, reset-password, verify, account, devices, assets and the dashboard nav.
 *
 * **Scope, stated rather than implied.** This enforces keys whose fallback is *Chinese*. A key with
 * an English fallback is equally untranslatable — no locale can ever supply it — but it is not
 * user-visible in the same way, and there are **45** of them today, concentrated in
 * `dashboard.sections` (18) and `dashboard.providerRegistry` (9). Enforcing those here would make
 * this gate red on arrival, which is how a gate gets switched off. They are reported on #684.
 *
 * `App suites (nexus)` is the one app suite that is *not* `continue-on-error`, so a test here can
 * fail a PR.
 */

const APP_ROOT = path.resolve(__dirname, '..')
const CJK = /[一-鿿]/

function flatten(tree: unknown, prefix = '', found = new Set<string>()): Set<string> {
  for (const [key, value] of Object.entries((tree ?? {}) as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, found)
    else found.add(full)
  }
  return found
}

const enKeys = new Set([...flatten(en), ...flatten({ dashboard: dashEn }), ...flatten(landEn)])
const zhKeys = new Set([...flatten(zh), ...flatten({ dashboard: dashZh })])

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found)
      continue
    }
    if (/\.(?:vue|ts)$/.test(entry) && !entry.includes('.test.')) found.push(full)
  }
  return found
}

interface CallSite { key: string, file: string }

const cjkFallbacks: CallSite[] = sourceFiles(APP_ROOT).flatMap((file) => {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/\bt\(\s*'([^']+)'\s*,\s*'([^']*)'/g)]
    .filter(match => CJK.test(match[2]!))
    .map(match => ({ key: match[1]!, file: path.relative(APP_ROOT, file) }))
})

describe('t() calls that fall back to Chinese', () => {
  it('reads the sources and the locale trees it means to compare', () => {
    // Positive control: "nothing is missing" is also what an empty scan and empty key sets report,
    // and a wrong root produces exactly that.
    expect(enKeys.size).toBeGreaterThan(2000)
    expect(zhKeys.size).toBeGreaterThan(2000)
    expect(cjkFallbacks.length).toBeGreaterThan(100)
  })

  it('have their key in the English tree', () => {
    // The one that matters: an English user is who sees the Chinese literal.
    const missing = [...new Set(cjkFallbacks.filter(site => !enKeys.has(site.key)).map(site => `${site.key} (${site.file})`))]

    expect(missing).toEqual([])
  })

  it('have their key in the Chinese tree too', () => {
    // Chinese has no visible symptom — the fallback literal is already Chinese — so this half is
    // what stops the key from being added in one locale and forgotten in the other.
    const missing = [...new Set(cjkFallbacks.filter(site => !zhKeys.has(site.key)).map(site => site.key))]

    expect(missing).toEqual([])
  })
})
