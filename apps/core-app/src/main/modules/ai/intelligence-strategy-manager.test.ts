import { beforeEach, describe, expect, it } from 'vitest'
import {
  IntelligenceProviderType,
  type IntelligenceInvokeOptions,
  type IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { strategyManager } from './intelligence-strategy-manager'

const providers: IntelligenceProviderConfig[] = [
  {
    id: 'provider-third',
    type: IntelligenceProviderType.LOCAL,
    name: 'Third priority provider',
    enabled: true,
    priority: 30,
    models: ['third-model']
  },
  {
    id: 'provider-first',
    type: IntelligenceProviderType.LOCAL,
    name: 'First priority provider',
    enabled: true,
    priority: 10,
    models: ['first-model']
  },
  {
    id: 'provider-second',
    type: IntelligenceProviderType.LOCAL,
    name: 'Second priority provider',
    enabled: true,
    priority: 20,
    models: ['second-model']
  }
]

async function selectProvider(
  capabilityId: string,
  options: IntelligenceInvokeOptions = {}
): Promise<string> {
  const result = await strategyManager.select({
    capabilityId,
    options,
    availableProviders: providers
  })

  return result.selectedProvider.id
}

describe('intelligence strategy manager', () => {
  beforeEach(() => {
    strategyManager.setDefaultStrategy('adaptive-default')
  })

  it('rotates same-capability selections through providers in ascending priority order', async () => {
    strategyManager.setDefaultStrategy('round-robin')

    const selectedProviderIds: string[] = []
    for (let index = 0; index < 4; index += 1) {
      selectedProviderIds.push(await selectProvider('strategy-test.round-robin-default'))
    }

    expect(selectedProviderIds).toEqual([
      'provider-first',
      'provider-second',
      'provider-third',
      'provider-first'
    ])
  })

  it('uses a per-call round-robin strategy instead of the configured default', async () => {
    strategyManager.setDefaultStrategy('priority')

    const selectedProviderIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      selectedProviderIds.push(
        await selectProvider('strategy-test.round-robin-override', { strategy: 'round-robin' })
      )
    }

    expect(selectedProviderIds).toEqual(['provider-first', 'provider-second', 'provider-third'])
  })

  it('honors an explicit provider preference before round-robin selection', async () => {
    strategyManager.setDefaultStrategy('round-robin')

    await expect(
      selectProvider('strategy-test.explicit-provider', { preferredProviderId: 'provider-third' })
    ).resolves.toBe('provider-third')
  })

  it('honors a model preference before round-robin selection', async () => {
    strategyManager.setDefaultStrategy('round-robin')

    await expect(
      selectProvider('strategy-test.model-preference', { modelPreference: ['second-model'] })
    ).resolves.toBe('provider-second')
  })
})
