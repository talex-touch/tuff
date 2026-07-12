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
    isMacAutoUpdaterEnabled: vi.fn(() => false),
    withDownloadCenterDownload: vi.fn(async () => ({ taskId: 'task-1' })),
    withMacDownload: vi.fn(async () => {}),
    withDownloadCenterInstall: vi.fn(async () => {}),
    withMacInstall: vi.fn(async () => {}),
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
  it('returns quick check result when force=false', async () => {
    const { controller, deps } = createController()
    const result = await controller.handleCheck(false)

    expect(result.success).toBe(true)
    expect(deps.getQuickUpdateCheckResult).toHaveBeenCalledTimes(1)
  })

  it('downloads with task id via download center when non-mac updater', async () => {
    const { controller } = createController()
    const result = await controller.handleDownload({ tag_name: 'v1.0.0' } as GitHubRelease)

    expect(result.success).toBe(true)
    expect(result.data?.taskId).toBe('task-1')
  })

  it('fails install when task id is missing in non-mac mode', async () => {
    const { controller } = createController()
    const result = await controller.handleInstall()

    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing update task id')
  })

  it('installs through download center when task id is provided in non-mac mode', async () => {
    const { controller, deps } = createController()
    const result = await controller.handleInstall({ taskId: 'task-1' })

    expect(result.success).toBe(true)
    expect(deps.withDownloadCenterInstall).toHaveBeenCalledWith('task-1')
    expect(deps.reportUpdateTelemetry).toHaveBeenCalledWith('install_started', {
      channel: AppPreviewChannel.RELEASE,
      source: 'TestSource',
      taskId: 'task-1',
      itemKind: 'manual'
    })
  })

  it('uses the macOS handoff without inventing a download-center task id', async () => {
    const { controller, deps } = createController({
      isMacAutoUpdaterEnabled: vi.fn(() => true)
    })

    const result = await controller.handleDownload({ tag_name: 'v1.2.0' } as GitHubRelease)

    expect(result).toEqual({ success: true })
    expect(deps.withMacDownload).toHaveBeenCalledWith({ tag_name: 'v1.2.0' })
    expect(deps.withDownloadCenterDownload).not.toHaveBeenCalled()
  })

  it('uses the macOS installer handoff without requiring a task id', async () => {
    const { controller, deps } = createController({
      isMacAutoUpdaterEnabled: vi.fn(() => true)
    })

    const result = await controller.handleInstall()

    expect(result).toEqual({ success: true })
    expect(deps.withMacInstall).toHaveBeenCalledTimes(1)
    expect(deps.withDownloadCenterInstall).not.toHaveBeenCalled()
  })

  it('surfaces a failed macOS download handoff to the renderer', async () => {
    const { controller, deps } = createController({
      isMacAutoUpdaterEnabled: vi.fn(() => true),
      withMacDownload: vi.fn(async () => {
        throw new Error('updater unavailable')
      })
    })

    const result = await controller.handleDownload({ tag_name: 'v1.2.0' } as GitHubRelease)

    expect(result).toEqual({ success: false, error: 'updater unavailable' })
    expect(deps.reportUpdateTelemetry).toHaveBeenCalledWith('download_error', {
      channel: AppPreviewChannel.RELEASE,
      source: 'mac-auto-updater',
      tag: 'v1.2.0',
      itemKind: 'manual'
    })
  })
})
