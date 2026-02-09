import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const quickActionsPlugin = loadPluginModule(new URL('../../../../plugins/touch-quick-actions/index.js', import.meta.url))
const { __test: quickActionsTest } = quickActionsPlugin

describe('quick actions plugin', () => {
  it('returns windows quick actions set', () => {
    const actions = quickActionsTest.resolveActions('win32')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('lock-screen')
    expect(ids).toContain('mute-toggle')
    expect(ids).toContain('notification-settings')
    expect(ids).toContain('display-settings')
  })

  it('matches quick actions by keyword', () => {
    const actions = quickActionsTest.resolveActions('darwin')
    const matched = quickActionsTest.matchActions(actions, '静音')

    expect(matched.some(action => action.id === 'mute-toggle')).toBe(true)
  })

  it('keeps group order instant then settings', () => {
    const order = quickActionsTest.resolveGroupOrder([
      { group: 'settings' },
      { group: 'instant' },
    ])

    expect(order).toEqual(['instant', 'settings'])
  })
})
