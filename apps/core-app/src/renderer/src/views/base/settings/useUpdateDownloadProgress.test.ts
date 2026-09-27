import type { DownloadProgress, DownloadTask, UpdateLifecycleSnapshot } from '@talex-touch/utils'
import {
  AppPreviewChannel,
  DownloadModule,
  DownloadPriority,
  DownloadStatus
} from '@talex-touch/utils'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useUpdateDownloadProgress } from './useUpdateDownloadProgress'

type TaskHandler = (task: DownloadTask) => void

const sdk = vi.hoisted(() => ({
  progressHandlers: [] as TaskHandler[],
  updatedHandlers: [] as TaskHandler[],
  disposeProgress: vi.fn(),
  disposeUpdated: vi.fn(),
  getTaskStatus: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useDownloadSdk: () => ({
    onTaskProgress: (handler: TaskHandler) => {
      sdk.progressHandlers.push(handler)
      return sdk.disposeProgress
    },
    onTaskUpdated: (handler: TaskHandler) => {
      sdk.updatedHandlers.push(handler)
      return sdk.disposeUpdated
    },
    getTaskStatus: sdk.getTaskStatus
  })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ warn: vi.fn(), error: vi.fn() })
}))

function buildSnapshot(overrides: Partial<UpdateLifecycleSnapshot> = {}): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision: 3,
    phase: 'downloading',
    currentVersion: '2.4.14-beta.46',
    targetVersion: 'v2.4.14-beta.47',
    source: 'nexus',
    channel: AppPreviewChannel.BETA,
    releaseTag: 'v2.4.14-beta.47',
    taskId: 'task-1',
    installMode: null,
    installOnNormalQuit: true,
    rollbackCompatible: false,
    rollbackFromVersion: null,
    previousVersion: null,
    recoveryAvailable: false,
    lastCheckAt: 1_700_000_000_000,
    error: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides
  }
}

function buildProgress(percentage: number): DownloadProgress {
  const totalSize = 100 * 1024 * 1024
  return {
    totalSize,
    downloadedSize: Math.round((totalSize * percentage) / 100),
    speed: 2 * 1024 * 1024,
    percentage
  }
}

function buildTask(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 'task-1',
    url: 'https://example.test/tuff.zip',
    destination: '/tmp',
    filename: 'tuff.zip',
    priority: DownloadPriority.NORMAL,
    module: DownloadModule.APP_UPDATE,
    status: DownloadStatus.DOWNLOADING,
    progress: buildProgress(10),
    chunks: [],
    metadata: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides
  }
}

function push(handlers: TaskHandler[], task: DownloadTask): void {
  for (const handler of handlers) handler(task)
}

function track(initial: UpdateLifecycleSnapshot | null) {
  const snapshot = shallowRef(initial)
  const scope = effectScope()
  const { progress } = scope.run(() => useUpdateDownloadProgress(snapshot))!
  return { snapshot, progress, scope }
}

describe('useUpdateDownloadProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdk.progressHandlers.length = 0
    sdk.updatedHandlers.length = 0
    sdk.getTaskStatus.mockResolvedValue({ success: true, task: null })
  })

  it('follows pushed progress for the update task the lifecycle names', async () => {
    const { progress } = track(buildSnapshot())
    await flushPromises()

    push(sdk.progressHandlers, buildTask({ progress: buildProgress(37) }))
    expect(progress.value).toEqual(buildProgress(37))

    push(sdk.updatedHandlers, buildTask({ progress: buildProgress(41) }))
    expect(progress.value).toEqual(buildProgress(41))
  })

  it('ignores other tasks and other download modules', async () => {
    const { progress } = track(buildSnapshot())
    await flushPromises()

    push(sdk.progressHandlers, buildTask({ id: 'task-2', progress: buildProgress(90) }))
    push(
      sdk.progressHandlers,
      buildTask({ module: DownloadModule.PLUGIN_INSTALL, progress: buildProgress(80) })
    )

    expect(progress.value).toBeNull()
  })

  it('accepts any app update task before the lifecycle names one', () => {
    const { progress } = track(buildSnapshot({ phase: 'available', taskId: null }))

    push(sdk.progressHandlers, buildTask({ id: 'task-9', progress: buildProgress(3) }))

    expect(progress.value).toEqual(buildProgress(3))
  })

  it('backfills progress when the page opens halfway through a download', async () => {
    sdk.getTaskStatus.mockResolvedValue({
      success: true,
      task: buildTask({ progress: buildProgress(62) })
    })

    const { progress } = track(buildSnapshot())
    await flushPromises()

    expect(sdk.getTaskStatus).toHaveBeenCalledWith({ taskId: 'task-1' })
    expect(progress.value).toEqual(buildProgress(62))
  })

  it('stays unmeasured when the task is no longer in memory', async () => {
    const { progress } = track(buildSnapshot())
    await flushPromises()

    expect(sdk.getTaskStatus).toHaveBeenCalledOnce()
    expect(progress.value).toBeNull()
  })

  it('does not let a slow backfill overwrite a newer push', async () => {
    let answer: (value: unknown) => void = () => {}
    sdk.getTaskStatus.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { progress } = track(buildSnapshot())

    push(sdk.progressHandlers, buildTask({ progress: buildProgress(60) }))
    answer({ success: true, task: buildTask({ progress: buildProgress(40) }) })
    await flushPromises()

    expect(progress.value).toEqual(buildProgress(60))
  })

  it('clears once the download leaves the downloading phase', async () => {
    const { snapshot, progress } = track(buildSnapshot())
    await flushPromises()
    push(sdk.progressHandlers, buildTask({ progress: buildProgress(100) }))

    snapshot.value = buildSnapshot({ phase: 'verifying', revision: 4 })
    await nextTick()

    expect(progress.value).toBeNull()
  })

  it('starts over for a new download task', async () => {
    const { snapshot, progress } = track(buildSnapshot())
    await flushPromises()
    push(sdk.progressHandlers, buildTask({ progress: buildProgress(50) }))

    snapshot.value = buildSnapshot({ taskId: 'task-2', revision: 5 })
    await nextTick()

    expect(progress.value).toBeNull()
    expect(sdk.getTaskStatus).toHaveBeenLastCalledWith({ taskId: 'task-2' })

    push(sdk.progressHandlers, buildTask({ progress: buildProgress(70) }))
    expect(progress.value).toBeNull()
    push(sdk.progressHandlers, buildTask({ id: 'task-2', progress: buildProgress(5) }))
    expect(progress.value).toEqual(buildProgress(5))
  })

  it('stops listening when its owner goes away', () => {
    const { scope } = track(buildSnapshot())

    scope.stop()

    expect(sdk.disposeProgress).toHaveBeenCalledOnce()
    expect(sdk.disposeUpdated).toHaveBeenCalledOnce()
  })
})
