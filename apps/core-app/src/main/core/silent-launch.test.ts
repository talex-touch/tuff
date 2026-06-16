import { describe, expect, it, vi } from 'vitest'
import {
  HIDDEN_LAUNCH_ARG,
  SILENT_LAUNCH_ARG,
  argvHasSilentLaunchFlag,
  dataHasSilentLaunchFlag,
  resolveSilentLaunchIntent
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
        settings: { window: { startSilent: true } }
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
        settings: { window: { startSilent: true } }
      })
    ).toEqual({ silent: true, source: 'setting' })
  })

  it('falls back to normal launch when no silent signal exists', () => {
    expect(
      resolveSilentLaunchIntent({
        app: { getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: false })) },
        argv: [],
        settings: { window: { startSilent: false } }
      })
    ).toEqual({ silent: false, source: 'none' })
  })
})
