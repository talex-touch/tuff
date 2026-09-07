import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  /** Raw target; both the mocked module and the assertions below wrap it with `reactive`. */
  appSettingTarget: {} as Record<string, unknown>
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const { reactive } = await import('vue')
  return { appSetting: reactive(mocks.appSettingTarget) }
})

import { useModelFavorites } from './useModelFavorites'

/** Vue hands out one proxy per target, so this is the very object the composable writes to. */
const appSetting = reactive(mocks.appSettingTarget)

const PI_ASTRA = { providerId: 'pi-cli', model: 'codex/gpt-6-astra' }
const LOCAL_QWEN = { providerId: 'ollama', model: 'qwen2.5:3b' }

function resetAppSetting(conversation?: Record<string, unknown>): void {
  for (const key of Object.keys(appSetting)) delete appSetting[key]
  if (conversation) appSetting.conversation = conversation
}

beforeEach(() => {
  resetAppSetting({ model: null, favoriteModels: [] })
})

describe('useModelFavorites', () => {
  it('stars and unstars a model, persisting only its identifying fields', async () => {
    const { favorites, isFavorite, toggle } = useModelFavorites()
    expect(favorites.value).toEqual([])

    // A full menu row, not just a ref: only the two identifying fields may reach storage.
    const choice = { ...PI_ASTRA, providerName: 'Pi (local CLI)', displayName: 'gpt-6-astra' }
    toggle(choice)
    await nextTick()

    expect(isFavorite(PI_ASTRA)).toBe(true)
    expect(favorites.value).toEqual([PI_ASTRA])
    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [PI_ASTRA] })

    toggle(PI_ASTRA)
    await nextTick()

    expect(isFavorite(PI_ASTRA)).toBe(false)
    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [] })
  })

  it('appends in star order and removes only the toggled model', async () => {
    const { favorites, toggle } = useModelFavorites()

    toggle(PI_ASTRA)
    toggle(LOCAL_QWEN)
    await nextTick()
    expect(favorites.value).toEqual([PI_ASTRA, LOCAL_QWEN])

    toggle(PI_ASTRA)
    await nextTick()
    expect(favorites.value).toEqual([LOCAL_QWEN])
  })

  it('reads a duplicated or malformed stored list as one clean list, and writes it back clean', async () => {
    resetAppSetting({
      model: null,
      favoriteModels: [PI_ASTRA, { providerId: 'pi-cli' }, { ...PI_ASTRA }, 'junk', LOCAL_QWEN]
    })
    const { favorites, isFavorite, toggle } = useModelFavorites()

    expect(favorites.value).toEqual([PI_ASTRA, LOCAL_QWEN])
    expect(isFavorite(PI_ASTRA)).toBe(true)

    toggle(PI_ASTRA)
    await nextTick()

    expect(isFavorite(PI_ASTRA)).toBe(false)
    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [LOCAL_QWEN] })
  })

  it('is shared across instances because the settings block is the only state', async () => {
    const first = useModelFavorites()
    const second = useModelFavorites()

    first.toggle(LOCAL_QWEN)
    await nextTick()

    expect(second.isFavorite(LOCAL_QWEN)).toBe(true)
    expect(second.favorites.value).toEqual([LOCAL_QWEN])
  })

  it('tolerates a profile without the conversation block and creates it on the first star', async () => {
    resetAppSetting()
    const { favorites, isFavorite, toggle } = useModelFavorites()

    expect(favorites.value).toEqual([])
    expect(isFavorite(PI_ASTRA)).toBe(false)

    toggle(PI_ASTRA)
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [PI_ASTRA] })
    expect(favorites.value).toEqual([PI_ASTRA])
  })

  it('leaves the persisted model selection alone when toggling', async () => {
    resetAppSetting({ model: { ...LOCAL_QWEN }, favoriteModels: [] })
    const { toggle } = useModelFavorites()

    toggle(PI_ASTRA)
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: LOCAL_QWEN, favoriteModels: [PI_ASTRA] })
  })
})
