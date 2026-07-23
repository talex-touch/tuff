import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readText: vi.fn(() => 'electron-text'),
  readHTML: vi.fn(() => '<b>electron</b>'),
  readImage: vi.fn((): { isEmpty: () => boolean } => ({ isEmpty: () => true })),
  createFromBuffer: vi.fn((buffer: Buffer) => ({ isEmpty: () => buffer.length === 0 }))
}))

vi.mock('electron', () => ({
  clipboard: {
    readText: mocks.readText,
    readHTML: mocks.readHTML,
    readImage: mocks.readImage
  },
  nativeImage: {
    createFromBuffer: mocks.createFromBuffer
  }
}))

import {
  ElectronClipboardReader,
  NativeClipboardReader,
  hasNativeReaderApi
} from './clipboard-reader'

describe('hasNativeReaderApi', () => {
  it('is true only when every async getter is present', () => {
    expect(
      hasNativeReaderApi({
        getText: async () => '',
        getHtml: async () => '',
        getFiles: async () => [],
        getImageBinary: async () => []
      })
    ).toBe(true)
    expect(hasNativeReaderApi({ getText: async () => '' })).toBe(false)
    expect(hasNativeReaderApi(null)).toBe(false)
    expect(hasNativeReaderApi(undefined)).toBe(false)
  })
})

describe('NativeClipboardReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads text/html/files off the native module', async () => {
    const reader = new NativeClipboardReader({
      getText: async () => 'native-text',
      getHtml: async () => '<i>native</i>',
      getFiles: async () => ['/a', '/b'],
      getImageBinary: async () => []
    })

    expect(reader.kind).toBe('native')
    await expect(reader.readText()).resolves.toBe('native-text')
    await expect(reader.readHtml()).resolves.toBe('<i>native</i>')
    await expect(reader.readFiles()).resolves.toEqual(['/a', '/b'])
  })

  it('decodes image bytes into a NativeImage and returns null when empty', async () => {
    const withImage = new NativeClipboardReader({
      getImageBinary: async () => [1, 2, 3, 4]
    })
    const image = await withImage.readImage()
    expect(mocks.createFromBuffer).toHaveBeenCalledWith(Buffer.from([1, 2, 3, 4]))
    expect(image).not.toBeNull()

    const noImage = new NativeClipboardReader({ getImageBinary: async () => [] })
    await expect(noImage.readImage()).resolves.toBeNull()
  })

  it('degrades to empty values when a native getter throws', async () => {
    const reader = new NativeClipboardReader({
      getText: async () => {
        throw new Error('native read failed')
      },
      getFiles: async () => {
        throw new Error('native read failed')
      },
      getImageBinary: async () => {
        throw new Error('native read failed')
      }
    })

    await expect(reader.readText()).resolves.toBe('')
    await expect(reader.readFiles()).resolves.toEqual([])
    await expect(reader.readImage()).resolves.toBeNull()
  })
})

describe('ElectronClipboardReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wraps the synchronous Electron clipboard API', async () => {
    const reader = new ElectronClipboardReader({ readFiles: () => ['/f'] })
    expect(reader.kind).toBe('electron')
    await expect(reader.readText()).resolves.toBe('electron-text')
    await expect(reader.readHtml()).resolves.toBe('<b>electron</b>')
    await expect(reader.readFiles()).resolves.toEqual(['/f'])
  })

  it('returns null for an empty image', async () => {
    const reader = new ElectronClipboardReader({ readFiles: () => [] })
    mocks.readImage.mockReturnValueOnce({ isEmpty: () => true })
    await expect(reader.readImage()).resolves.toBeNull()

    const image = { isEmpty: () => false }
    mocks.readImage.mockReturnValueOnce(image)
    await expect(reader.readImage()).resolves.toBe(image)
  })
})
