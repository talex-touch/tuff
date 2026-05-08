import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnSafeMock, childUnrefMock } = vi.hoisted(() => ({
  spawnSafeMock: vi.fn(),
  childUnrefMock: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  spawnSafe: spawnSafeMock
}))

import { windowsShellFileProvider } from './windows-shell-file-provider'

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

afterEach(() => {
  spawnSafeMock.mockReset()
  childUnrefMock.mockReset()
})

describe('windows-shell-file-provider', () => {
  it('returns no items outside Windows', async () => {
    await withPlatform('darwin', async () => {
      const result = await windowsShellFileProvider.onSearch(
        { text: '回收站', inputs: [] },
        new AbortController().signal
      )

      expect(result.items).toEqual([])
    })
  })

  it('returns no items for empty Windows queries', async () => {
    await withPlatform('win32', async () => {
      const result = await windowsShellFileProvider.onSearch(
        { text: '   ', inputs: [] },
        new AbortController().signal
      )

      expect(result.items).toEqual([])
    })
  })

  it.each([
    ['回收站', 'recycle-bin', 'shell:RecycleBinFolder'],
    ['recycle', 'recycle-bin', 'shell:RecycleBinFolder'],
    ['此电脑', 'this-pc', 'shell:MyComputerFolder'],
    ['this pc', 'this-pc', 'shell:MyComputerFolder']
  ])('matches %s to the expected shell entry', async (query, id, target) => {
    await withPlatform('win32', async () => {
      const result = await windowsShellFileProvider.onSearch(
        { text: query, inputs: [] },
        new AbortController().signal
      )

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe(`windows-shell-file-provider:${id}`)
      expect(result.items[0].source).toEqual({
        type: 'file',
        id: 'windows-shell-file-provider'
      })
      expect(result.items[0].kind).toBe('folder')
      expect(result.items[0].meta?.file).toBeUndefined()
      expect(result.items[0].meta?.extension).toMatchObject({
        windowsShellEntry: {
          id,
          target
        }
      })
    })
  })

  it('opens shell entries through explorer.exe', async () => {
    await withPlatform('win32', async () => {
      spawnSafeMock.mockReturnValue({
        unref: childUnrefMock
      })

      const result = await windowsShellFileProvider.onSearch(
        { text: '回收站', inputs: [] },
        new AbortController().signal
      )

      await windowsShellFileProvider.onExecute?.({ item: result.items[0] })

      expect(spawnSafeMock).toHaveBeenCalledWith('explorer.exe', ['shell:RecycleBinFolder'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      expect(childUnrefMock).toHaveBeenCalledTimes(1)
    })
  })

  it('returns no items when the search is aborted', async () => {
    await withPlatform('win32', async () => {
      const controller = new AbortController()
      controller.abort()

      const result = await windowsShellFileProvider.onSearch(
        { text: '回收站', inputs: [] },
        controller.signal
      )

      expect(result.items).toEqual([])
    })
  })
})
