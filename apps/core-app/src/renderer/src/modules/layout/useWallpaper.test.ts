import { effectScope, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  appSettingTarget: {
    background: {}
  } as { background: Record<string, unknown> },
  desktopResult: { path: null as string | null, error: undefined as string | undefined },
  folderImages: [] as string[],
  networkRequest: vi.fn(),
  transportSend: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  pollingTasks: new Map<
    string,
    {
      callback: () => void | Promise<void>
      options?: Record<string, unknown>
    }
  >()
}))

function eventName(event: unknown): string {
  if (typeof event === 'string') return event
  if (
    event &&
    typeof event === 'object' &&
    'toEventName' in event &&
    typeof event.toEventName === 'function'
  ) {
    return event.toEventName()
  }
  return String(event)
}

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onBeforeUnmount: vi.fn()
  }
})

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => ({
      isRegistered: (id: string) => state.pollingTasks.has(id),
      register: (
        id: string,
        callback: () => void | Promise<void>,
        options?: Record<string, unknown>
      ) => {
        state.pollingTasks.set(id, { callback, options })
        if (options?.runImmediately) {
          void callback()
        }
      },
      start: vi.fn(),
      unregister: (id: string) => {
        state.pollingTasks.delete(id)
      }
    })
  }
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useNetworkSdk: () => ({
    request: state.networkRequest
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: state.transportSend
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: state.toastError,
    warning: state.toastWarning
  }
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return {
    appSetting: vue.reactive(state.appSettingTarget)
  }
})

vi.mock('~/modules/storage/theme-style', () => ({
  normalizeWindowPreference: (value: unknown) => value,
  themeStyle: {
    value: {
      theme: {
        window: 'pure'
      }
    }
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock('~/utils/tfile-url', () => ({
  buildTfileUrl: (path: string) => `tfile://${path}`
}))

async function flushAsync(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

async function createHarness(background: Record<string, unknown>) {
  const { appSetting } = await import('~/modules/storage/app-storage')
  appSetting.background = background as typeof appSetting.background

  const { useWallpaper } = await import('./useWallpaper')
  const scope = effectScope()
  const api = scope.run(() => useWallpaper())
  await flushAsync()

  if (!api) {
    throw new Error('Failed to create wallpaper harness')
  }

  return {
    api,
    appSetting,
    stop: () => scope.stop()
  }
}

function sentEventNames(): string[] {
  return state.transportSend.mock.calls.map(([event]) => eventName(event))
}

describe('useWallpaper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.pollingTasks.clear()
    state.folderImages = []
    state.desktopResult = { path: null, error: undefined }
    state.appSettingTarget.background = {}
    state.transportSend.mockImplementation(async (event: unknown) => {
      const name = eventName(event)
      if (name === 'wallpaper:get-desktop') {
        return state.desktopResult
      }
      if (name === 'wallpaper:list-images') {
        return { images: state.folderImages }
      }
      return null
    })
    state.networkRequest.mockResolvedValue({
      data: {
        images: [{ url: '/bing-wallpaper.jpg' }]
      }
    })
  })

  it('auto source loads desktop wallpaper first without requesting Bing', async () => {
    state.desktopResult = { path: '/Users/me/Desktop/current.jpg', error: undefined }

    const { api, appSetting, stop } = await createHarness({ source: 'auto' })

    expect(sentEventNames()).toContain('wallpaper:get-desktop')
    expect(state.pollingTasks.has('wallpaper.desktop.refresh')).toBe(true)
    expect(state.networkRequest).not.toHaveBeenCalled()
    expect(api.activeImagePath.value).toBe('/Users/me/Desktop/current.jpg')
    expect(appSetting.background.desktopPath).toBe('/Users/me/Desktop/current.jpg')
    expect(api.wallpaperStyle.value).toMatchObject({
      backgroundImage: 'url("tfile:///Users/me/Desktop/current.jpg")',
      opacity: 1
    })

    stop()
  })

  it('auto source falls back to Bing when desktop wallpaper is unavailable', async () => {
    state.desktopResult = { path: null, error: 'Desktop wallpaper unavailable' }

    const { api, stop } = await createHarness({ source: 'auto' })

    expect(sentEventNames()).toContain('wallpaper:get-desktop')
    expect(state.toastError).not.toHaveBeenCalled()
    expect(state.networkRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1'
    })
    expect(api.activeImagePath.value).toBe('https://www.bing.com/bing-wallpaper.jpg')
    expect(api.wallpaperStyle.value).toMatchObject({
      backgroundImage: 'url("https://www.bing.com/bing-wallpaper.jpg")'
    })

    stop()
  })

  it('reacts when the source changes to auto after initialization', async () => {
    state.desktopResult = { path: '/Users/me/Desktop/reactive.jpg', error: undefined }
    const { api, appSetting, stop } = await createHarness({ source: 'none' })

    expect(api.wallpaperStyle.value).toEqual({})

    appSetting.background.source = 'auto'
    await flushAsync()

    expect(state.pollingTasks.has('wallpaper.desktop.refresh')).toBe(true)
    expect(api.activeImagePath.value).toBe('/Users/me/Desktop/reactive.jpg')
    expect(api.wallpaperStyle.value).toMatchObject({
      backgroundImage: 'url("tfile:///Users/me/Desktop/reactive.jpg")'
    })

    stop()
  })

  it('keeps desktop wallpaper refreshed while auto or desktop source is active', async () => {
    state.desktopResult = { path: '/Users/me/Desktop/initial.jpg', error: undefined }
    const { api, appSetting, stop } = await createHarness({ source: 'auto' })

    const task = state.pollingTasks.get('wallpaper.desktop.refresh')
    expect(task?.options).toMatchObject({
      interval: 5,
      unit: 'minutes',
      lane: 'maintenance',
      backpressure: 'coalesce'
    })

    state.desktopResult = { path: '/Users/me/Desktop/updated.jpg', error: undefined }
    await task?.callback()
    await flushAsync()

    expect(api.activeImagePath.value).toBe('/Users/me/Desktop/updated.jpg')
    expect(appSetting.background.desktopPath).toBe('/Users/me/Desktop/updated.jpg')

    appSetting.background.source = 'none'
    await flushAsync()

    expect(state.pollingTasks.has('wallpaper.desktop.refresh')).toBe(false)

    stop()
  })

  it('uses copied library path for custom wallpaper when available', async () => {
    const { api, stop } = await createHarness({
      source: 'custom',
      customPath: '/source/custom.png',
      library: {
        enabled: true,
        fileStoredPath: '/library/custom.png'
      }
    })

    expect(api.activeImagePath.value).toBe('/library/custom.png')
    expect(api.wallpaperStyle.value).toMatchObject({
      backgroundImage: 'url("tfile:///library/custom.png")'
    })

    stop()
  })

  it('loads folder wallpapers in stable order and starts rotation', async () => {
    state.folderImages = ['/wallpapers/b.png', '/wallpapers/a.png']

    const { api, stop } = await createHarness({
      source: 'folder',
      folderPath: '/wallpapers',
      folderRandom: false
    })

    expect(sentEventNames()).toContain('wallpaper:list-images')
    expect(state.pollingTasks.has('wallpaper.folder.rotate')).toBe(true)
    expect(api.activeImagePath.value).toBe('/wallpapers/a.png')
    expect(api.wallpaperStyle.value).toMatchObject({
      backgroundImage: 'url("tfile:///wallpapers/a.png")'
    })

    stop()
  })

  it('warns once when a selected folder contains no supported images', async () => {
    state.folderImages = []

    const { api, stop } = await createHarness({
      source: 'folder',
      folderPath: '/empty'
    })

    expect(state.toastWarning).toHaveBeenCalledTimes(1)
    expect(api.wallpaperStyle.value).toEqual({})

    stop()
  })
})
