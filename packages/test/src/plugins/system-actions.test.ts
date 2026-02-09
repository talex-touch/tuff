import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const systemPlugin = loadPluginModule(new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url))
const { __test: systemTest } = systemPlugin

describe('system actions plugin', () => {
  it('contains full action set on darwin', () => {
    const actions = systemTest.resolveActions('darwin')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('shutdown')
    expect(ids).toContain('restart')
    expect(ids).toContain('lock-screen')
    expect(ids).toContain('volume-up')
    expect(ids).toContain('volume-down')
    expect(ids).toContain('mute')
    expect(ids).toContain('brightness-up')
    expect(ids).toContain('brightness-down')
    expect(ids).toContain('open-main-window')
  })

  it('keeps windows action list without brightness items', () => {
    const actions = systemTest.resolveActions('win32')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('shutdown')
    expect(ids).toContain('restart')
    expect(ids).toContain('open-main-window')
    expect(ids).not.toContain('brightness-up')
    expect(ids).not.toContain('brightness-down')
  })

  it('matches keyword search', () => {
    const actions = systemTest.resolveActions('darwin')
    const matched = systemTest.matchActions(actions, 'shutdown')

    expect(matched.some(action => action.id === 'shutdown')).toBe(true)
  })

  it('returns grouped order by priority', () => {
    const actions = [
      { id: 'a', group: 'window' },
      { id: 'b', group: 'power' },
      { id: 'c', group: 'audio' },
    ]

    const order = systemTest.resolveGroupOrder(actions)
    expect(order).toEqual(['power', 'audio', 'window'])
  })
})
