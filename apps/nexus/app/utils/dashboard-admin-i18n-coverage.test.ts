import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/route/en/dashboard'
import zh from '../../i18n/locales/route/zh/dashboard'

/**
 * English fallbacks are the blind spot in every other i18n check here:
 * `t('…providers.created', 'Provider created.')` renders correctly in English
 * forever while being untranslatable in Chinese, because no locale can supply a
 * key that does not exist. `i18n-cjk-fallback-coverage` only enforces keys whose
 * fallback is *Chinese*; `dashboard-i18n-coverage` only covers notifications.vue
 * and team.vue. 19 keys across the admin console were in that state — the whole
 * provider-registry toast vocabulary, the resource and update delete
 * confirmations, and the doc-comments analytics links.
 *
 * Worse, two of them — `…overview.ipBans.enabled` / `.disabled` — are called with
 * no fallback at all, so the IP ban list rendered the literal key path
 * `dashboard.sections.intelligence.overview.ipBans.enabled` as a status label in
 * both locales.
 *
 * **Overlap, stated so the wrong one does not get deleted.**
 * `test/guards/i18n-key-existence.test.ts` is the primary gate and does more —
 * it also catches a fallback that contradicts the key it reads. It loads
 * `app/pages/dashboard` and `app/components/dashboard` filtered to `['.vue']`,
 * so it cannot see `app/composables/useProviderRegistryAdmin.ts`, where all nine
 * provider-registry toasts live. That composable and the en/zh structural parity
 * check below are what this file adds; the page coverage is deliberate overlap.
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Everything an administrator can reach from the admin section of the nav. */
const ADMIN_SURFACE = [
  'pages/dashboard/admin',
  'components/dashboard/admin',
  'components/dashboard/intelligence',
  'components/dashboard/DashboardNav.vue',
  'components/dashboard/provider-registry',
  'composables/useProviderRegistryAdmin.ts',
  'composables/provider-registry',
  // Admin menu destinations that live outside the admin directory.
  'pages/dashboard/updates.vue',
  'pages/dashboard/images.vue',
]

function sourceFiles(target: string, found: string[] = []): string[] {
  const full = path.join(APP_ROOT, target)
  // A path that no longer resolves has to be an error, not an empty
  // contribution: the first draft of this list pointed at
  // `components/dashboard/ProviderRegistryAdminPanel.vue` (the panel actually
  // lives a directory deeper) and skipped the whole panel while reporting clean.
  const stats = statSync(full)
  if (!stats.isDirectory()) {
    if (/\.(?:vue|ts)$/.test(full) && !full.includes('.test.'))
      found.push(full)
    return found
  }
  for (const entry of readdirSync(full))
    sourceFiles(path.join(target, entry), found)
  return found
}

/**
 * Matches any quoted `dashboard.*` key inside a `t(` / `$t(` call, with or
 * without a fallback — `t(key, { count })` and bare `t(key)` are the shapes with
 * the worst symptom, since they render the raw key path.
 */
const CALL = /\$?\bt\(\s*'(dashboard\.[\w.]+)'/g

interface CallSite { key: string, file: string }

const callSites: CallSite[] = ADMIN_SURFACE.flatMap(target => sourceFiles(target)).flatMap((file) => {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(CALL)].map(match => ({
    key: match[1]!,
    file: path.relative(APP_ROOT, file),
  }))
})

function resolveKey(tree: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object')
      return (node as Record<string, unknown>)[part]
    return undefined
  }, tree)
}

/** Keys are written `dashboard.x.y`; the trees are rooted at `x`. */
function missingFrom(locale: unknown): string[] {
  return [...new Set(
    callSites
      .filter(site => typeof resolveKey(locale, site.key.slice('dashboard.'.length)) !== 'string')
      .map(site => `${site.key} (${site.file})`),
  )].sort()
}

describe('admin console i18n key coverage', () => {
  it('reads the admin sources and the locale trees it means to compare', () => {
    // Positive control. An empty scan, a moved directory or a locale tree that
    // failed to import all report "nothing missing" just as loudly as a clean
    // one does.
    expect(callSites.length).toBeGreaterThan(300)
    expect(new Set(callSites.map(site => site.file)).size).toBeGreaterThan(8)
    expect(resolveKey(en, 'sections.menu.risk')).toBe('Risk control')
    expect(resolveKey(zh, 'sections.menu.risk')).toBe('风控控制面')
  })

  it('would report a key that is genuinely absent', () => {
    // The other half of the control: prove the lookup returns undefined for a
    // key nobody defines, so an "everything resolves" result means something.
    expect(resolveKey(en, 'sections.menu.notAKeyAnyoneDefines')).toBeUndefined()
    expect(resolveKey(zh, 'sections.menu.notAKeyAnyoneDefines')).toBeUndefined()
  })

  it('defines every key the admin console uses in English', () => {
    expect(missingFrom(en)).toEqual([])
  })

  it('defines every key the admin console uses in Chinese', () => {
    expect(missingFrom(zh)).toEqual([])
  })

  it('keeps the two locales structurally identical across the admin sections', () => {
    // A key added to one locale only is invisible until someone switches
    // language, which is not something the authoring flow ever does.
    const flatten = (tree: unknown, prefix = '', out = new Set<string>()) => {
      for (const [key, value] of Object.entries((tree ?? {}) as Record<string, unknown>)) {
        const full = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value))
          flatten(value, full, out)
        else out.add(full)
      }
      return out
    }
    const scoped = (tree: unknown) =>
      [...flatten(tree)].filter(key => key.startsWith('providerRegistry.') || key.startsWith('sections.'))

    const enKeys = new Set(scoped(en))
    const zhKeys = new Set(scoped(zh))
    expect(enKeys.size).toBeGreaterThan(500)
    expect([...enKeys].filter(key => !zhKeys.has(key))).toEqual([])
    expect([...zhKeys].filter(key => !enKeys.has(key))).toEqual([])
  })
})
