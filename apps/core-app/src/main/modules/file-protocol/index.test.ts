import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock, handleMock, unhandleMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  handleMock: vi.fn(),
  unhandleMock: vi.fn()
}))

vi.mock('electron', () => ({
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
