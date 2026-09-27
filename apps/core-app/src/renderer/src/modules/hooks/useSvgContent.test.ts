import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readText: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useNetworkSdk: () => ({ readText: mocks.readText }),
  useDownloadSdk: () => ({})
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn() })
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@talex-touch/utils/env')>()),
  isElectronRenderer: () => true
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

import { toTfileUrl } from '@talex-touch/utils/network'
import { useSvgContent } from './useSvgContent'

const ICON_PATH = '/tmp/tuff-icons/icon.svg'

describe('useSvgContent local reads', () => {
  beforeEach(() => {
    mocks.readText.mockReset()
  })

  it('exposes the file text when the channel resolves the SVG itself', async () => {
    mocks.readText.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>')
    // autoFetch off: the test drives the single fetch it asserts on.
    const hook = useSvgContent(ICON_PATH, false)

    await hook.fetchSvgContent()

    // The file text is read through the tfile: URL for that path, not the raw path.
    expect(mocks.readText).toHaveBeenCalledWith(toTfileUrl(ICON_PATH))
    expect(hook.content.value).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(hook.error.value).toBeNull()
    expect(hook.loading.value).toBe(false)
  })

  it.each([
    {
      name: 'a rejected Error',
      reason: new Error('ENOENT: no such file or directory'),
      message: 'ENOENT: no such file or directory'
    },
    {
      name: 'a rejected non-Error reason',
      reason: undefined,
      // Non-Error rejections are surfaced through `new Error(String(err))`.
      message: 'undefined'
    }
  ])('surfaces $name as the hook error instead of crashing on .trim()', async (row) => {
    // A failed readText rejects, so the reason reaches the hook's `catch` and the rejected
    // payload never lands in `text.trim()` (which used to die with `text.trim is not a function`).
    mocks.readText.mockRejectedValue(row.reason)
    const hook = useSvgContent(ICON_PATH, false)

    await hook.fetchSvgContent()

    expect(hook.error.value?.message).toBe(row.message)
    expect(hook.content.value).toBeNull()
    expect(hook.loading.value).toBe(false)
  })
})
