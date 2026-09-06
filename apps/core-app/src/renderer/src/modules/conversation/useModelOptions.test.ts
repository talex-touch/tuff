/**
 * Selection state moved from a session-scoped ref to `appSetting.conversation` (task
 * 09-06-home-model-menu-v2). The rules under test: a stored model is applied only once the
 * options have loaded and it resolves against them; when it does not resolve the pill and the
 * send path fall back to auto but the stored value survives, so a provider that comes back
 * (the pi CLI restarted) brings the user's choice back with it.
 *
 * The composable keeps module-scope state, so every test re-imports it after `resetModules`.
 */
import type { ProviderModelOption } from './useModelOptions'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProviderModelOptions: vi.fn<() => Promise<ProviderModelOption[]>>(),
  /** Raw target; both the mocked module and the assertions below wrap it with `reactive`. */
  appSettingTarget: {} as Record<string, unknown>,
  isHydrated: vi.fn(() => true),
  whenHydrated: vi.fn<() => Promise<void>>(async () => undefined)
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
      isHydrated: mocks.isHydrated,
      whenHydrated: mocks.whenHydrated
    }
  }
})

/** Vue hands out one proxy per target, so this is the very object the composable writes to. */
const appSetting = reactive(mocks.appSettingTarget)

const PI_ASTRA = { providerId: 'pi-cli', model: 'codex/gpt-6-astra' }
const LOCAL_QWEN = { providerId: 'ollama', model: 'qwen2.5:3b' }

function providerOptions(): ProviderModelOption[] {
  return [
    {
      providerId: 'pi-cli',
      providerName: 'Pi (local CLI)',
      providerType: 'local',
      models: ['codex/gpt-6-astra', 'DeepSeekOfficial/deepseek-v4-flash'],
      available: true
    },
    {
      providerId: 'ollama',
      providerName: 'Local Model',
      providerType: 'local',
      models: ['qwen2.5:3b'],
      available: true
    },
    {
      providerId: 'openai',
      providerName: 'OpenAI',
      providerType: 'openai',
      models: ['gpt-4o-mini'],
      available: false
    }
  ]
}

function resetAppSetting(conversation?: Record<string, unknown>): void {
  for (const key of Object.keys(appSetting)) delete appSetting[key]
  if (conversation) appSetting.conversation = conversation
}

async function importComposable() {
  return (await import('./useModelOptions')).useModelOptions
}

beforeEach(() => {
  vi.resetModules()
  mocks.getProviderModelOptions.mockReset()
  mocks.getProviderModelOptions.mockResolvedValue(providerOptions())
  mocks.isHydrated.mockReset()
  mocks.isHydrated.mockReturnValue(true)
  mocks.whenHydrated.mockReset()
  mocks.whenHydrated.mockResolvedValue(undefined)
  resetAppSetting({ model: null, favoriteModels: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('choices', () => {
  it('flattens available providers in arrival order, deriving source and display name per id', async () => {
    const useModelOptions = await importComposable()
    const { choices, load } = useModelOptions()

    await load()

    expect(choices.value).toEqual([
      {
        providerId: 'pi-cli',
        providerName: 'Pi (local CLI)',
        providerType: 'local',
        model: 'codex/gpt-6-astra',
        source: 'codex',
        displayName: 'gpt-6-astra'
      },
      {
        providerId: 'pi-cli',
        providerName: 'Pi (local CLI)',
        providerType: 'local',
        model: 'DeepSeekOfficial/deepseek-v4-flash',
        source: 'DeepSeekOfficial',
        displayName: 'deepseek-v4-flash'
      },
      {
        providerId: 'ollama',
        providerName: 'Local Model',
        providerType: 'local',
        model: 'qwen2.5:3b',
        source: null,
        displayName: 'qwen2.5:3b'
      }
    ])
  })

  it('shares one option list between callers, as the two pills are one control', async () => {
    const useModelOptions = await importComposable()
    const first = useModelOptions()
    const second = useModelOptions()

    await first.load()

    expect(second.loaded.value).toBe(true)
    expect(second.choices.value).toHaveLength(3)
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)
  })
})

describe('persisted selection', () => {
  it('resolves a stored model against the loaded choices and pins it for routing', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const useModelOptions = await importComposable()
    const { load, persistedSelection, resolvedChoice, routing, isSelected } = useModelOptions()

    await load()

    expect(persistedSelection.value).toEqual(PI_ASTRA)
    expect(resolvedChoice.value).toMatchObject({ ...PI_ASTRA, displayName: 'gpt-6-astra' })
    expect(routing.value).toEqual(PI_ASTRA)
    expect(isSelected(PI_ASTRA)).toBe(true)
    expect(isSelected(LOCAL_QWEN)).toBe(false)
  })

  it('falls back to auto while the options have not loaded, even with a stored model', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const useModelOptions = await importComposable()
    const { loaded, resolvedChoice, routing, persistedSelection } = useModelOptions()

    expect(loaded.value).toBe(false)
    expect(resolvedChoice.value).toBeUndefined()
    expect(routing.value).toEqual({})
    // The stored value is still visible as such; only its effect waits for the load.
    expect(persistedSelection.value).toEqual(PI_ASTRA)
  })

  it('falls back to auto when the stored model is not on offer, without clearing it', async () => {
    const stale = { providerId: 'pi-cli', model: 'codex/gpt-7-nova' }
    resetAppSetting({ model: { ...stale }, favoriteModels: [] })
    const useModelOptions = await importComposable()
    const { load, resolvedChoice, routing, persistedSelection } = useModelOptions()

    await load()

    expect(resolvedChoice.value).toBeUndefined()
    expect(routing.value).toEqual({})
    expect(persistedSelection.value).toEqual(stale)
    expect(appSetting.conversation).toEqual({ model: stale, favoriteModels: [] })
  })

  it('resolves again once a reload brings the provider back', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    mocks.getProviderModelOptions.mockResolvedValueOnce(
      providerOptions().filter((option) => option.providerId !== 'pi-cli')
    )
    const useModelOptions = await importComposable()
    const { load, resolvedChoice } = useModelOptions()

    await load()
    expect(resolvedChoice.value).toBeUndefined()

    await load(true)
    expect(resolvedChoice.value).toMatchObject(PI_ASTRA)
  })

  it('ignores a stored value that is not a model ref', async () => {
    resetAppSetting({ model: { providerId: 'pi-cli' }, favoriteModels: [] })
    const useModelOptions = await importComposable()
    const { load, persistedSelection, routing } = useModelOptions()

    await load()

    expect(persistedSelection.value).toBeNull()
    expect(routing.value).toEqual({})
  })
})

describe('select', () => {
  it('writes only the two identifying fields of a choice, and null for auto', async () => {
    const useModelOptions = await importComposable()
    const { load, choices, select, isSelected, routing, resolvedChoice } = useModelOptions()
    await load()

    select(choices.value[0])
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: PI_ASTRA, favoriteModels: [] })
    expect(isSelected(PI_ASTRA)).toBe(true)
    expect(resolvedChoice.value).toBe(choices.value[0])
    expect(routing.value).toEqual(PI_ASTRA)

    select(null)
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [] })
    expect(isSelected(PI_ASTRA)).toBe(false)
    expect(routing.value).toEqual({})
  })

  it('is visible to every caller, so the top bar and composer pills agree', async () => {
    const useModelOptions = await importComposable()
    const first = useModelOptions()
    const second = useModelOptions()
    await first.load()

    first.select(LOCAL_QWEN)
    await nextTick()

    expect(second.isSelected(LOCAL_QWEN)).toBe(true)
    expect(second.routing.value).toEqual(LOCAL_QWEN)
  })

  it('creates the conversation block when an older profile lacks it', async () => {
    resetAppSetting()
    const useModelOptions = await importComposable()
    const { load, persistedSelection, select, isSelected } = useModelOptions()
    await load()

    expect(persistedSelection.value).toBeNull()
    expect(() => isSelected(PI_ASTRA)).not.toThrow()

    select(PI_ASTRA)
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: PI_ASTRA, favoriteModels: [] })
    expect(isSelected(PI_ASTRA)).toBe(true)
  })
})

describe('load', () => {
  it('marks loaded after a failed lookup and leaves the list empty, then retries on the next call', async () => {
    mocks.getProviderModelOptions.mockRejectedValueOnce(new Error('intelligence unavailable'))
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const useModelOptions = await importComposable()
    const { load, loaded, loading, choices, routing } = useModelOptions()

    await load()

    expect(loaded.value).toBe(true)
    expect(loading.value).toBe(false)
    expect(choices.value).toEqual([])
    expect(routing.value).toEqual({})

    await load()

    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(2)
    expect(routing.value).toEqual(PI_ASTRA)
  })

  it('does not refetch after a successful load unless forced', async () => {
    const useModelOptions = await importComposable()
    const { load } = useModelOptions()

    await load()
    await load()
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)

    await load(true)
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(2)
  })

  it('replaces the cached list on a forced reload, so a provider registered later appears', async () => {
    // First load: the pi CLI was not installed yet.
    mocks.getProviderModelOptions.mockResolvedValueOnce(
      providerOptions().filter((option) => option.providerId !== 'pi-cli')
    )
    const useModelOptions = await importComposable()
    const { load, choices, options } = useModelOptions()

    await load()
    expect(choices.value.map((choice) => choice.model)).toEqual(['qwen2.5:3b'])

    await load(true)

    expect(options.value).toEqual(providerOptions())
    expect(choices.value.map((choice) => choice.model)).toEqual([
      'codex/gpt-6-astra',
      'DeepSeekOfficial/deepseek-v4-flash',
      'qwen2.5:3b'
    ])
  })

  it('keeps the previous list when a forced reload fails, rather than blanking an open menu', async () => {
    const useModelOptions = await importComposable()
    const { load, choices, loaded, loading } = useModelOptions()
    await load()
    mocks.getProviderModelOptions.mockRejectedValueOnce(new Error('intelligence unavailable'))

    await load(true)

    expect(choices.value).toHaveLength(3)
    expect(loaded.value).toBe(true)
    expect(loading.value).toBe(false)
  })

  it('joins an in-flight load instead of starting a second one', async () => {
    let resolveOptions: (value: ProviderModelOption[]) => void = () => {}
    mocks.getProviderModelOptions.mockReturnValueOnce(
      new Promise<ProviderModelOption[]>((resolve) => {
        resolveOptions = resolve
      })
    )
    const useModelOptions = await importComposable()
    const { load, loading, loaded } = useModelOptions()

    const first = load()
    const second = load()
    expect(loading.value).toBe(true)
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)

    resolveOptions(providerOptions())
    await Promise.all([first, second])

    expect(loaded.value).toBe(true)
    expect(loading.value).toBe(false)
  })
})

describe('ensureLoaded', () => {
  it('waits for settings hydration before loading, and loads once across repeated calls', async () => {
    let hydrate: () => void = () => {}
    mocks.isHydrated.mockReturnValue(false)
    mocks.whenHydrated.mockReturnValue(
      new Promise<void>((resolve) => {
        hydrate = resolve
      })
    )
    const useModelOptions = await importComposable()
    const { ensureLoaded, loaded } = useModelOptions()

    const first = ensureLoaded()
    const second = ensureLoaded()
    await Promise.resolve()
    expect(mocks.getProviderModelOptions).not.toHaveBeenCalled()

    hydrate()
    await Promise.all([first, second])
    await ensureLoaded()

    expect(loaded.value).toBe(true)
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)
  })

  it('fetches again with refresh, but joins a load that is already in flight', async () => {
    let resolveOptions: (value: ProviderModelOption[]) => void = () => {}
    mocks.getProviderModelOptions.mockReturnValueOnce(
      new Promise<ProviderModelOption[]>((resolve) => {
        resolveOptions = resolve
      })
    )
    const useModelOptions = await importComposable()
    const { ensureLoaded, choices } = useModelOptions()

    // The mount-time load and a quick first open of the menu share one round trip.
    const mountLoad = ensureLoaded()
    await Promise.resolve()
    const firstOpen = ensureLoaded({ refresh: true })
    await Promise.resolve()
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)

    resolveOptions(providerOptions().filter((option) => option.providerId !== 'pi-cli'))
    await Promise.all([mountLoad, firstOpen])
    expect(choices.value.map((choice) => choice.model)).toEqual(['qwen2.5:3b'])

    // A later open refetches, and the provider that has since registered comes in.
    await ensureLoaded({ refresh: true })

    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(2)
    expect(choices.value).toHaveLength(3)
  })

  it('still loads when hydration never settles, so the menu is not held hostage by the transport', async () => {
    vi.useFakeTimers()
    mocks.isHydrated.mockReturnValue(false)
    mocks.whenHydrated.mockReturnValue(new Promise<void>(() => {}))
    const useModelOptions = await importComposable()
    const { ensureLoaded, loaded } = useModelOptions()

    const pending = ensureLoaded()
    await vi.advanceTimersByTimeAsync(3000)
    await pending

    expect(loaded.value).toBe(true)
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)
  })
})
