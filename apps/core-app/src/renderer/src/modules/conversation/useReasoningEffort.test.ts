/**
 * The composer's reasoning effort as the renderer stores and reads it: one global value in
 * `appSetting.conversation`, auto when missing, written alone, and never rewritten by a model switch.
 * `useModelOptions` keeps module-scope state, so every test re-imports after `resetModules`.
 */
import type { ProviderModelOption } from './useModelOptions'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  it('reads a profile written before the setting existed as auto', async () => {
    const { effort } = await setup()
    expect(effort.setting.value).toBe('auto')
    expect(effort.pillLevel.value).toBeNull()

    resetAppSetting({ model: null, favoriteModels: [], reasoningEffort: 'turbo' })
    expect(effort.setting.value).toBe('auto')
  })

  it('writes only its own key', async () => {
    const { effort } = await setup()
    effort.select('high')
    await nextTick()

    expect(appSetting.conversation).toEqual({
      model: null,
      favoriteModels: [],
      reasoningEffort: 'high'
    })
    expect(effort.setting.value).toBe('high')
  })

  it('creates the block on a profile that lacks it', async () => {
    resetAppSetting()
    const { effort } = await setup()
    effort.select('low')
    await nextTick()

    expect(appSetting.conversation).toEqual({
      model: null,
      favoriteModels: [],
      reasoningEffort: 'low'
    })
  })

  it('keeps the stored level across a switch to a model that cannot take it', async () => {
    const { effort, models } = await setup()
    effort.select('max')
    models.select({
      ...GPT_55,
      providerName: 'OpenAI',
      providerType: 'openai',
      displayName: 'gpt-5.5',
      source: null
    })
    await nextTick()
    expect(effort.pillLevel.value).toBe('max')
    expect(effort.row.value.disabled).toBe(false)

    models.select({
      ...GPT_4O,
      providerName: 'OpenAI',
      providerType: 'openai',
      displayName: 'gpt-4o',
      source: null
    })
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
