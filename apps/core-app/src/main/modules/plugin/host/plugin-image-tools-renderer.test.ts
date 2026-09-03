import { EventEmitter } from 'node:events'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { createSharpPluginImageToolsRenderer } from './plugin-image-tools-renderer'
import { createWorkerPluginImageToolsRenderer } from './plugin-image-tools-worker-client'

const workerMock = vi.hoisted(() => ({ instances: [] as EventEmitter[], terminations: 0 }))

vi.mock('node:worker_threads', () => ({
  Worker: class FakeWorker extends EventEmitter {
    constructor() {
      super()
      workerMock.instances.push(this)
    }

    postMessage() {}

    terminate() {
      workerMock.terminations += 1
      return Promise.resolve(0)
    }
  }
}))

const transparentPixel = sharp({
  create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
})
  .png()
  .toBuffer()

async function source(): Promise<Buffer> {
  return await transparentPixel
}

function request(format: 'png' | 'webp' | 'jpeg' | 'ico', width?: number, height?: number) {
  return {
    format,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(format === 'webp' || format === 'jpeg' ? { quality: 82 } : {}),
    source: { format: 'png', width: 1, height: 1 }
  }
}

function icoEntries(data: Buffer): Array<{ size: number; bytes: number; offset: number }> {
  expect(data.readUInt16LE(0)).toBe(0)
  expect(data.readUInt16LE(2)).toBe(1)
  return Array.from({ length: data.readUInt16LE(4) }, (_value, index) => {
    const start = 6 + index * 16
    return {
      size: data.readUInt8(start) || 256,
      bytes: data.readUInt32LE(start + 8),
      offset: data.readUInt32LE(start + 12)
    }
  })
}

describe('Sharp image-tools renderer', () => {
  it('emits parseable PNG, WebP, and JPEG at the requested exact canvas size', async () => {
    const renderer = createSharpPluginImageToolsRenderer()
    const input = await source()
    const signal = new AbortController().signal
    const expectedMagic: Record<'png' | 'webp' | 'jpeg', (data: Buffer) => void> = {
      png: (data) =>
        expect(data.subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ),
      webp: (data) => {
        expect(data.subarray(0, 4).toString('ascii')).toBe('RIFF')
        expect(data.subarray(8, 12).toString('ascii')).toBe('WEBP')
      },
      jpeg: (data) => expect(data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    }

    for (const format of ['png', 'webp', 'jpeg'] as const) {
      const rendered = await renderer.render(input, request(format, 64, 64), signal)
      expectedMagic[format](rendered.data)
      expect(rendered).toMatchObject({ width: 64, height: 64 })
      await expect(sharp(rendered.data).metadata()).resolves.toMatchObject({
        width: 64,
        height: 64,
        format
      })
    }
  })

  it('flattens transparent JPEG pixels onto white rather than black', async () => {
    const renderer = createSharpPluginImageToolsRenderer()
    const rendered = await renderer.render(
      await source(),
      request('jpeg', 1, 1),
      new AbortController().signal
    )
    const pixel = await sharp(rendered.data).ensureAlpha().raw().toBuffer()

    expect([...pixel.subarray(0, 4)]).toEqual([255, 255, 255, 255])
  })

  it('builds PNG-backed ICO directories at the fixed standard sizes or one requested square size', async () => {
    const renderer = createSharpPluginImageToolsRenderer()
    const input = await source()
    const standard = await renderer.render(input, request('ico'), new AbortController().signal)
    const standardEntries = icoEntries(standard.data)
    expect(standardEntries.map((entry) => entry.size)).toEqual([16, 32, 48, 64, 128, 256])
    for (const entry of standardEntries) {
      expect(standard.data.subarray(entry.offset, entry.offset + 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
      expect(entry.bytes).toBeGreaterThan(8)
    }

    const single = await renderer.render(
      input,
      request('ico', 48, 48),
      new AbortController().signal
    )
    expect(icoEntries(single.data).map((entry) => entry.size)).toEqual([48])
  })

  it('rejects SVG, animated GIF, over-limit input, and invalid ICO geometry before producing output', async () => {
    const renderer = createSharpPluginImageToolsRenderer()
    const signal = new AbortController().signal
    const animatedGif = Buffer.from(
      'R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAIfkEAAAAAAAsAAAAAAEAAQAAAgJEAQA7',
      'base64'
    )

    await expect(
      renderer.inspect(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), signal)
    ).rejects.toThrow('PLUGIN_IMAGE_TOOLS_UNSUPPORTED_FORMAT')
    await expect(renderer.inspect(animatedGif, signal)).rejects.toThrow(
      'PLUGIN_IMAGE_TOOLS_ANIMATED_INPUT'
    )
    await expect(renderer.inspect(Buffer.alloc(32 * 1024 * 1024 + 1), signal)).rejects.toThrow(
      'PLUGIN_IMAGE_TOOLS_INPUT_TOO_LARGE'
    )
    await expect(renderer.render(await source(), request('png', 64), signal)).rejects.toThrow(
      'PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS'
    )
    await expect(
      renderer.render(await source(), request('png', undefined, 64), signal)
    ).rejects.toThrow('PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS')
    await expect(renderer.render(await source(), request('ico', 32, 48), signal)).rejects.toThrow(
      'PLUGIN_IMAGE_TOOLS_ICO_SQUARE_REQUIRED'
    )
  })

  it('rejects a worker-backed render immediately on AbortSignal without awaiting a silent worker', async () => {
    workerMock.instances.length = 0
    workerMock.terminations = 0
    const renderer = createWorkerPluginImageToolsRenderer()
    const controller = new AbortController()
    const pending = renderer.inspect(Buffer.from('host-owned-input'), controller.signal)

    expect(workerMock.instances).toHaveLength(1)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    expect(workerMock.terminations).toBe(1)
  })
})
