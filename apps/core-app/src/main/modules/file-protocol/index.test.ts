import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock, handleMock, unhandleMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  handleMock: vi.fn(),
  unhandleMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => '/app' },
  net: {
    fetch: fetchMock
  },
  session: {
    defaultSession: {
      protocol: {
        handle: handleMock,
        unhandle: unhandleMock
      }
    }
  }
}))

vi.mock('../../utils/local-file-policy', () => ({
  getAllowedLocalFileRoots: () => ['/allowed'],
  isAllowedLocalFilePath: (filePath: string, roots: string[]) =>
    roots.some((root) => filePath === root || filePath.startsWith(`${root}/`)),
  normalizeDarwinUsersPath: (filePath: string) => filePath
}))

vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    getBaseDir: () => '/managed-temp'
  }
}))

import { __test__, fileProtocolModule } from './index'

describe('file-protocol canonical tfile parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('forwards allowlisted files through Electron built-in streaming fetch', async () => {
    const response = new Response('icon-bytes')
    fetchMock.mockResolvedValue(response)
    fileProtocolModule.onInit()

    const handler = handleMock.mock.calls.at(-1)?.[1] as
      | ((request: { url: string }) => Promise<Response>)
      | undefined
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({ url: 'tfile:///allowed/icon.png' })).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledWith('file:///allowed/icon.png', {
      bypassCustomProtocolHandlers: true
    })
    expect(response.body).toBeInstanceOf(ReadableStream)
  })

  it('forwards managed temp resources through the same confined protocol', async () => {
    const response = new Response('managed-image')
    fetchMock.mockResolvedValue(response)
    fileProtocolModule.onInit()

    const handler = handleMock.mock.calls.at(-1)?.[1] as
      | ((request: { url: string }) => Promise<Response>)
      | undefined

    await expect(
      handler?.({ url: 'tfile:///managed-temp/native/screenshots/capture.png' })
    ).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledWith('file:///managed-temp/native/screenshots/capture.png', {
      bypassCustomProtocolHandlers: true
    })
  })

  it('accepts host-style darwin paths emitted by renderer requests', () => {
    expect(__test__.extractAbsolutePath('tfile://users/demo/report.txt')).toBe(
      '/users/demo/report.txt'
    )
  })

  it('accepts host-style Windows drive URLs', () => {
    expect(__test__.extractAbsolutePath('tfile://C:/Users/demo/report.txt')).toBe(
      'C:/Users/demo/report.txt'
    )
  })

  it('preserves Windows drive letters from normalized URLs', () => {
    expect(__test__.extractAbsolutePath('tfile:///C:/Users/demo/report.txt')).toBe(
      'C:/Users/demo/report.txt'
    )
  })

  it('accepts encoded Windows drive URLs emitted by toTfileUrl', () => {
    expect(__test__.extractAbsolutePath('tfile://C%3A/Users/demo/report.txt')).toBe(
      'C:/Users/demo/report.txt'
    )
  })

  it('accepts UNC URLs emitted by toTfileUrl', () => {
    expect(__test__.extractAbsolutePath('tfile:////server/share/icon.svg')).toBe(
      '//server/share/icon.svg'
    )
  })
})

describe('file-protocol error-log dedupe bound', () => {
  beforeEach(() => {
    __test__.loggedErrorPaths.clear()
  })

  it('logs each path once', () => {
    // The behaviour the Set exists for, asserted before the bound so a cap that broke dedupe
    // entirely would fail here rather than look like a memory win.
    expect(__test__.shouldLogPathOnce('/tmp/missing.png')).toBe(true)
    expect(__test__.shouldLogPathOnce('/tmp/missing.png')).toBe(false)
    expect(__test__.shouldLogPathOnce('/tmp/other.png')).toBe(true)
  })

  it('stops growing once the cap is reached', () => {
    // #647: unbounded before. A churning result set contributes one retained string per distinct
    // missing path, for the lifetime of a process expected to run for days.
    const limit = __test__.LOGGED_ERROR_PATH_LIMIT

    for (let index = 0; index < limit * 2; index++)
      __test__.shouldLogPathOnce(`/tmp/churn-${index}.png`)

    expect(__test__.loggedErrorPaths.size).toBe(limit)
  })

  it('evicts oldest first, so a recent path stays deduplicated', () => {
    const limit = __test__.LOGGED_ERROR_PATH_LIMIT
    __test__.shouldLogPathOnce('/tmp/oldest.png')

    for (let index = 0; index < limit - 1; index++)
      __test__.shouldLogPathOnce(`/tmp/filler-${index}.png`)

    // Still inside the window: must not re-log.
    expect(__test__.shouldLogPathOnce('/tmp/filler-0.png')).toBe(false)

    __test__.shouldLogPathOnce('/tmp/pushes-oldest-out.png')

    // Evicted, so it logs again — one repeated warning is the price of the bound, and pinning it
    // here means the trade-off is visible rather than discovered later.
    expect(__test__.shouldLogPathOnce('/tmp/oldest.png')).toBe(true)
  })

  it('clears the set on destroy', () => {
    __test__.shouldLogPathOnce('/tmp/before-destroy.png')
    expect(__test__.loggedErrorPaths.size).toBe(1)

    fileProtocolModule.onDestroy()

    expect(__test__.loggedErrorPaths.size).toBe(0)
  })
})
