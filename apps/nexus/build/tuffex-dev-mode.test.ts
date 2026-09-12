import { describe, expect, it } from 'vitest'
import { isTuffexSourceRequested, resolveTuffexDevMode } from './tuffex-dev-mode'

describe('isTuffexSourceRequested', () => {
  it.each(['1', 'true', 'yes', 'on', 'TRUE', ' true '])(
    'treats %s as a source request in dev',
    (value) => {
      expect(isTuffexSourceRequested(true, { NUXT_TUFFEX_SOURCE: value })).toBe(true)
    },
  )

  it.each([undefined, '0', 'false', ''])(
    'does not treat %s as a source request in dev',
    (value) => {
      expect(isTuffexSourceRequested(true, { NUXT_TUFFEX_SOURCE: value })).toBe(false)
    },
  )

  it('never requests source outside dev, even when the flag is set', () => {
    expect(isTuffexSourceRequested(false, { NUXT_TUFFEX_SOURCE: 'true' })).toBe(false)
  })
})

describe('resolveTuffexDevMode', () => {
  it('prefers tuffex source in dev when the flag is set', () => {
    expect(resolveTuffexDevMode({
      isDev: true,
      env: { NUXT_TUFFEX_SOURCE: '1' },
      distEntryExists: true,
    })).toBe('source')
  })

  it('uses the built tuffex dist in dev by default', () => {
    expect(resolveTuffexDevMode({
      isDev: true,
      env: {},
      distEntryExists: true,
    })).toBe('dist')
  })

  it('tells dev how to build dist or opt into source when dist is missing', () => {
    let message = ''
    try {
      resolveTuffexDevMode({ isDev: true, env: {}, distEntryExists: false })
    }
    catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain('pnpm -C packages/tuffex run build')
    expect(message).toContain('NUXT_TUFFEX_SOURCE')
  })

  it('uses dist in production even when the flag is set or dist is absent', () => {
    expect(resolveTuffexDevMode({
      isDev: false,
      env: { NUXT_TUFFEX_SOURCE: 'true' },
      distEntryExists: true,
    })).toBe('dist')

    expect(resolveTuffexDevMode({
      isDev: false,
      env: {},
      distEntryExists: false,
    })).toBe('dist')
  })
})
