import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A native dependency that compiles from source must be optional (#602).
 *
 * `extract-file-icon` ships no prebuilds and pins `node-addon-api` to an exact `1.7.1`, so it runs
 * node-gyp against the host toolchain on every install. Sitting in `dependencies`, that made
 * `pnpm install` fail for the **whole workspace** on any machine without Xcode CLT / MSVC /
 * build-essential, and on any CI image that trims build tools.
 *
 * Moving it costs nothing, which is the part worth pinning: its only consumer already loads it
 * through a dynamic `import()` inside a try/catch and falls back to `null` — a file with no icon —
 * and plugins are *denied* the module outright, so nothing else can depend on it either.
 *
 * The rule generalises: if a native module without prebuilds is required rather than optional, one
 * missing compiler stops the entire install.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const CORE_APP = path.join(REPO_ROOT, 'apps/core-app')

const manifest = JSON.parse(readFileSync(path.join(CORE_APP, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  optionalDependencies: Record<string, string>
}

/** Native modules that build from source or ship platform binaries. */
const NATIVE = ['extract-file-icon', 'uiohook-napi', '@crosscopy/clipboard']

describe('native dependencies', () => {
  it('reads the manifest it means to check', () => {
    // Positive control: "none of them is in dependencies" is also what an unreadable file reports.
    expect(Object.keys(manifest.dependencies).length).toBeGreaterThan(20)
    expect(manifest.optionalDependencies).toBeDefined()
  })

  it('are optional, so a missing toolchain degrades one feature instead of the install', () => {
    const required = NATIVE.filter((name) => name in manifest.dependencies)

    expect(required).toEqual([])
  })

  it('are actually declared somewhere, not just deleted', () => {
    // Guards the rule above against being satisfied by dropping the dependency entirely.
    for (const name of NATIVE) {
      expect(manifest.optionalDependencies, name).toHaveProperty(name)
    }
  })
})

describe('the icon worker survives the module being absent', () => {
  const source = readFileSync(
    path.join(CORE_APP, 'src/main/modules/box-tool/addon/files/workers/icon-worker.ts'),
    'utf8'
  )

  it('loads it dynamically and tolerates the failure', () => {
    // This is what makes `optional` safe rather than merely convenient. A static import here would
    // turn a missing optional dependency into a worker that cannot start.
    expect(source).toContain("await import('extract-file-icon')")
    expect(source).toMatch(/catch\s*\{\s*\n\s*extractFileIcon = null/)
  })

  it('degrades to no icon rather than throwing', () => {
    expect(source).toContain('extractor ? extractor(next.filePath, next.size) : null')
  })
})
