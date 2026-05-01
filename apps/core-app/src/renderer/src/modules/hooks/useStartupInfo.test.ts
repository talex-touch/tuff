import { describe, expect, it, vi } from 'vitest'
import type { StartupContext, StartupInfo } from '@talex-touch/utils'

function createStartupInfo(overrides: Partial<StartupInfo> = {}): StartupInfo {
  return {
    id: 1,
    version: '2.4.10-beta.8',
    path: {
      appDataPath: '/tmp/appData',
      appPath: '/tmp/app',
      configPath: '/tmp/config',
      exePath: '/tmp/exe',
      homePath: '/tmp/home',
      modulePath: '/tmp/module',
      pluginPath: '/tmp/plugins',
      rootPath: '/tmp/root',
      tempPath: '/tmp/temp',
      userDataPath: '/tmp/userData'
    },
    isPackaged: false,
    isDev: true,
    isRelease: false,
    platform: 'darwin',
    arch: 'arm64',
    t: {
      _s: 0,
      s: 0,
      e: 0,
      p: 0,
      h: []
    },
    ...overrides
  }
}

function createStartupContext(overrides: Partial<StartupContext> = {}): StartupContext {
  return {
    startupInfo: createStartupInfo(),
    windowMode: 'MainApp',
    metaOverlay: false,
    ...overrides
  }
}

async function loadTarget(options: {
  snapshot: StartupContext | null
  resolvedContext: StartupContext | null
}) {
  vi.resetModules()

  const getStartupContext = vi.fn(async () => options.resolvedContext)
  const getStartupContextSnapshot = vi.fn(() => options.snapshot)

  vi.doMock('@talex-touch/utils/preload', () => ({
    getStartupContext,
    getStartupContextSnapshot
  }))

  const target = await import('./useStartupInfo')
  return {
    ...target,
    getStartupContext,
    getStartupContextSnapshot
  }
}

describe('useStartupInfo', () => {
  it('优先使用 preload snapshot，不再走运行时兜底读取', async () => {
    const snapshot = createStartupContext({
      windowMode: 'CoreBox',
      startupInfo: createStartupInfo({ id: 42 })
    })
    const { useStartupInfo, getStartupContext } = await loadTarget({
      snapshot,
      resolvedContext: createStartupContext({
        startupInfo: createStartupInfo({ id: 99 })
      })
    })

    const state = useStartupInfo()

    expect(state.startupContext.value).toEqual(snapshot)
    expect(state.startupInfo.value?.id).toBe(42)
    await Promise.resolve()
    expect(getStartupContext).not.toHaveBeenCalled()
  })

  it('在 snapshot 缺失时只拉取一次 startup context 并缓存结果', async () => {
    const resolvedContext = createStartupContext({
      windowMode: 'MetaOverlay',
      metaOverlay: true,
      startupInfo: createStartupInfo({ id: 7 })
    })
    const { useStartupInfo, getStartupContext } = await loadTarget({
      snapshot: null,
      resolvedContext
    })

    const state = useStartupInfo()
    const [first, second] = await Promise.all([
      state.ensureStartupContext(),
      state.ensureStartupContext()
    ])

    expect(getStartupContext).toHaveBeenCalledTimes(1)
    expect(first).toEqual(resolvedContext)
    expect(second).toEqual(resolvedContext)
    expect(state.startupInfo.value?.id).toBe(7)
  })

  it('setAppUpdate 直接更新 bridge 中的 startupInfo', async () => {
    const snapshot = createStartupContext({
      startupInfo: createStartupInfo({ appUpdate: false })
    })
    const { useStartupInfo } = await loadTarget({
      snapshot,
      resolvedContext: snapshot
    })

    const state = useStartupInfo()
    state.setAppUpdate(true)

    expect(state.startupInfo.value?.appUpdate).toBe(true)
  })
})
