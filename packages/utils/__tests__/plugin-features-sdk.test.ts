import { describe, expect, it } from 'vitest'
import { createSendModeInteraction, withSendMode } from '../plugin/sdk/features'
import type { IPluginFeature } from '../plugin'

describe('Plugin Features SDK helpers', () => {
  it('enables send mode without dropping interaction fields', () => {
    expect(
      createSendModeInteraction({
        type: 'webcontent',
        path: '/assistant',
        showInput: true,
        allowInput: true,
      }),
    ).toEqual({
      type: 'webcontent',
      path: '/assistant',
      showInput: true,
      allowInput: true,
      sendMode: true,
    })
  })

  it('adds a default widget send interaction when feature has no interaction', () => {
    const feature = withSendMode<IPluginFeature>({
      id: 'ask',
      name: 'Ask',
      desc: 'Ask assistant',
      icon: { type: 'emoji', value: '✨' },
      push: true,
      platform: {},
      commands: [],
    })

    expect(feature.interaction).toEqual({ type: 'widget', sendMode: true })
  })
})
