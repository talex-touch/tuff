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
      name: 'an error payload',
      payload: { message: 'ENOENT: no such file or directory' },
      message: 'Icon content request failed: ENOENT: no such file or directory'
    },
    {
      name: 'an undefined payload',
      payload: undefined,
      message: 'Icon content request failed: undefined'
    }
  ])('reports a described error for $name instead of crashing on .trim()', async (row) => {
    // A failed readText resolves this payload rather than rejecting, so the value reached
    // `text.trim()` and the icon died on `TypeError: text.trim is not a function`.
    mocks.readText.mockResolvedValue(row.payload)
    const hook = useSvgContent(ICON_PATH, false)

    await hook.fetchSvgContent()

    expect(hook.error.value?.message).toBe(row.message)
    expect(hook.content.value).toBeNull()
    expect(hook.loading.value).toBe(false)
  })
})
