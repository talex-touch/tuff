/**
 * The composer's reasoning effort is stored globally and never rewritten by a model switch.
 * `useModelOptions` keeps module-scope state, so every test re-imports after `resetModules`.
 */
import type { ProviderModelOption } from './useModelOptions'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { resolveProviderEffectiveModel } from '../../../../main/modules/ai/model-request-plan'

const mocks = vi.hoisted(() => ({
  getProviderModelOptions: vi.fn<() => Promise<ProviderModelOption[]>>(),
  appSettingTarget: {} as Record<string, unknown>
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    getProviderModelOptions: mocks.getProviderModelOptions
  })
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const { reactive } = await import('vue')
  return {
    appSetting: reactive(mocks.appSettingTarget),
    appSettingStore: {
      isHydrated: () => true,
      whenHydrated: async () => undefined
    }
  }
})

const appSetting = reactive(mocks.appSettingTarget)

const GPT_55 = { providerId: 'openai-default', model: 'gpt-5.5' }
const GPT_4O = { providerId: 'openai-default', model: 'gpt-4o' }

function providerOptions(): ProviderModelOption[] {
  return [
    {
      providerId: 'openai-default',
      providerName: 'OpenAI',
      providerType: 'openai',
      models: ['gpt-5.5', 'gpt-4o'],
      effectiveModels: ['gpt-5.5', 'gpt-4o'].map((model) =>
        resolveProviderEffectiveModel(
          {
            id: 'openai-default',
            name: 'OpenAI',
            type: IntelligenceProviderType.OPENAI,
            enabled: true,
            models: [{ id: 'gpt-5.5' }, { id: 'gpt-4o' }]
          },
          model
        )
      ),
      available: true
    }
  ]
}

function resetAppSetting(conversation?: Record<string, unknown>): void {
  for (const key of Object.keys(appSetting)) delete appSetting[key]
  if (conversation) appSetting.conversation = conversation
}

async function setup() {
  const { useReasoningEffort } = await import('./useReasoningEffort')
  const { useModelOptions } = await import('./useModelOptions')
  const effort = useReasoningEffort()
  const models = useModelOptions()
  await models.load()
  return { effort, models }
}

beforeEach(() => {
  vi.resetModules()
  mocks.getProviderModelOptions.mockReset()
  mocks.getProviderModelOptions.mockResolvedValue(providerOptions())
  resetAppSetting({ model: null, favoriteModels: [] })
})

describe('useReasoningEffort', () => {
  it('keeps the stored level across a switch to a model that cannot take it', async () => {
    const { effort, models } = await setup()
    effort.select('max')
    models.select(GPT_55)
    await nextTick()
    expect(effort.pillLevel.value).toBe('max')
    expect(effort.row.value.disabled).toBe(false)

    models.select(GPT_4O)
    await nextTick()
    expect(effort.row.value).toEqual({
      disabled: true,
      note: { kind: 'unsupported-model' },
      pillLevel: null
    })
    // Not sent there, but not forgotten either: the next model that can take it gets it back.
    expect((appSetting.conversation as Record<string, unknown>).reasoningEffort).toBe('max')
  })
})
