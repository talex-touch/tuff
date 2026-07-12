import type { IPluginFeature } from '../plugin'
import { describe, expect, it } from 'vitest'
import { createFeatureSDK } from '../plugin/sdk/feature-sdk'
import {
  createSendModeInteraction,
  withSendMode,
} from '../plugin/sdk/features'

describe('plugin Features SDK helpers', () => {
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

  it('delegates provider consent to the host and fails closed without host support', () => {
    const channel = { regChannel: () => () => {} }
    const sdk = createFeatureSDK(
      {
        isSearchProviderEnabled: (providerId: string) =>
          providerId === 'declared-enabled',
      },
      channel,
    )
    const sdkWithoutHostSupport = createFeatureSDK({}, channel)

    expect(sdk.isSearchProviderEnabled('declared-enabled')).toBe(true)
    expect(sdk.isSearchProviderEnabled('declared-disabled')).toBe(false)
    expect(
      sdkWithoutHostSupport.isSearchProviderEnabled('declared-enabled'),
    ).toBe(false)

    sdk.dispose()
    sdkWithoutHostSupport.dispose()
  })
})
