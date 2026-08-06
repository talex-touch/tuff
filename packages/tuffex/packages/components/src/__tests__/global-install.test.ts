import { createApp } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import install from '../index'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('global install', () => {
  it('registers components without warning on non-plugin exports', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = createApp({ render: () => null })

    app.use(install)

    // The barrel re-exports injection-key symbols alongside components; Vue
    // warns "A plugin must either be a function or an object with an install
    // function" for each one that reaches app.use.
    const pluginWarnings = warn.mock.calls
      .map(args => String(args[0]))
      .filter(message => message.includes('plugin must either be a function'))
    expect(pluginWarnings).toEqual([])

    expect(app.component('TxButton')).toBeTruthy()
    expect(app.component('TxRating')).toBeTruthy()
  })

  it('only hands plugin-shaped exports to app.use', () => {
    const used: unknown[] = []
    const fakeApp = {
      use(plugin: unknown) {
        used.push(plugin)
        return fakeApp
      },
      component: () => undefined,
    }

    install(fakeApp as never)

    expect(used.length).toBeGreaterThan(0)
    // Vue treats any function as an install function, so an unfiltered loop
    // called exported helpers with the App as their first argument (e.g.
    // createPositionCache(app)) and warned on injection-key symbols.
    const offenders = used.filter(
      value => typeof (value as { install?: unknown })?.install !== 'function',
    )
    expect(offenders).toEqual([])
  })
})
