import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A manifest's `feature.platform` declaration has to actually gate registration (#820).
 *
 * Every shipped manifest writes `{ win32, darwin, linux }` booleans, and for a long time
 * nothing read them: features declared themselves unavailable on a platform and registered
 * there anyway. They avoided misbehaving only because each prelude re-checks
 * `process.platform` on its own, so the user saw the feature, triggered it, and was told it
 * was unsupported.
 *
 * Two things can silently undo that, and they need different guards:
 *
 * - the gate is dropped from the loader — covered by the loader's own unit tests
 * - the *declarations* change, so the gate stops covering the features it was written for —
 *   covered here, against the real manifests
 *
 * Lives in `packages/utils` because `ci / CI - utils` blocks a PR, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const PLUGINS = path.join(REPO_ROOT, 'plugins')
const GATE = path.join(
  REPO_ROOT,
  'apps/core-app/src/main/modules/plugin/feature-platform.ts',
)
const LOADER = path.join(
  REPO_ROOT,
  'apps/core-app/src/main/modules/plugin/plugin-loaders.ts',
)

/** The features that this gate actually removes, and where. */
const EXCLUDED = new Map([
  ['touch-browser-open/browser-open', ['linux']],
  ['touch-quick-actions/quick-actions', ['linux']],
  ['touch-system-actions/system-actions', ['linux']],
  ['touch-orca/orca', ['linux', 'win32']],
  ['touch-window-manager/window-app', ['linux']],
  ['touch-window-presets/window-presets', ['darwin', 'linux']],
])

interface ManifestFeature {
  id?: string
  platform?: Record<string, unknown>
}

function manifests(): Array<{ plugin: string, features: ManifestFeature[] }> {
  const found: Array<{ plugin: string, features: ManifestFeature[] }> = []
  for (const entry of readdirSync(PLUGINS)) {
    const file = path.join(PLUGINS, entry, 'manifest.json')
    if (!statSync(path.join(PLUGINS, entry)).isDirectory())
      continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      found.push({ plugin: entry, features: parsed.features ?? [] })
    }
    catch {
      // No manifest, or an unreadable one — #813 / #814 track those.
    }
  }
  return found
}

/** Every `<plugin>/<feature>` a manifest declares unavailable, and on which platforms. */
function declaredExclusions(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const { plugin, features } of manifests()) {
    for (const feature of features) {
      const platform = feature.platform
      if (!platform || typeof platform !== 'object')
        continue
      const off = Object.entries(platform)
        .filter(([, value]) => value === false)
        .map(([key]) => key)
        .sort()
      if (off.length)
        found.set(`${plugin}/${feature.id}`, off)
    }
  }
  return found
}

describe('manifest feature platform gating', () => {
  it('reads the manifests it means to check', () => {
    // Positive control: "no feature is excluded anywhere" is also what a wrong root reports.
    const all = manifests()
    expect(all.length).toBeGreaterThan(15)
    expect(all.some(entry => entry.features.length > 0)).toBe(true)
  })

  it('is the exact set of features that stop appearing', () => {
    // Written down deliberately: this is the user-visible half of #820. A new `false` here
    // hides a feature from a whole platform, and that should be a decision, not a diff
    // nobody noticed.
    expect(Object.fromEntries([...declaredExclusions()].sort())).toEqual(
      Object.fromEntries([...EXCLUDED].sort()),
    )
  })

  it('only ever excludes on an explicit false', () => {
    // Features without a platform declaration remain available everywhere. Treating "undeclared" as
    // "unavailable" would hide them, so the gate has to be opt-out, not opt-in.
    const source = readFileSync(GATE, 'utf8')

    expect(source).toMatch(/\[platform\] === false/)
  })

  it('runs before the feature is registered, not after', () => {
    // Reporting the exclusion but still calling addFeature would leave the defect in place
    // with a log line on top.
    const loader = readFileSync(LOADER, 'utf8')
    const gateAt = loader.indexOf('isFeatureUnavailableOnPlatform(feature, process.platform)')
    const addAt = loader.indexOf('this.touchPlugin.addFeature(pluginFeature)')

    expect(gateAt).toBeGreaterThan(-1)
    expect(addAt).toBeGreaterThan(gateAt)
    // …and it has to leave the loop, not merely warn.
    expect(loader.slice(gateAt, addAt)).toContain('return')
  })
})
