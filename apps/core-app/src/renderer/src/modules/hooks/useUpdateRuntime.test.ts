import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

type LoadTargetOptions = {
  withTimeoutImpl?: (promise: Promise<unknown>, timeout: number) => Promise<unknown>
  installImpl?: ReturnType<typeof vi.fn>
  isMainWindow?: boolean
}

async function loadTarget(options: LoadTargetOptions = {}) {
  vi.resetModules()

  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
  const updateSdk = {
    install: options.installImpl ?? vi.fn(async () => ({ success: true })),
    download: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getStatus: vi.fn(),
    getCachedRelease: vi.fn(),
    recordAction: vi.fn(),
    clearCache: vi.fn(),
    check: vi.fn(),
    onAvailable: vi.fn(() => () => {})
  }
  const downloadSdk = {
    onTaskCompleted: vi.fn(() => () => {})
  }
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }

  class MockTimeoutError extends Error {}

  vi.doMock('@talex-touch/utils', () => ({
    AppPreviewChannel: {
      RELEASE: 'release',
      BETA: 'beta'
    },
    DownloadModule: {
      APP_UPDATE: 'app-update'
    },
    UpdateProviderType: {
      GITHUB: 'github'
    },
    UPDATE_GITHUB_RELEASES_API: 'https://updates.example/releases',
    resolveUpdateChannelLabel: () => 'beta',
    splitUpdateTag: () => ({
      version: '2.4.10',
      channelLabel: 'beta'
    })
  }))

  vi.doMock('@talex-touch/utils/common/utils/time', () => ({
    TimeoutError: MockTimeoutError,
    withTimeout:
      options.withTimeoutImpl ??
      ((promise: Promise<unknown>) => {
        return promise
      })
  }))

  vi.doMock('@talex-touch/utils/renderer', () => ({
    isMainWindow: () => options.isMainWindow ?? true,
    useUpdateSdk: () => updateSdk,
    useDownloadSdk: () => downloadSdk
  }))

  vi.doMock('vue-sonner', () => ({
    toast
  }))

  vi.doMock('~/modules/lang', () => ({
    useI18nText: () => ({
      t: (key: string) => key
    })
  }))

  vi.doMock('~/utils/renderer-log', () => ({
    createRendererLogger: () => logger
  }))

  vi.doMock('../update/channel', () => ({
    normalizeStoredUpdateChannel: (value: unknown) => value ?? null,
    normalizeSupportedUpdateChannel: (value: unknown) => value ?? 'release'
  }))

  vi.doMock('../update/platform-target', () => ({
    detectUpdateAssetArch: () => 'arm64',
    detectUpdateAssetPlatform: () => 'darwin',
    resolveRuntimeUpdateArch: () => 'arm64'
  }))

  vi.doMock('../update/update-dialog-session', () => ({
    updateDialogSession: {
      beginPresentation: vi.fn(() => true),
      beginAction: vi.fn(() => true),
      finishAction: vi.fn(),
      failAction: vi.fn(),
      endPresentation: vi.fn()
    }
  }))

  vi.doMock('~/utils/dev-log', () => ({
    devLog: vi.fn()
  }))

  vi.doMock('../mention/dialog-mention', () => ({
    blowMention: vi.fn(async () => {})
  }))

  vi.doMock('./useAppStates', () => ({
    useAppState: () => ({
      appStates: {
        hasUpdate: false,
        noUpdateAvailable: false,
        updateErrorMessage: ''
      }
    })
  }))

  vi.doMock('./useStartupInfo', () => ({
    useStartupInfo: () => ({
      startupInfo: ref({
        id: 1,
        version: '2.4.10-beta.8',
        platform: 'darwin'
      }),
      setAppUpdate: vi.fn()
    })
  }))

  vi.doMock('~/components/base/AppUpgradationView.vue', () => ({
    default: {}
  }))

  const target = await import('./useUpdateRuntime')
  return {
    ...target,
    toast,
    updateSdk,
    logger,
    MockTimeoutError
  }
}

describe('useUpdateRuntime', () => {
  it('uses auto download by default when settings are unavailable', async () => {
    const { useUpdateRuntime, updateSdk } = await loadTarget()
    updateSdk.getSettings.mockResolvedValue({ success: false, error: 'offline' })

    const runtime = useUpdateRuntime()
    const settings = await runtime.getUpdateSettings()

    expect(settings.autoDownload).toBe(true)
  })

  it('update install ack timeout 不再被视为已开始安装', async () => {
    const { useUpdateRuntime, toast, logger, MockTimeoutError } = await loadTarget({
      withTimeoutImpl: async () => {
        throw new MockTimeoutError('timeout')
      }
    })

    const runtime = useUpdateRuntime()
    const result = await runtime.installDownloadedUpdate('task-1')

    expect(result).toBe(false)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith(
      'settings.settingUpdate.messages.installPendingConfirmation'
    )
    expect(logger.warn).toHaveBeenCalled()
  })

  it('主进程确认接管安装后才返回成功', async () => {
    const install = vi.fn(async () => ({ success: true }))
    const { useUpdateRuntime, toast, updateSdk } = await loadTarget({
      installImpl: install
    })

    const runtime = useUpdateRuntime()
    const result = await runtime.installDownloadedUpdate('task-2')

    expect(result).toBe(true)
    expect(updateSdk.install).toHaveBeenCalledWith({ taskId: 'task-2' })
    expect(toast.success).toHaveBeenCalledWith('settings.settingUpdate.messages.installStarted')
  })

  it('非主窗口不注册更新提示监听', async () => {
    const { useUpdateRuntime, updateSdk } = await loadTarget({ isMainWindow: false })

    const runtime = useUpdateRuntime()
    runtime.setupUpdateListener()

    expect(updateSdk.onAvailable).not.toHaveBeenCalled()
  })

  it('非主窗口不主动检查并弹出更新提示', async () => {
    const { useUpdateRuntime, updateSdk } = await loadTarget({ isMainWindow: false })

    const runtime = useUpdateRuntime()
    const result = await runtime.checkApplicationUpgrade()

    expect(result).toBeUndefined()
    expect(updateSdk.check).not.toHaveBeenCalled()
  })
})
