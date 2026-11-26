import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

const { ensureTuffexBuild, shouldSkipTuffexBuild } = require('../ensure-tuffex-build.cjs') as {
  ensureTuffexBuild: (options: {
    env?: Record<string, string | undefined>
    workspaceRoot: string
    runPackageBuild?: (packageName: string) => void
  }) => { built: boolean; skipped: boolean; reason: string }
  shouldSkipTuffexBuild: (options: {
    env?: Record<string, string | undefined>
    workspaceRoot: string
  }) => { skip: boolean; reason: string }
}

const tempRoots: string[] = []

function createWorkspaceFixture(withBuiltArtifacts: boolean): string {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'tuff-ensure-tuffex-'))
  tempRoots.push(workspaceRoot)
  if (withBuiltArtifacts) {
    const esDir = path.join(workspaceRoot, 'packages', 'tuffex', 'dist', 'es')
    mkdirSync(esDir, { recursive: true })
    writeFileSync(path.join(esDir, 'index.d.ts'), 'export {}\n')
    writeFileSync(path.join(esDir, 'index.js'), 'export {}\n')
  }
  return workspaceRoot
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ensureTuffexBuild', () => {
  it('builds @talex-touch/tuffex for standalone local runs when TUFF_SKIP_TUFFEX_BUILD is unset', () => {
    const workspaceRoot = createWorkspaceFixture(true)
    const builtPackages: string[] = []

    const result = ensureTuffexBuild({
      env: {},
      workspaceRoot,
      runPackageBuild: (pkg) => builtPackages.push(pkg)
    })

    expect(result).toEqual({ built: true, skipped: false, reason: 'flag-not-set' })
    expect(builtPackages).toEqual(['@talex-touch/tuffex'])
  })

  it('reuses prebuilt @talex-touch/tuffex artifacts when TUFF_SKIP_TUFFEX_BUILD=1 and dist exists', () => {
    const workspaceRoot = createWorkspaceFixture(true)
    const builtPackages: string[] = []

    const result = ensureTuffexBuild({
      env: { TUFF_SKIP_TUFFEX_BUILD: '1' },
      workspaceRoot,
      runPackageBuild: (pkg) => builtPackages.push(pkg)
    })

    expect(result).toEqual({ built: false, skipped: true, reason: 'prebuilt-artifacts-present' })
    expect(builtPackages).toEqual([])
  })

  it('still builds @talex-touch/tuffex when TUFF_SKIP_TUFFEX_BUILD=1 but dist artifacts are missing', () => {
    const workspaceRoot = createWorkspaceFixture(false)
    const builtPackages: string[] = []

    expect(
      shouldSkipTuffexBuild({ env: { TUFF_SKIP_TUFFEX_BUILD: 'true' }, workspaceRoot })
    ).toEqual({ skip: false, reason: 'artifacts-missing' })

    const result = ensureTuffexBuild({
      env: { TUFF_SKIP_TUFFEX_BUILD: 'true' },
      workspaceRoot,
      runPackageBuild: (pkg) => builtPackages.push(pkg)
    })

    expect(result).toEqual({ built: true, skipped: false, reason: 'artifacts-missing' })
    expect(builtPackages).toEqual(['@talex-touch/tuffex'])
  })
})
