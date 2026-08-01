import { describe, expect, it, vi } from 'vitest'
import {
  argvHasSilentLaunchFlag,
  dataHasSilentLaunchFlag,
  HIDDEN_LAUNCH_ARG,
  resolveSilentLaunchIntent,
  SILENT_LAUNCH_ARG
} from './silent-launch'

describe('silent launch intent', () => {
  it('detects explicit silent launch argv flags', () => {
    expect(argvHasSilentLaunchFlag(['/Applications/tuff.app', SILENT_LAUNCH_ARG])).toBe(true)
    expect(argvHasSilentLaunchFlag(['/Applications/tuff.app', HIDDEN_LAUNCH_ARG])).toBe(true)
    expect(argvHasSilentLaunchFlag(['/Applications/tuff.app'])).toBe(false)
  })

  it('detects secondary launch data flags', () => {
    expect(dataHasSilentLaunchFlag({ silent: true })).toBe(true)
    expect(dataHasSilentLaunchFlag({ hidden: true })).toBe(true)
    expect(dataHasSilentLaunchFlag({ startSilent: true })).toBe(true)
    expect(dataHasSilentLaunchFlag({ silent: false })).toBe(false)
  })

  it('prioritizes data, argv, login-item and setting sources', () => {
    const app = {
      getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: true }))
    }

    expect(
      resolveSilentLaunchIntent({
        app,
        argv: [],
        data: { silent: true },
        settings: { beginner: { init: true }, window: { startSilent: true } }
      })
    ).toEqual({ silent: true, source: 'secondary-data' })

    expect(resolveSilentLaunchIntent({ app, argv: [SILENT_LAUNCH_ARG], settings: null })).toEqual({
      silent: true,
      source: 'argv'
    })

    expect(resolveSilentLaunchIntent({ app, argv: [], settings: null })).toEqual({
      silent: true,
      source: 'login-item'
    })

    expect(
      resolveSilentLaunchIntent({
        app: { getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: false })) },
        argv: [],
        settings: { beginner: { init: true }, window: { startSilent: true } }
      })
    ).toEqual({ silent: true, source: 'setting' })
  })

  it('uses the enabled default after onboarding and preserves explicit false', () => {
    const app = { getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: false })) }

    expect(
      resolveSilentLaunchIntent({
        app,
        argv: [],
        settings: { beginner: { init: true }, window: {} }
      })
    ).toEqual({ silent: true, source: 'setting' })

    expect(
      resolveSilentLaunchIntent({
        app,
        argv: [],
        settings: { beginner: { init: true }, window: { startSilent: false } }
      })
    ).toEqual({ silent: false, source: 'none' })
  })

  it('keeps the first-run guide visible when onboarding is incomplete or missing', () => {
    const app = { getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: false })) }
    const incompleteSettings = [
      { beginner: { init: false }, window: { startSilent: true } },
      { beginner: { init: false }, window: {} },
      { window: { startSilent: true } },
      { window: {} }
    ]

    for (const settings of incompleteSettings) {
      expect(
        resolveSilentLaunchIntent({
          app,
          argv: [],
          settings
        })
      ).toEqual({ silent: false, source: 'none' })
    }
  })

  it('falls back to normal launch when settings are unavailable or silent start is disabled', () => {
    const app = { getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: false })) }

    expect(
      resolveSilentLaunchIntent({
        app,
        argv: [],
        settings: null
      })
    ).toEqual({ silent: false, source: 'none' })

    expect(
      resolveSilentLaunchIntent({
        app,
        argv: [],
        settings: { beginner: { init: true }, window: { startSilent: false } }
      })
    ).toEqual({ silent: false, source: 'none' })
  })
})
