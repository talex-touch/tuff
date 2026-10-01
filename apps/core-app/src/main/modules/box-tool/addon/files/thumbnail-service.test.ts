import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateThumbnail } from './thumbnail-service'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

const tempDirs: string[] = []
const extractedFrames: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-service-'))
  tempDirs.push(dir)
  return dir
}

/**
 * A 64x64 RGBA picture whose pixels say what the encoder has to preserve: the top half is opaque
 * red, the bottom-left is fully transparent, and the bottom-right is half-transparent green.
 *
 * A JPEG encoder has no alpha channel: it composites the transparent pixels onto black and paints
 * the half-transparent green as opaque, which is exactly the "solid dark square" the PNG encoder
 * replaced. The pixel assertions below fail on both halves of that flattening.
 */
async function writeSourcePicture(filePath: string): Promise<void> {
  const size = 64
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      if (y < size / 2) {
        pixels[offset] = 255
        pixels[offset + 3] = 255
      } else if (x >= size / 2) {
        pixels[offset + 1] = 255
        pixels[offset + 3] = 128
      }
    }
  }

  await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(filePath)
}

function pixelAt(data: Buffer, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]
}

describe('thumbnail-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tempDirs.length = 0
    extractedFrames.length = 0

    // FFmpeg is a real external boundary, so it stays faked — but the fake materializes a real
    // frame on disk, which is what lets the encoder downstream be the real one.
    execFileMock.mockImplementation((bin: string, args: string[], callback: unknown) => {
      const done = (typeof callback === 'function' ? callback : args) as (
        error: Error | null,
        result?: unknown
      ) => void
      if (bin.includes('ffprobe')) {
        done(null, { stdout: '10\n', stderr: '' })
        return
      }

      const framePath = args[args.length - 1]
      extractedFrames.push(framePath)
      void sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: 12, g: 34, b: 56 } }
      })
        .jpeg()
        .toFile(framePath)
        .then(
          () => done(null, { stdout: '', stderr: '' }),
          (error: Error) => done(error)
        )
    })
  })

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('writes image thumbnails as PNG and keeps the source alpha and colors', async () => {
    const outputDir = await createTempDir()
    const sourcePath = path.join(outputDir, 'logo.png')
    await writeSourcePicture(sourcePath)

    const result = await generateThumbnail({
      filePath: sourcePath,
      outputDir,
      extension: 'png',
      sizeBytes: (await fs.stat(sourcePath)).size
    })

    expect(result.status).toBe('generated')
    if (result.status !== 'generated') throw new Error('expected a generated image thumbnail')
    expect(result).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
      width: 64,
      height: 64
    })

    const bytes = await fs.readFile(result.path)
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )

    const decoded = await sharp(result.path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(decoded.info.channels).toBe(4)

    const alpha: number[] = []
    for (let index = 3; index < decoded.data.length; index += 4) alpha.push(decoded.data[index])
    // This pixel sits well inside the transparent region, where no resampling ringing reaches:
    // a JPEG encoder would deliver 255 here because it has no alpha channel to deliver.
    expect(pixelAt(decoded.data, decoded.info.width, 4, 60)[3]).toBe(0)
    // Under JPEG every pixel arrives opaque; only the source's opaque top half may be 255.
    const opaqueCount = alpha.filter((value) => value === 255).length
    expect(opaqueCount).toBeLessThan(alpha.length * 0.75)

    // Half-transparent green keeps partial alpha instead of flattening to fully opaque.
    const semi = pixelAt(decoded.data, decoded.info.width, 48, 48)
    expect(semi[3]).toBeGreaterThan(0)
    expect(semi[3]).toBeLessThan(255)
    expect(semi[1]).toBeGreaterThan(semi[0])
    expect(semi[1]).toBeGreaterThan(semi[2])

    // The opaque half keeps its own color rather than being composited onto black.
    const opaque = pixelAt(decoded.data, decoded.info.width, 16, 16)
    expect(opaque[0]).toBeGreaterThan(240)
    expect(opaque[1]).toBeLessThan(15)
    expect(opaque[2]).toBeLessThan(15)
    expect(opaque[3]).toBe(255)

    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('keeps video thumbnails as opaque JPEG frames and removes the extracted frame', async () => {
    const outputDir = await createTempDir()
    const videoPath = path.join(outputDir, 'movie.mp4')

    const result = await generateThumbnail({
      filePath: videoPath,
      outputDir,
      extension: 'mp4',
      sizeBytes: 1024,
      ffmpegPath: '/bin/ffmpeg',
      ffprobePath: '/bin/ffprobe'
    })

    expect(result.status).toBe('generated')
    if (result.status !== 'generated') throw new Error('expected a generated video thumbnail')
    expect(result).toMatchObject({ kind: 'video', mimeType: 'image/jpeg' })

    const bytes = await fs.readFile(result.path)
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    await expect(sharp(result.path).metadata()).resolves.toMatchObject({ format: 'jpeg' })

    expect(execFileMock).toHaveBeenCalledWith(
      '/bin/ffprobe',
      expect.arrayContaining([videoPath]),
      expect.any(Function)
    )
    expect(execFileMock).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.arrayContaining(['-frames:v', '1', '-an', '-y']),
      expect.any(Function)
    )

    // The extracted frame is a scratch file: only the encoded thumbnail survives the call.
    await expect(fs.access(extractedFrames[0]!)).rejects.toThrow()
  })

  it('returns failed when video thumbnail support is unavailable', async () => {
    const outputDir = await createTempDir()

    const result = await generateThumbnail({
      filePath: path.join(outputDir, 'movie.mp4'),
      outputDir,
      extension: 'mp4',
      sizeBytes: 1024,
      ffmpegPath: null,
      ffprobePath: null
    })

    expect(result).toMatchObject({
      status: 'failed',
      kind: 'video',
      reason: 'ffmpeg-unavailable'
    })
    expect(execFileMock).not.toHaveBeenCalled()
    await expect(fs.readdir(outputDir)).resolves.toEqual([])
  })

  it('returns unsupported for oversized images without writing anything', async () => {
    const outputDir = await createTempDir()

    const result = await generateThumbnail({
      filePath: path.join(outputDir, 'huge.jpg'),
      outputDir,
      extension: 'jpg',
      sizeBytes: 100 * 1024 * 1024
    })

    expect(result).toMatchObject({
      status: 'unsupported',
      kind: 'image',
      reason: 'file-too-large'
    })
    await expect(fs.readdir(outputDir)).resolves.toEqual([])
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
