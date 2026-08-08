import { describe, expect, it } from 'vitest'
import {
  applyTuffNexusRuntimeServerMigration,
  normalizeTuffNexusRuntimeServer,
} from '../env'

/**
 * This policy was implemented twice -- once for the main process, once for the renderer -- and
 * the two had already drifted (#522). Now that both call one function, the behaviour needs
 * asserting once rather than being inferred from two call sites.
 */

describe('normalizeTuffNexusRuntimeServer', () => {
  it('treats only the exact string "local" as local', () => {
    expect(normalizeTuffNexusRuntimeServer('local')).toBe('local')
  })

  it.each([['production'], ['LOCAL'], ['Local'], [''], ['staging']])(
    'coerces %o to production',
    (value) => {
      expect(normalizeTuffNexusRuntimeServer(value)).toBe('production')
    },
  )

  it('coerces non-strings to production rather than trusting them', () => {
    // The failure mode this guards is a corrupted settings file silently selecting a
    // non-production backend.
    for (const value of [undefined, null, 0, 1, true, {}, []])
      expect(normalizeTuffNexusRuntimeServer(value)).toBe('production')
  })
})

describe('applyTuffNexusRuntimeServerMigration', () => {
  it('adopts the retired authServer when runtimeServer is absent', () => {
    const dev = { authServer: 'local' as const }

    expect(applyTuffNexusRuntimeServerMigration(dev)).toBe('local')
    expect(dev.runtimeServer).toBe('local')
    expect('authServer' in dev).toBe(false)
  })

  it('prefers runtimeServer over authServer when both exist', () => {
    const dev = { runtimeServer: 'production' as const, authServer: 'local' as const }

    expect(applyTuffNexusRuntimeServerMigration(dev)).toBe('production')
    expect('authServer' in dev).toBe(false)
  })

  it('defaults to production when neither is set', () => {
    const dev: Record<string, unknown> = {}

    expect(applyTuffNexusRuntimeServerMigration(dev)).toBe('production')
    expect(dev.runtimeServer).toBe('production')
  })

  it('drops authServer even when it is the value being adopted', () => {
    // Leaving it behind would let a later read resurrect the retired field.
    const dev = { authServer: 'local' as const }

    applyTuffNexusRuntimeServerMigration(dev)

    expect(Object.keys(dev)).toEqual(['runtimeServer'])
  })

  it('leaves unrelated dev settings untouched', () => {
    const dev = { authServer: 'local' as const, developerMode: true, autoCloseDev: false }

    applyTuffNexusRuntimeServerMigration(dev)

    expect(dev.developerMode).toBe(true)
    expect(dev.autoCloseDev).toBe(false)
  })
})
