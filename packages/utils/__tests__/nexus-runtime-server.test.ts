import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  migrateTuffNexusRuntimeServer,
  normalizeTuffNexusRuntimeServer
} from '../env'

/**
 * Both processes must decide the Nexus backend the same way (#522).
 *
 * The policy — resolve `runtimeServer`, fall back to the legacy `authServer`, coerce anything
 * unrecognised to production, then drop the legacy key — was written twice, once in
 * `main/modules/nexus/runtime-base.ts` and once in the renderer's. The copies had already drifted
 * in signature and function set, and a drift in the *policy* would mean the two halves of one
 * application talking to different backends: the renderer showing account state from production
 * while main sends intelligence requests to a local server, or the reverse.
 *
 * Only the policy is shared. How each side obtains and persists `dev` is genuinely different — main
 * reads the config file and writes it back when it changed, the renderer mutates a reactive object
 * — and stays where it is.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

describe('normalizeTuffNexusRuntimeServer', () => {
  it('accepts only an explicit local', () => {
    expect(normalizeTuffNexusRuntimeServer('local')).toBe('local')
  })

  it('coerces everything else to production', () => {
    // Settings come off disk, so the input is whatever an earlier version or a hand edit left.
    for (const value of ['production', 'LOCAL', 'staging', '', null, undefined, 0, {}, []]) {
      expect(normalizeTuffNexusRuntimeServer(value)).toBe('production')
    }
  })
})

describe('migrateTuffNexusRuntimeServer', () => {
  it('promotes the legacy authServer when runtimeServer is absent', () => {
    const dev: Record<string, unknown> = { authServer: 'local' }

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('local')
    expect(dev.runtimeServer).toBe('local')
    expect('authServer' in dev).toBe(false)
  })

  it('prefers runtimeServer when both are present', () => {
    const dev: Record<string, unknown> = { runtimeServer: 'production', authServer: 'local' }

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('production')
    expect('authServer' in dev).toBe(false)
  })

  it('defaults an empty dev block to production', () => {
    const dev: Record<string, unknown> = {}

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('production')
    expect(dev.runtimeServer).toBe('production')
  })

  it('normalises a value that is already stored', () => {
    // The stored value is not trusted either — it was written by whichever version ran last.
    const dev: Record<string, unknown> = { runtimeServer: 'staging' }

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('production')
  })

  it('writes the migration back in place, which is what completes it', () => {
    // Main persists `dev` only when it changed, so the mutation is the migration; a pure function
    // returning a value would leave authServer on disk forever.
    const dev: Record<string, unknown> = { authServer: 'local', autoCloseDev: true }
    migrateTuffNexusRuntimeServer(dev)

    expect(dev).toEqual({ runtimeServer: 'local', autoCloseDev: true })
  })
})

describe('neither process keeps its own copy', () => {
  const sources = ['apps/core-app/src/main/modules/nexus/runtime-base.ts',
    'apps/core-app/src/renderer/src/modules/nexus/runtime-base.ts']
    .map((file) => ({ file, source: readFileSync(path.join(REPO_ROOT, file), 'utf8') }))

  it('reads both files', () => {
    // Positive control: the absence checks below are satisfied by an unreadable path.
    expect(sources).toHaveLength(2)
    for (const { source } of sources) expect(source).toContain('getRuntimeNexusBaseUrl')
  })

  it('calls the shared migration instead of restating it', () => {
    for (const { file, source } of sources) {
      expect(source, file).toContain('migrateTuffNexusRuntimeServer(dev)')
      expect(source, file).not.toContain("value === 'local' ? 'local' : 'production'")
      expect(source, file).not.toContain('dev.authServer')
    }
  })
})
