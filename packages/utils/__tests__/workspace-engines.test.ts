import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A published package must not advertise a Node floor the repo never tests (#591).
 *
 * Six packages declared `>=24.0.0` while the root declares `>=24.15.0` and every workflow pins
 * `.node-version` (24.18.0), so 24.0–24.14 was an advertised support window that nothing had ever
 * run. A consumer on 24.0 installs without an EBADENGINE warning and meets whatever 24.x
 * behaviour the code assumes.
 *
 * The rule is deliberately "if you declare it, match the root" rather than "everyone must declare
 * it": apps/core-app and apps/nexus carry no engines field, and requiring one would be a different
 * decision than this issue asked for.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const PACKAGE_ROOTS = ['packages', 'apps', 'plugins']

function rootEngine(): string {
  const root = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
  return root.engines?.node
}

function declaredEngines(): Array<{ manifest: string; node: string }> {
  const found: Array<{ manifest: string; node: string }> = []

  for (const group of PACKAGE_ROOTS) {
    const dir = path.join(REPO_ROOT, group)
    if (!existsSync(dir)) continue

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = path.join(dir, entry.name, 'package.json')
      if (!existsSync(manifest)) continue

      const node = JSON.parse(readFileSync(manifest, 'utf8')).engines?.node
      if (typeof node === 'string')
        found.push({ manifest: path.relative(REPO_ROOT, manifest), node })
    }
  }

  return found
}

describe('workspace engines', () => {
  it('reads the manifests it claims to check', () => {
    // Positive control: the assertion below is "nothing disagrees", which an empty list satisfies.
    const declared = declaredEngines()

    expect(rootEngine()).toMatch(/^>=\d+\.\d+\.\d+$/)
    expect(declared.length).toBeGreaterThan(3)
    expect(declared.map((entry) => entry.manifest)).toContain('packages/utils/package.json')
  })

  it('agrees with the root floor wherever engines.node is declared', () => {
    const expected = rootEngine()
    const disagreeing = declaredEngines().filter((entry) => entry.node !== expected)

    expect(disagreeing.map((entry) => `${entry.manifest}: ${entry.node}`)).toEqual([])
  })

  it('keeps the root floor within the pinned toolchain version', () => {
    // The floor is only meaningful if CI actually runs at or above it. .node-version is what every
    // workflow resolves through `node-version-file`.
    const pinned = readFileSync(path.join(REPO_ROOT, '.node-version'), 'utf8').trim()
    const floor = rootEngine().replace('>=', '')

    const toParts = (value: string): number[] => value.split('.').map(Number)
    const [pinnedMajor, pinnedMinor] = toParts(pinned)
    const [floorMajor, floorMinor] = toParts(floor)

    expect(pinnedMajor).toBe(floorMajor)
    expect(pinnedMinor).toBeGreaterThanOrEqual(floorMinor!)
  })
})
