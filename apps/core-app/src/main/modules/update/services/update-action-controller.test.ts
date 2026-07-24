import { AppPreviewChannel, type GitHubRelease, type UpdateCheckResult } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { UpdateActionController } from './update-action-controller'

function createController(
  overrides?: Partial<ConstructorParameters<typeof UpdateActionController>[0]>
) {
  const deps = {
    isPackaged: vi.fn(() => false),
    getEffectiveChannel: () => AppPreviewChannel.RELEASE,
    getQuickUpdateCheckResult: vi.fn(async () => ({ hasUpdate: false }) as UpdateCheckResult),
    queueBackgroundUpdateCheck: vi.fn(),
    checkForUpdates: vi.fn(async () => ({ hasUpdate: true }) as UpdateCheckResult),
    withDownloadCenterDownload: vi.fn(async () => ({ taskId: 'task-1' })),
    withDownloadCenterInstall: vi.fn(async () => {}),
    reportUpdateMessage: vi.fn(),
    reportUpdateTelemetry: vi.fn(),
    reportUpdateError: vi.fn(),
    getSourceName: vi.fn(() => 'TestSource'),
    logError: vi.fn(),
    ...overrides
  }

  return { controller: new UpdateActionController(deps), deps }
}

describe('update-action-controller', () => {
  it('returns the DownloadCenter task id and telemetry for a release download', async () => {
    const { controller, deps } = createController()
    const release = { tag_name: 'v1.0.0' } as GitHubRelease

    await expect(controller.handleDownload(release)).resolves.toEqual({
      success: true,
      data: { taskId: 'task-1' }
    })
    expect(deps.withDownloadCenterDownload).toHaveBeenCalledWith(release)
    expect(deps.reportUpdateTelemetry).toHaveBeenCalledWith('download_started', {
      channel: AppPreviewChannel.RELEASE,
      source: 'TestSource',
      tag: 'v1.0.0',
      taskId: 'task-1',
      itemKind: 'manual'
    })
  })

  it('rejects installation without the verified DownloadCenter task id', async () => {
    const { controller, deps } = createController()

    await expect(controller.handleInstall()).resolves.toEqual({
      success: false,
      error: 'Missing update task id',
      errorCode: 'UPDATE_TASK_REQUIRED'
    })
    expect(deps.withDownloadCenterInstall).not.toHaveBeenCalled()
    expect(deps.reportUpdateTelemetry).toHaveBeenCalledWith('install_error', {
      channel: AppPreviewChannel.RELEASE,
      source: 'TestSource',
      taskId: undefined,
      itemKind: 'manual'
    })
  })

  it('schedules installation for the DownloadCenter task and reports that task', async () => {
    const { controller, deps } = createController()

    await expect(controller.handleInstall({ taskId: 'task-1' })).resolves.toEqual({ success: true })
    expect(deps.withDownloadCenterInstall).toHaveBeenCalledWith('task-1')
    expect(deps.reportUpdateMessage).toHaveBeenCalledWith(
      'info',
      'Update install scheduled',
      'task-1',
      { channel: AppPreviewChannel.RELEASE }
    )
    expect(deps.reportUpdateTelemetry).toHaveBeenCalledWith('install_scheduled', {
      channel: AppPreviewChannel.RELEASE,
      source: 'TestSource',
      taskId: 'task-1',
      itemKind: 'manual'
    })
  })
})
