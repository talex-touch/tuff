import { describe, expect, it } from 'vitest'
import {
  analyzeAxiomaticMatrix,
  extractRuntimeSignalsFromSource,
  formatAxiomaticMatrixReport
} from './axiomatic-matrix-analyzer'

describe('axiomatic-matrix AST analyzer unit invariants', () => {
  it('captures multiline imports, re-exports, dynamic import(), and require() while ignoring type-only syntax', () => {
    const fixture = `
      import type { FooOnly } from '../ai/intelligence-sdk'
      import {
        type TypeA,
        type TypeB
      } from '../nexus/scene-client'
      import {
        type TypeC,
        runtimeValue
      } from '../box-tool/search-engine/search-core'
      import '../plugin/side-effect'
      export type { ExportedTypeOnly } from '../auth'
      export {
        type PureType,
        liveReexport
      } from '../voice/voice-module'
      export * from '../omni-panel'
      export type * from '../sync'

      type TypeLevelImport = typeof import('../catalog')
      type InlineTypeImport = import('../update').UpdateInfo

      async function loadStuff() {
        const a = await import('../division-box/manager')
        const b = require('../mcp-host/mcp-host-settings')
        return [a, b, runtimeValue, liveReexport]
      }
    `

    const { specifiers, cheats } = extractRuntimeSignalsFromSource(
      fixture,
      '/repo/apps/core-app/src/main/modules/database/sample.ts',
      'modules/database/sample.ts',
      'database/sample.ts'
    )

    expect(cheats).toEqual([])
    expect(specifiers.map((s) => `${s.kind}:${s.specifier}`)).toEqual([
      'import:../box-tool/search-engine/search-core',
      'import:../plugin/side-effect',
      'export:../voice/voice-module',
      'export:../omni-panel',
      'dynamic-import:../division-box/manager',
      'require:../mcp-host/mcp-host-settings'
    ])
  })

  it('flags non-literal dynamic imports, non-literal require(), and globalThis escape hatches', () => {
    const fixture = `
      import { createRequire } from 'node:module'
      const customReq = createRequire(import.meta.url)

      export async function sneaky(name: string) {
        const modA = await import(\`../\${name}/index\`)
        const modB = customReq('../' + name)
        const bridge = (globalThis as Record<string, unknown>).__dp6Bridge
        const okTimer = globalThis.setTimeout(() => {}, 10)
        return [modA, modB, bridge, okTimer]
      }
    `

    const { cheats } = extractRuntimeSignalsFromSource(
      fixture,
      '/repo/apps/core-app/src/main/modules/storage/sneaky.ts',
      'modules/storage/sneaky.ts',
      'storage/sneaky.ts'
    )

    expect(cheats.map((c) => c.kind)).toEqual([
      'non-literal-dynamic-import',
      'non-literal-require',
      'globalThis-escape-hatch'
    ])
  })
})

describe('MIT Axiomatic Design 8x8 Main-Process Design Matrix Contract', () => {
  const report = analyzeAxiomaticMatrix()

  it('maps every top-level file and directory in src/main/modules/', () => {
    expect(report.scannedFiles).toBeGreaterThan(100)
    expect(report.unmappedEntries).toEqual([])
  })

  it('contains zero anti-cheat escape hatches inside src/main/modules/', () => {
    expect(report.cheatViolations).toEqual([])
  })

  it('contains zero transitive module imports smuggled through src/main/shared/ or src/main/db/', () => {
    expect(report.smuggledSharedImports).toEqual([])
  })

  it('enforces a strict Lower-Triangular 8x8 Design Matrix (0 / 28 upper-triangular entries)', () => {
    const formatted = formatAxiomaticMatrixReport(report, { includeEdgeDetails: true })
    if (report.upperTriangularCells > 0 || report.upperTriangularEdges.length > 0) {
      console.error(formatted)
    }
    expect(report.upperTriangularCells).toBe(0)
    expect(report.upperTriangularEdges).toEqual([])
    expect(report.nonTrivialSccs).toEqual([])
  })
})
