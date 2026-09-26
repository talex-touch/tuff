import type { OpenerInfo } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { FileProviderOpenerService } from './file-provider-opener-service'

const ICON_PATH =
  '/cache/file-icons/9a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9.png'
const APP_INFO = {
  fileId: 5,
  name: 'Preview',
  path: '/Applications/Preview.app',
  logo: ''
}

/**
 * Openers are resolved while a search result is being shown and their icons are produced lazily in
 * the background, so an extraction can still be in flight when the provider shuts down. The logo it
 * produces is a generated path persisted to `file_extensions` (and served to the renderer as a
 * `tfile:` URL) — a write that must not happen after close.
 */
function createHarness() {
  const addFileExtension = vi.fn(
    async (_fileId: number, _key: string, _value: string): Promise<void> => undefined
  )
  const getFileIconPath = vi.fn<(filePath: string) => Promise<string | null>>(async () => ICON_PATH)
  let storedOpeners: Record<string, OpenerInfo> = {}
  const deps = {
    emptyLogo: 'empty-logo',
    enableFileIconExtraction: true,
    getDbUtils: () => ({ addFileExtension }),
    withDbWrite: async <T>(_label: string, operation: () => Promise<T>): Promise<T> =>
      await operation(),
    getStoredOpeners: () => storedOpeners,
    saveStoredOpeners: (next: Record<string, OpenerInfo>) => {
      storedOpeners = next
    },
    getFileIconPath,
    logWarn: vi.fn(),
    logError: vi.fn()
  }

  return {
    service: new FileProviderOpenerService(deps as never),
    deps,
    addFileExtension,
    getFileIconPath,
    storedOpeners: () => storedOpeners
  }
}

/**
 * The scheduled icon job is fire-and-forget (`scheduleOpenerIconUpdate` returns void and exposes no
 * completion promise), so a late extraction's continuation is drained explicitly: each turn lets
 * one more step of that fixed, short await chain run. No wall-clock waiting is involved.
 */
async function settleScheduledJob(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve()
  }
}

describe('FileProviderOpenerService generated opener icons', () => {
  it('persists the generated icon path and serves it from the opener cache', async () => {
    const harness = createHarness()

    harness.service.scheduleOpenerIconUpdate('pdf', 'com.apple.Preview', APP_INFO)

    await vi.waitFor(() => expect(harness.addFileExtension).toHaveBeenCalledOnce(), {
      timeout: 5_000
    })

    expect(harness.getFileIconPath).toHaveBeenCalledWith('/Applications/Preview.app')
    // The database row keeps the raw generated path...
    expect(harness.addFileExtension).toHaveBeenCalledWith(5, 'icon', ICON_PATH)

    // ...while what the opener serves is the tfile: URL the renderer fetches. Storage and display
    // are deliberately different strings here.
    const opener = await harness.service.getOpenerForExtension('.pdf')
    expect(opener?.logo).toBe(`tfile://${ICON_PATH}`)
    expect(harness.storedOpeners().pdf?.logo).toBe(`tfile://${ICON_PATH}`)
  })

  it('writes nothing when a scheduled extraction finishes after close', async () => {
    const harness = createHarness()
    let resolveIcon: (value: string | null) => void = () => {}
    harness.getFileIconPath.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveIcon = resolve
        })
    )

    harness.service.scheduleOpenerIconUpdate('pdf', 'com.apple.Preview', APP_INFO)
    await vi.waitFor(() => expect(harness.getFileIconPath).toHaveBeenCalledOnce())

    await harness.service.close()
    resolveIcon(ICON_PATH)
    await settleScheduledJob()

    expect(harness.addFileExtension).not.toHaveBeenCalled()
    expect(harness.storedOpeners()).toEqual({})
    expect(await harness.service.getOpenerForExtension('.pdf')).toBeNull()
  })

  it('stops serving openers once closed', async () => {
    const harness = createHarness()

    harness.service.scheduleOpenerIconUpdate('pdf', 'com.apple.Preview', APP_INFO)
    await vi.waitFor(() => expect(harness.addFileExtension).toHaveBeenCalledOnce(), {
      timeout: 5_000
    })
    expect((await harness.service.getOpenerForExtension('.pdf'))?.logo).toBe(`tfile://${ICON_PATH}`)

    await harness.service.close()

    // The resolved opener is deliberately unreachable after close, cache entry or not.
    expect(await harness.service.getOpenerForExtension('.pdf')).toBeNull()
  })

  it('does not resolve close until the icon write it already started completes', async () => {
    const harness = createHarness()
    const completionOrder: string[] = []
    let releaseWrite: () => void = () => {}
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    harness.addFileExtension.mockImplementationOnce(async () => {
      await writeGate
      completionOrder.push('write')
    })

    harness.service.scheduleOpenerIconUpdate('pdf', 'com.apple.Preview', APP_INFO)
    await vi.waitFor(() => expect(harness.addFileExtension).toHaveBeenCalledOnce(), {
      timeout: 5_000
    })
    // The opener cache is published before the write is drained; the reference must not change
    // again afterwards, which is how a post-close storage write would show up.
    const storedBeforeClose = harness.storedOpeners()

    const closing = harness.service.close().then(() => {
      completionOrder.push('close')
    })
    releaseWrite()
    await closing
    await settleScheduledJob()

    expect(completionOrder).toEqual(['write', 'close'])
    expect(harness.storedOpeners()).toBe(storedBeforeClose)
    expect(await harness.service.getOpenerForExtension('.pdf')).toBeNull()
  })
})
