import type { BundledReleaseNotesState } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  getBundledReleaseNotes: vi.fn(),
  acknowledgeReleaseNotes: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useUpdateSdk: () => sdk
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ warn: vi.fn() })
}))

function bundledState(lastAcknowledgedVersion: string | null): BundledReleaseNotesState {
  return {
    catalog: {
      schemaVersion: 1,
      generatedForVersion: '2.4.14',
      entries: [
        {
          version: '2.4.14',
          tag: 'v2.4.14',
          channel: 'RELEASE',
          summary: {
            zh: ['摘要一', '摘要二', '摘要三'],
            en: ['Summary one', 'Summary two', 'Summary three']
          }
        }
      ]
    },
    lastAcknowledgedVersion
  }
}

describe('useReleaseNotesRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    sdk.acknowledgeReleaseNotes.mockResolvedValue({ success: true, data: undefined })
  })

  it('acknowledges an upgrade only after the dialog closes', async () => {
    sdk.getBundledReleaseNotes.mockResolvedValue({
      success: true,
      data: bundledState('2.4.13')
    })
    const { useReleaseNotesRuntime } = await import('./useReleaseNotesRuntime')
    const runtime = useReleaseNotesRuntime()

    await runtime.evaluateStartup(true)

    expect(runtime.dialogVisible.value).toBe(true)
    expect(runtime.dialogEntries.value.map((entry) => entry.version)).toEqual(['2.4.14'])
    expect(sdk.acknowledgeReleaseNotes).not.toHaveBeenCalled()

    await runtime.closeDialog()

    expect(runtime.dialogVisible.value).toBe(false)
    expect(sdk.acknowledgeReleaseNotes).toHaveBeenCalledWith({ version: '2.4.14' })
  })

  it('silently acknowledges a fresh install without showing the dialog', async () => {
    sdk.getBundledReleaseNotes.mockResolvedValue({
      success: true,
      data: bundledState(null)
    })
    const { useReleaseNotesRuntime } = await import('./useReleaseNotesRuntime')
    const runtime = useReleaseNotesRuntime()

    await runtime.evaluateStartup(false)

    expect(runtime.dialogVisible.value).toBe(false)
    expect(sdk.acknowledgeReleaseNotes).toHaveBeenCalledWith({ version: '2.4.14' })
  })
})
