import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 123 })),
  rm: vi.fn(async () => undefined),
  execFile: vi.fn(),
  toFile: vi.fn(async () => ({ size: 42, width: 64, height: 48 })),
  sharp: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: mocks.mkdir,
    stat: mocks.stat,
    rm: mocks.rm
  },
  mkdir: mocks.mkdir,
  stat: mocks.stat,
  rm: mocks.rm
}))

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile
}))

vi.mock('sharp', () => ({
  default: mocks.sharp
}))

function setupSharp(): void {
  const pipeline = {
    rotate: vi.fn(() => pipeline),
    resize: vi.fn(() => pipeline),
    jpeg: vi.fn(() => pipeline),
    toFile: mocks.toFile
  }
  mocks.sharp.mockReturnValue(pipeline)
}

describe('thumbnail-service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setupSharp()
    mocks.execFile.mockImplementation((_bin, args, callback) => {
      const cb = typeof callback === 'function' ? callback : args
      cb(null, { stdout: '10\n', stderr: '' })
    })
  })

  it('generates image thumbnails with sharp', async () => {
    const { generateThumbnail } = await import('./thumbnail-service')

    const result = await generateThumbnail({
      filePath: '/tmp/source.jpg',
      outputDir: '/tmp/thumbs',
      extension: 'jpg',
      sizeBytes: 1024
    })

    expect(result).toMatchObject({
      status: 'generated',
      kind: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: 42,
      width: 64,
      height: 48
    })
    expect(mocks.sharp).toHaveBeenCalledWith('/tmp/source.jpg', { animated: false })
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('extracts a video frame before generating a thumbnail', async () => {
    const { generateThumbnail } = await import('./thumbnail-service')

    const result = await generateThumbnail({
      filePath: '/tmp/movie.mp4',
      outputDir: '/tmp/thumbs',
      extension: 'mp4',
      sizeBytes: 1024,
      ffmpegPath: '/bin/ffmpeg',
      ffprobePath: '/bin/ffprobe'
    })

    expect(result).toMatchObject({
      status: 'generated',
      kind: 'video'
    })
    expect(mocks.execFile).toHaveBeenCalledWith(
      '/bin/ffprobe',
      expect.arrayContaining(['/tmp/movie.mp4']),
      expect.any(Function)
    )
    expect(mocks.execFile).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.arrayContaining(['-frames:v', '1', '-an', '-y']),
      expect.any(Function)
    )
    expect(mocks.rm).toHaveBeenCalled()
  })

  it('returns failed when video thumbnail support is unavailable', async () => {
    const { generateThumbnail } = await import('./thumbnail-service')

    const result = await generateThumbnail({
      filePath: '/tmp/movie.mp4',
      outputDir: '/tmp/thumbs',
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
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('returns unsupported for oversized images', async () => {
    const { generateThumbnail } = await import('./thumbnail-service')

    const result = await generateThumbnail({
      filePath: '/tmp/huge.jpg',
      outputDir: '/tmp/thumbs',
      extension: 'jpg',
      sizeBytes: 100 * 1024 * 1024
    })

    expect(result).toMatchObject({
      status: 'unsupported',
      kind: 'image',
      reason: 'file-too-large'
    })
    expect(mocks.sharp).not.toHaveBeenCalled()
  })
})
