import type { GitHubRelease, UpdateLifecycleSnapshot } from '@talex-touch/utils'
import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

interface LoadTargetOptions {
  withTimeoutImpl?: (promise: Promise<unknown>, timeout: number) => Promise<unknown>
  installImpl?: ReturnType<typeof vi.fn>
  isMainWindow?: boolean
}

function buildSnapshot(overrides: Partial<UpdateLifecycleSnapshot> = {}): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision: 1,
    phase: 'idle',
    currentVersion: '2.4.9',
    targetVersion: 'v2.4.10',
    source: 'github',
    channel: AppPreviewChannel.RELEASE,
    releaseTag: 'v2.4.10',
    taskId: null,
    installMode: null,
    installOnNormalQuit: false,
    rollbackCompatible: false,
    rollbackFromVersion: '2.4.8',
    previousVersion: '2.4.8',
    recoveryAvailable: false,
    lastCheckAt: 1_700_000_000_000,
    error: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides
  }
}

async function loadTarget(options: LoadTargetOptions = {}) {
  vi.resetModules()

  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
  const blowMention = vi.fn(async () => {})
  let availableListener:
    | ((data: {
        hasUpdate: boolean
        release?: GitHubRelease
        snapshot: UpdateLifecycleSnapshot
      }) => void)
    | null = null
  let lifecycleListener: ((snapshot: UpdateLifecycleSnapshot) => void) | null = null
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
    onAvailable: vi.fn((listener) => {
      availableListener = listener
      return () => {}
    }),
    onLifecycleChanged: vi.fn((listener) => {
      lifecycleListener = listener
      return () => {}
    })
  }
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }

  class MockTimeoutError extends Error {}

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
    useUpdateSdk: () => updateSdk
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
    normalizeSupportedUpdateChannel: (value: unknown) => value ?? AppPreviewChannel.RELEASE
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
    blowMention
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
    blowMention,
    updateSdk,
    logger,
    MockTimeoutError,
    emitAvailable(data: {
      hasUpdate: boolean
      release?: GitHubRelease
      snapshot: UpdateLifecycleSnapshot
    }): void {
      if (!availableListener) throw new Error('Update listener was not registered')
      availableListener(data)
    },
    emitLifecycle(snapshot: UpdateLifecycleSnapshot): void {
      if (!lifecycleListener) throw new Error('Lifecycle listener was not registered')
      lifecycleListener(snapshot)
    }
  }
}

describe('useUpdateRuntime', () => {
  it('shares revision-gated lifecycle snapshots across runtime consumers and rejects terminal resurrection', async () => {
    const { useUpdateRuntime, updateSdk, emitLifecycle } = await loadTarget()
    const runtime = useUpdateRuntime()
    const anotherConsumer = useUpdateRuntime()
    const available = buildSnapshot({ phase: 'available', revision: 2 })
    const ready = buildSnapshot({ phase: 'ready', revision: 3, taskId: 'task-1' })
    const failed = buildSnapshot({
      phase: 'failed',
      revision: 4,
      error: { code: 'UPDATE_INSTALL_FAILED', message: 'handoff failed', retryable: true }
    })

    updateSdk.getStatus.mockResolvedValue({ success: true, data: available })
    await runtime.getUpdateStatus()
    expect(anotherConsumer.lifecycleSnapshot.value).toEqual(available)

    updateSdk.download.mockResolvedValue({ success: true, snapshot: ready })
    await runtime.handleDownloadUpdate({ tag_name: 'v2.4.10' } as GitHubRelease)
    expect(anotherConsumer.lifecycleSnapshot.value).toEqual(ready)

    runtime.setupUpdateListener()
    emitLifecycle(failed)
    expect(anotherConsumer.lifecycleSnapshot.value).toEqual(failed)

    emitLifecycle(buildSnapshot({ phase: 'ready', revision: 5, taskId: 'task-1' }))
    expect(runtime.lifecycleSnapshot.value).toEqual(failed)
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

  it('auto download 模式收到 available 时只同步状态而不弹阻塞对话框', async () => {
    const { useUpdateRuntime, updateSdk, emitAvailable, blowMention } = await loadTarget()
    const runtime = useUpdateRuntime()
    updateSdk.getSettings.mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        frequency: 'everyday',
        updateChannel: AppPreviewChannel.RELEASE,
        autoDownload: true,
        installOnNormalQuit: true,
        rendererOverrideEnabled: false
      }
    })
    runtime.setupUpdateListener()

    emitAvailable({
      hasUpdate: true,
      release: { tag_name: 'v2.4.10', body: '' } as GitHubRelease,
      snapshot: buildSnapshot({ phase: 'available', revision: 2 })
    })

    await vi.waitFor(() => expect(updateSdk.getSettings).toHaveBeenCalledOnce())
    expect(blowMention).not.toHaveBeenCalled()
    expect(runtime.lifecycleSnapshot.value?.phase).toBe('available')
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
