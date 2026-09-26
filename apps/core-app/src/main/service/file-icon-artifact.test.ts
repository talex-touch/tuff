import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FILE_ICON_ERROR_INVALID_CACHE_DIRECTORY,
  FILE_ICON_ERROR_INVALID_PNG,
  FILE_ICON_ERROR_TOO_LARGE,
  FILE_ICON_MAX_BYTES,
  assertFileIconPng,
  persistFileIconPng,
  persistFileIconPngArtifact,
  readBoundedFileIconBytes,
  readFileIconPngDimensions
} from './file-icon-artifact'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBytes = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([length, typeBytes, data, crc])
}

function ihdrChunk(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return pngChunk('IHDR', ihdr)
}

/**
 * A real, decodable PNG: 8-bit RGBA, one filter byte per scanline. `paddingBytes` appends a
 * `tEXt` chunk so a test can drive the byte budget without changing the declared dimensions.
 */
function makePng(width: number, height: number, paddingBytes = 0): Buffer {
  const stride = 1 + width * 4
  const scanlines = Buffer.alloc(height * stride)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const offset = row * stride + 1 + column * 4
      scanlines[offset] = (row * 7 + column) & 0xff
      scanlines[offset + 1] = (row + column * 3) & 0xff
      scanlines[offset + 2] = 0xff
      scanlines[offset + 3] = 0xff
    }
  }

  const parts = [PNG_SIGNATURE, ihdrChunk(width, height), pngChunk('IDAT', deflateSync(scanlines))]
  if (paddingBytes > 0) {
    parts.push(
      pngChunk(
        'tEXt',
        Buffer.concat([Buffer.from('c\0', 'latin1'), Buffer.alloc(paddingBytes - 2, 0x61)])
      )
    )
  }
  parts.push(pngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

/** A structurally valid PNG padded to an exact on-disk byte length. */
function pngOfByteLength(targetBytes: number): Buffer {
  const paddingBytes = targetBytes - makePng(1, 1).length - 12
  const png = makePng(1, 1, paddingBytes)
  if (png.length !== targetBytes) {
    throw new Error(`wrong fixture length ${png.length} != ${targetBytes}`)
  }
  return png
}

let cacheDirectory = ''
const tempRoots: string[] = []

beforeEach(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-icon-artifact-'))
  tempRoots.push(root)
  cacheDirectory = path.join(root, 'file-icons')
})

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => await fs.rm(root, { recursive: true, force: true }))
  )
})

async function listCacheDirectory(): Promise<string[]> {
  const entries = await fs.readdir(cacheDirectory).catch(() => [] as string[])
  return entries.sort()
}

describe('readFileIconPngDimensions', () => {
  it('reads the declared dimensions of a real PNG without decoding it', () => {
    expect(readFileIconPngDimensions(makePng(64, 32))).toEqual({ width: 64, height: 32 })
  })

  it('accepts the maximum permitted dimension and refuses one pixel more', () => {
    expect(readFileIconPngDimensions(makePng(256, 256))).toEqual({ width: 256, height: 256 })
    expect(readFileIconPngDimensions(makePng(257, 256))).toBeNull()
    expect(readFileIconPngDimensions(makePng(256, 257))).toBeNull()
  })

  it.each([
    {
      name: 'empty input',
      bytes: Buffer.alloc(0)
    },
    {
      name: 'a JPEG header',
      bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])
    },
    {
      name: 'a PNG signature truncated before IHDR ends',
      bytes: makePng(64, 64).subarray(0, 23)
    },
    {
      name: 'an IHDR chunk with the wrong declared length',
      bytes: (() => {
        const png = makePng(64, 64)
        png.writeUInt32BE(12, 8)
        return png
      })()
    },
    {
      name: 'a PNG truncated before the final chunk trailer',
      bytes: makePng(2, 2).subarray(0, makePng(2, 2).length - 4)
    },
    {
      name: 'a chunk whose declared length runs past the buffer',
      bytes: (() => {
        const png = makePng(2, 2)
        png.writeUInt32BE(0xffff, png.indexOf('IDAT') - 4)
        return png
      })()
    },
    {
      name: 'a PNG with no IDAT chunk',
      bytes: Buffer.concat([PNG_SIGNATURE, ihdrChunk(2, 2), pngChunk('IEND', Buffer.alloc(0))])
    },
    {
      name: 'a zero-width image',
      bytes: makePng(64, 64).fill(0, 16, 20)
    }
  ])('returns null rather than throwing for $name', ({ bytes }) => {
    expect(readFileIconPngDimensions(bytes)).toBeNull()
  })
})

describe('assertFileIconPng', () => {
  it('reports the byte count of the accepted PNG', () => {
    const png = makePng(48, 48)
    expect(assertFileIconPng(png)).toEqual({ width: 48, height: 48, bytes: png.byteLength })
  })

  it('refuses empty output as an invalid PNG', () => {
    expect(() => assertFileIconPng(Buffer.alloc(0))).toThrow(
      expect.objectContaining({ code: FILE_ICON_ERROR_INVALID_PNG })
    )
  })

  it('refuses output one byte over the byte budget', () => {
    expect(() => assertFileIconPng(pngOfByteLength(FILE_ICON_MAX_BYTES + 1))).toThrow(
      expect.objectContaining({ code: FILE_ICON_ERROR_TOO_LARGE })
    )
  })

  it('accepts output exactly at the byte budget', () => {
    expect(assertFileIconPng(pngOfByteLength(FILE_ICON_MAX_BYTES)).bytes).toBe(FILE_ICON_MAX_BYTES)
  })
})

describe('persistFileIconPng', () => {
  it('writes the exact bytes to an absolute path inside the cache directory', async () => {
    const png = makePng(64, 64)

    const storedPath = await persistFileIconPng(png, cacheDirectory)

    expect(path.isAbsolute(storedPath)).toBe(true)
    expect(path.dirname(storedPath)).toBe(cacheDirectory)
    expect(path.extname(storedPath)).toBe('.png')
    expect(await fs.readFile(storedPath)).toEqual(png)
    expect(await listCacheDirectory()).toEqual([path.basename(storedPath)])
  })

  it('creates a missing cache directory instead of writing to a relative fallback', async () => {
    expect(await fs.stat(cacheDirectory).catch(() => null)).toBeNull()

    const storedPath = await persistFileIconPng(makePng(16, 16), cacheDirectory)

    expect(path.dirname(storedPath)).toBe(cacheDirectory)
    expect((await fs.stat(cacheDirectory)).isDirectory()).toBe(true)
  })

  it('names the artifact by content so identical bytes collapse onto one file', async () => {
    const png = makePng(32, 32)

    const first = await persistFileIconPng(png, cacheDirectory)
    const firstStat = await fs.stat(first)
    const second = await persistFileIconPng(Buffer.from(png), cacheDirectory)

    expect(second).toBe(first)
    // The dedup path must return the artifact, not rewrite it: an unchanged inode is what keeps a
    // repeated persist from re-staging a megabyte of identical icons.
    const secondStat = await fs.stat(second)
    expect(secondStat.ino).toBe(firstStat.ino)
    expect(await listCacheDirectory()).toEqual([path.basename(first)])
  })

  it('keeps different images in different artifacts', async () => {
    const first = await persistFileIconPng(makePng(32, 32), cacheDirectory)
    const second = await persistFileIconPng(makePng(33, 33), cacheDirectory)

    expect(second).not.toBe(first)
    expect(await listCacheDirectory()).toHaveLength(2)
  })

  it('stores only the passed view of a larger buffer', async () => {
    const png = makePng(24, 24)
    const padded = Buffer.concat([Buffer.alloc(64, 0xaa), png, Buffer.alloc(64, 0xbb)])

    const storedPath = await persistFileIconPng(
      padded.subarray(64, 64 + png.length),
      cacheDirectory
    )

    expect(await fs.readFile(storedPath)).toEqual(png)
  })

  it('refuses a relative cache directory without writing anywhere', async () => {
    const relativeDirectory = path.join('file-icon-relative-check', 'file-icons')
    const absolute = path.resolve(relativeDirectory)

    await expect(persistFileIconPng(makePng(16, 16), relativeDirectory)).rejects.toMatchObject({
      code: FILE_ICON_ERROR_INVALID_CACHE_DIRECTORY
    })
    await expect(persistFileIconPng(makePng(16, 16), '')).rejects.toMatchObject({
      code: FILE_ICON_ERROR_INVALID_CACHE_DIRECTORY
    })

    expect(await fs.stat(absolute).catch(() => null)).toBeNull()
  })

  it('rejects an oversize PNG before creating the cache directory', async () => {
    await expect(
      persistFileIconPng(pngOfByteLength(FILE_ICON_MAX_BYTES + 1), cacheDirectory)
    ).rejects.toMatchObject({ code: FILE_ICON_ERROR_TOO_LARGE })

    expect(await fs.stat(cacheDirectory).catch(() => null)).toBeNull()
  })

  it('rejects an over-dimension PNG before creating the cache directory', async () => {
    await expect(persistFileIconPng(makePng(512, 1), cacheDirectory)).rejects.toMatchObject({
      code: FILE_ICON_ERROR_INVALID_PNG
    })

    expect(await fs.stat(cacheDirectory).catch(() => null)).toBeNull()
  })

  it('refuses a structurally valid PNG that does not decode', async () => {
    const notAnImage = Buffer.concat([
      PNG_SIGNATURE,
      ihdrChunk(2, 2),
      pngChunk('IDAT', Buffer.from('this is not a deflate stream')),
      pngChunk('IEND', Buffer.alloc(0))
    ])
    // The chunk walk cannot tell: only the bounded decode can.
    expect(readFileIconPngDimensions(notAnImage)).toEqual({ width: 2, height: 2 })

    await expect(persistFileIconPng(notAnImage, cacheDirectory)).rejects.toMatchObject({
      code: FILE_ICON_ERROR_INVALID_PNG
    })
    expect(await listCacheDirectory()).toEqual([])
  })

  it('leaves previously stored icons and unrelated files untouched when an icon is rejected', async () => {
    const good = await persistFileIconPng(makePng(48, 48), cacheDirectory)
    await fs.writeFile(path.join(cacheDirectory, 'user-owned.txt'), 'not an icon')

    await expect(
      persistFileIconPng(Buffer.from('not a png'), cacheDirectory)
    ).rejects.toMatchObject({ code: FILE_ICON_ERROR_INVALID_PNG })

    expect(await fs.readFile(good)).toEqual(makePng(48, 48))
    expect(await listCacheDirectory()).toEqual([path.basename(good), 'user-owned.txt'].sort())
  })

  it('leaves no staging residue behind after a successful write', async () => {
    await persistFileIconPng(makePng(40, 40), cacheDirectory)
    await persistFileIconPng(makePng(41, 41), cacheDirectory)

    expect((await listCacheDirectory()).filter((entry) => entry.startsWith('.tmp-'))).toEqual([])
  })
})

describe('persistFileIconPngArtifact', () => {
  it('reports the artifact as created once and reused afterwards', async () => {
    const png = makePng(64, 64)

    const created = await persistFileIconPngArtifact(png, cacheDirectory)
    const reused = await persistFileIconPngArtifact(Buffer.from(png), cacheDirectory)

    expect(created).toMatchObject({ created: true, bytes: png.byteLength })
    expect(reused).toMatchObject({ path: created.path, created: false })
    expect(await fs.readFile(created.path)).toEqual(png)
    expect(await listCacheDirectory()).toEqual([path.basename(created.path)])
  })
})

describe('readBoundedFileIconBytes', () => {
  it('returns the bytes of a stored icon', async () => {
    const png = makePng(20, 20)
    const storedPath = await persistFileIconPng(png, cacheDirectory)

    expect(await readBoundedFileIconBytes(storedPath)).toEqual(png)
  })

  it('reads a file exactly at the byte budget', async () => {
    const boundedPath = path.join(cacheDirectory, 'at-budget.png')
    await fs.mkdir(cacheDirectory, { recursive: true })
    const bytes = pngOfByteLength(FILE_ICON_MAX_BYTES)
    await fs.writeFile(boundedPath, bytes)

    expect(await readBoundedFileIconBytes(boundedPath)).toEqual(bytes)
  })

  it.each([
    {
      name: 'a missing file',
      create: async () => path.join(cacheDirectory, 'absent.png')
    },
    {
      name: 'a directory',
      create: async () => {
        await fs.mkdir(cacheDirectory, { recursive: true })
        return cacheDirectory
      }
    },
    {
      name: 'an empty file',
      create: async () => {
        await fs.mkdir(cacheDirectory, { recursive: true })
        const emptyPath = path.join(cacheDirectory, 'empty.png')
        await fs.writeFile(emptyPath, Buffer.alloc(0))
        return emptyPath
      }
    },
    {
      name: 'a file over the byte budget',
      create: async () => {
        await fs.mkdir(cacheDirectory, { recursive: true })
        const oversizedPath = path.join(cacheDirectory, 'oversized.png')
        await fs.writeFile(oversizedPath, pngOfByteLength(FILE_ICON_MAX_BYTES + 1))
        return oversizedPath
      }
    }
  ])('refuses to allocate for $name', async ({ create }) => {
    expect(await readBoundedFileIconBytes(await create())).toBeNull()
  })
})
