import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { UpdateActionController } from './update-action-controller'

function createController(
  overrides?: Partial<ConstructorParameters<typeof UpdateActionController>[0]>
) {
  const deps = {
    isPackaged: vi.fn(() => false),
    getEffectiveChannel: () => AppPreviewChannel.RELEASE,
    getQuickUpdateCheckResult: vi.fn(async () => ({ hasUpdate: false }) as any),
    queueBackgroundUpdateCheck: vi.fn(),
    checkForUpdates: vi.fn(async () => ({ hasUpdate: true }) as any),
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
    const result = await controller.handleDownload({ tag_name: 'v1.0.0' } as any)

    expect(result.success).toBe(true)
    expect(result.data?.taskId).toBe('task-1')
  })

  it('fails install when task id is missing in non-mac mode', async () => {
    const { controller } = createController()
    const result = await controller.handleInstall()

    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing update task id')
  })
})
