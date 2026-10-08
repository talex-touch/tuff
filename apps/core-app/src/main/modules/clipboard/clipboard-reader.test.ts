import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readText: vi.fn(() => 'electron-text'),
  readHTML: vi.fn(() => '<b>electron</b>'),
  readImage: vi.fn((): { isEmpty: () => boolean } => ({ isEmpty: () => true })),
  readBuffer: vi.fn((_format: string): Buffer => Buffer.alloc(0)),
  createFromBuffer: vi.fn((buffer: Buffer) => ({ isEmpty: () => buffer.length === 0 }))
}))

vi.mock('electron', () => ({
  clipboard: {
    readText: mocks.readText,
    readHTML: mocks.readHTML,
    readImage: mocks.readImage,
    readBuffer: mocks.readBuffer
  },
  nativeImage: {
    createFromBuffer: mocks.createFromBuffer
  }
}))

import {
  ElectronClipboardReader,
  NativeClipboardReader,
  hasNativeReaderApi,
  isPngBuffer
} from './clipboard-reader'

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]

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

  it('hands the native PNG bytes over without re-encoding, and only when they are PNG', async () => {
    const png = new NativeClipboardReader({ getImageBinary: async () => PNG_BYTES })
    const read = await png.readImageWithEncoded()
    expect(read?.image).not.toBeNull()
    expect(read?.png).toEqual(Buffer.from(PNG_BYTES))

    const notPng = new NativeClipboardReader({ getImageBinary: async () => [1, 2, 3, 4] })
    await expect(notPng.readImageWithEncoded()).resolves.toEqual({
      image: expect.anything(),
      png: null
    })
    expect(isPngBuffer(Buffer.from([1, 2, 3, 4]))).toBe(false)
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

  it('reads the raw PNG off the pasteboard when the OS has one', async () => {
    const reader = new ElectronClipboardReader({ readFiles: () => [] })
    const image = { isEmpty: () => false }
    mocks.readImage.mockReturnValueOnce(image)
    mocks.readBuffer.mockReturnValueOnce(Buffer.from(PNG_BYTES))

    await expect(reader.readImageWithEncoded()).resolves.toEqual({
      image,
      png: Buffer.from(PNG_BYTES)
    })

    mocks.readImage.mockReturnValueOnce(image)
    mocks.readBuffer.mockImplementationOnce(() => {
      throw new Error('format not available')
    })
    await expect(reader.readImageWithEncoded()).resolves.toEqual({ image, png: null })
  })
})
