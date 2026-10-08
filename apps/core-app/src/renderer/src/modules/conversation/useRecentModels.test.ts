// @vitest-environment jsdom
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ appSettingTarget: {} as Record<string, unknown> }))

vi.mock('~/modules/storage/app-storage', async () => {
  const { reactive } = await import('vue')
  return { appSetting: reactive(mocks.appSettingTarget) }
})

const appSetting = reactive(mocks.appSettingTarget)

const A = { providerId: 'pi-cli', model: 'codex/gpt-6-astra' }
const B = { providerId: 'pi-cli', model: 'kimi/k3' }
const C = { providerId: 'ollama', model: 'qwen2.5:3b' }

beforeEach(() => {
  for (const key of Object.keys(appSetting)) delete appSetting[key]
})

describe('useRecentModels', () => {
  it('reads an absent or malformed list as empty, dropping bad entries and later duplicates', async () => {
    const { useRecentModels } = await import('./useRecentModels')
    expect(useRecentModels().recents.value).toEqual([])

    appSetting.conversation = {
      model: null,
      favoriteModels: [],
      recentModels: [A, { providerId: '' }, 'nope', B, { ...A }]
    }
    expect(useRecentModels().recents.value).toEqual([A, B])
  })

  it('records newest first, moves a repeat to the front and keeps at most five', async () => {
    const { RECENT_MODELS_LIMIT, useRecentModels } = await import('./useRecentModels')
    appSetting.conversation = { model: null, favoriteModels: [] }
    const { recents, record } = useRecentModels()

    record(A)
    record(B)
    record({ ...A, displayName: 'gpt-6-astra' } as typeof A)
    expect(recents.value).toEqual([A, B])
    // Only the two identifying fields are stored, never a choice's display fields.
    expect((appSetting.conversation as Record<string, unknown>).recentModels).toEqual([A, B])

    for (let index = 0; index < RECENT_MODELS_LIMIT + 2; index += 1) {
      record({ providerId: 'ollama', model: `m${index}` })
    }
    record(C)
    expect(recents.value).toHaveLength(RECENT_MODELS_LIMIT)
    expect(recents.value[0]).toEqual(C)
  })

  it('creates the conversation block on first write when the profile lacks it', async () => {
    const { useRecentModels } = await import('./useRecentModels')
    useRecentModels().record(B)

    expect((appSetting.conversation as Record<string, unknown>).recentModels).toEqual([B])
    expect((appSetting.conversation as Record<string, unknown>).favoriteModels).toEqual([])
  })
})
