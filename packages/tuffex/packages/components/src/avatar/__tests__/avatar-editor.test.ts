import { config, mount } from '@vue/test-utils'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { TxFileUploader } from '../../file-uploader'
import AvatarEditorSlider from '../src/editor/AvatarEditorSlider.vue'
import { encodeBmp } from '../src/editor/bmp-encoder'
import {
  buildCanvasFilter,
  clampTransform,
  computeContainZoom,
  computeCoverZoom,
  computeTransformMetrics,
  normalizeRotation,
  traceMaskPath,
} from '../src/editor/geometry'
import { decodeGif, encodeGif } from '../src/editor/gif-codec'
import { encodeIco, extractBestIcoEntry, parseIcoEntries, resolveIcoSizes } from '../src/editor/ico-codec'
import { buildOutputFileName, computeVideoGifClipSchedule, exportAvatarMedia, formatByteSize, formatMediaTime, isBlobMimeMatchingFormat, resetSupportedAvatarFormatsCache, selectOverlappingGifFrames } from '../src/editor/media-codecs'
import * as mediaCodecs from '../src/editor/media-codecs'
import { detectAvatarSourceKind, isAnimatedWebpBytes, isApngBlob, isApngBytes, loadAvatarMedia, readBlobArrayBuffer, seekVideoElement, sniffAvatarKindFromBytes } from '../src/editor/media-loader'
import * as mediaLoader from '../src/editor/media-loader'
import { createStageMotion } from '../src/editor/stage-motion'
import { buildRasterAvatarSvg, buildVectorAvatarSvg, parseAndSanitizeSvg } from '../src/editor/svg-codec'
import TxAvatarEditor from '../src/editor/TxAvatarEditor.vue'
import { DEFAULT_AVATAR_TRANSFORM } from '../src/editor/types'
import TxAvatar from '../src/TxAvatar.vue'

describe('avatar editor geometry & helpers', () => {
  it('normalizes rotation angles into [-180, 180]', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(90)).toBe(90)
    expect(normalizeRotation(270)).toBe(-90)
    expect(normalizeRotation(-270)).toBe(90)
    expect(normalizeRotation(540)).toBe(180)
  })

  it('computes contain and cover zoom for non-square rotated media', () => {
    const containWide = computeContainZoom({ width: 400, height: 200 }, 0)
    expect(containWide).toBeCloseTo(0.5, 4)

    const coverSquare45 = computeCoverZoom({ width: 300, height: 300 }, 45)
    expect(coverSquare45).toBeCloseTo(Math.SQRT2, 3)
  })

  it('keeps transform metrics resolution-independent and clamps extreme values', () => {
    const m1 = computeTransformMetrics({ width: 400, height: 200 }, { ...DEFAULT_AVATAR_TRANSFORM, zoom: 2, offsetX: 0.25 }, 200)
    const m2 = computeTransformMetrics({ width: 400, height: 200 }, { ...DEFAULT_AVATAR_TRANSFORM, zoom: 2, offsetX: 0.25 }, 400)

    expect(m2.drawScale / m1.drawScale).toBeCloseTo(2, 5)
    expect(m2.centerX / m1.centerX).toBeCloseTo(2, 5)

    const clamped = clampTransform({ ...DEFAULT_AVATAR_TRANSFORM, zoom: 99, offsetX: 50, brightness: 500 }, { width: 200, height: 200 }, 0.4, 6)
    expect(clamped.zoom).toBe(6)
    expect(clamped.brightness).toBe(150)
    expect(clamped.offsetX).toBeLessThan(10)
  })

  it('builds CSS canvas filter strings only for modified channels', () => {
    expect(buildCanvasFilter({ ...DEFAULT_AVATAR_TRANSFORM })).toBe('none')
    expect(buildCanvasFilter({ ...DEFAULT_AVATAR_TRANSFORM, brightness: 120, saturation: 80 })).toBe('brightness(120%) saturate(80%)')
  })

  it('preserves outer path when traceMaskPath runs with begin=false for evenodd scrim cutouts', () => {
    const calls: string[] = []
    const mockCtx = {
      beginPath: () => calls.push('beginPath'),
      rect: () => calls.push('rect'),
      moveTo: () => calls.push('moveTo'),
      arc: () => calls.push('arc'),
      arcTo: () => calls.push('arcTo'),
      closePath: () => calls.push('closePath'),
    } as unknown as CanvasRenderingContext2D

    mockCtx.beginPath()
    mockCtx.rect(0, 0, 312, 312)
    traceMaskPath(mockCtx, 'circle', 0, 0, 312, false)
    expect(calls.filter(c => c === 'beginPath')).toHaveLength(1)
    expect(calls).toContain('moveTo')
    expect(calls).toContain('arc')
  })

  it('sniffs animated WebP (VP8X) and APNG (acTL) binary headers', () => {
    const animWebp = new Uint8Array(24)
    animWebp.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
    animWebp.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
    animWebp.set([0x56, 0x50, 0x38, 0x58], 12) // VP8X
    animWebp[20] = 0x02 // animation flag
    expect(isAnimatedWebpBytes(animWebp)).toBe(true)
    animWebp[20] = 0x10 // alpha only, no animation
    expect(isAnimatedWebpBytes(animWebp)).toBe(false)

    const apng = new Uint8Array(40)
    apng.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0)
    apng.set([0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4C], 8) // chunk len=8, type='acTL'
    expect(isApngBytes(apng)).toBe(true)

    const staticPng = new Uint8Array(40)
    staticPng.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0)
    staticPng.set([0, 0, 0, 4, 0x49, 0x44, 0x41, 0x54], 8) // IDAT directly
    expect(isApngBytes(staticPng)).toBe(false)
  })

  it('detects media source kinds across images, icons, vectors, GIFs, and videos', () => {
    expect(detectAvatarSourceKind(new File([''], 'clip.mp4', { type: 'video/mp4' }))).toBe('video')
    expect(detectAvatarSourceKind(new File([''], 'clip.webm', { type: '' }))).toBe('video')
    expect(detectAvatarSourceKind(new File([''], 'loop.gif', { type: 'image/gif' }))).toBe('gif')
    expect(detectAvatarSourceKind(new File([''], 'brand.svg', { type: 'image/svg+xml' }))).toBe('svg')
    expect(detectAvatarSourceKind(new File([''], 'favicon.ico', { type: 'image/x-icon' }))).toBe('ico')
    expect(detectAvatarSourceKind(new File([''], 'photo.png', { type: 'image/png' }))).toBe('image')
    expect(detectAvatarSourceKind('data:image/svg+xml;utf8,<svg/>')).toBe('svg')
    expect(detectAvatarSourceKind('https://cdn.example.com/intro.mov?v=1')).toBe('video')
  })

  it('formats filenames, byte sizes, and media timestamps cleanly', () => {
    expect(buildOutputFileName('profile.mp4', 'ico')).toBe('profile.ico')
    expect(buildOutputFileName('avatar.png', 'jpeg', 'custom')).toBe('custom.jpg')
    expect(formatByteSize(512)).toBe('512 B')
    expect(formatByteSize(2048)).toBe('2.0 KB')
    expect(formatMediaTime(65.4)).toBe('01:05.4')
  })
})

describe('avatar editor binary codecs', () => {
  it('round-trips multi-resolution ICO containers and extracts the largest PNG frame', async () => {
    const png16 = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])
    const png256 = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 9, 8, 7, 6, 5, 4])

    const blob = encodeIco([
      { width: 16, height: 16, pngBytes: png16 },
      { width: 256, height: 256, pngBytes: png256 },
    ])
    expect(blob.type).toBe('image/x-icon')

    const buffer = await readBlobArrayBuffer(blob)
    const entries = parseIcoEntries(buffer)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ width: 16, height: 16, bytesInRes: png16.length })
    expect(entries[1]).toMatchObject({ width: 256, height: 256, bytesInRes: png256.length })

    const best = extractBestIcoEntry(buffer)
    expect(best).not.toBeNull()
    expect(best?.width).toBe(256)
    expect(best?.isPng).toBe(true)
    expect(best?.blob.type).toBe('image/png')
    expect(Array.from(best!.bytes)).toEqual(Array.from(png256))

    expect(resolveIcoSizes(100)).toEqual([16, 32, 48, 64, 100])
    expect(resolveIcoSizes(512)).toEqual([16, 32, 48, 64, 128, 256])
  })

  it('encodes 24-bit and 32-bit Windows BMP buffers with bottom-up BGR pixel order', async () => {
    // 3x2 image (non-multiple-of-4 width tests 4-byte row padding)
    const rgba = new Uint8ClampedArray([
      // top row: red, green, blue
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      // bottom row: white, black, yellow
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 0, 128,
    ])

    const bmp24 = encodeBmp(rgba, 3, 2, { alpha: false })
    expect(bmp24.type).toBe('image/bmp')
    const bytes = new Uint8Array(await readBlobArrayBuffer(bmp24))
    const view = new DataView(bytes.buffer)
    // Header 'BM', width=3, height=2, bpp=24, stride=12 bytes -> 54 + 24 = 78 bytes
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('BM')
    expect(view.getInt32(18, true)).toBe(3)
    expect(view.getInt32(22, true)).toBe(2)
    expect(view.getUint16(28, true)).toBe(24)
    expect(bytes.length).toBe(78)
    // First stored row is bottom row; first pixel is white (255,255,255)
    expect([bytes[54], bytes[55], bytes[56]]).toEqual([255, 255, 255])
    // Second stored row is top row (offset 54 + 12 = 66); first pixel is red -> BGR (0, 0, 255)
    expect([bytes[66], bytes[67], bytes[68]]).toEqual([0, 0, 255])

    const bmp32 = encodeBmp(rgba, 3, 2, { alpha: true })
    const bytes32 = new Uint8Array(await readBlobArrayBuffer(bmp32))
    expect(bytes32.length).toBe(54 + 3 * 2 * 4)
    // Bottom-right pixel (index 2 in first row = 54 + 8) has alpha 128
    expect(bytes32[54 + 11]).toBe(128)
  })

  it('sanitizes SVG input and preserves vector transforms or wraps raster output', () => {
    const dirtySvg = `<svg viewBox="0 0 100 100" width="100" height="100"><script>alert(1)</script><circle cx="50" cy="50" r="40" fill="#409eff" onclick="evil()" /><a href="javascript:alert(2)"><rect width="10" height="10" /></a></svg>`
    const parsed = parseAndSanitizeSvg(dirtySvg)
    expect(parsed).not.toBeNull()
    expect(parsed!.innerMarkup).not.toContain('<script')
    expect(parsed!.innerMarkup).not.toContain('onclick')
    expect(parsed!.innerMarkup).not.toContain('javascript:')
    expect(parsed!.innerMarkup).toContain('<circle')

    const vectorOut = buildVectorAvatarSvg(
      parsed!,
      { ...DEFAULT_AVATAR_TRANSFORM, rotation: 90, flipX: true, maskClip: true, background: '#111827' },
      'circle',
      256,
    )
    expect(vectorOut).toContain('viewBox="0 0 256 256"')
    expect(vectorOut).toContain('clipPath id="tx-avatar-clip"')
    expect(vectorOut).toContain('rotate(90)')
    expect(vectorOut).toContain('fill="#111827"')

    const rasterOut = buildRasterAvatarSvg('data:image/png;base64,AAAA', 'rounded', true, 128)
    expect(rasterOut).toContain('<image href="data:image/png;base64,AAAA"')
    expect(rasterOut).toContain('clip-path="url(#tx-avatar-clip)"')
  })

  it('round-trips multi-frame animated GIF89a with transparency and large LZW streams', () => {
    const w = 16
    const h = 16
    const makeFrame = (r: number, g: number, b: number, delayMs: number) => {
      const rgba = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          // Top-left 4x4 corner stays transparent
          if (x < 4 && y < 4) {
            rgba[i + 3] = 0
          }
          else {
            rgba[i] = r
            rgba[i + 1] = g
            rgba[i + 2] = b
            rgba[i + 3] = 255
          }
        }
      }
      return { rgba, width: w, height: h, delayMs }
    }

    const encoded = encodeGif([
      makeFrame(220, 40, 40, 80),
      makeFrame(40, 180, 90, 120),
    ], { width: w, height: h, loop: 0 })

    expect(String.fromCharCode(...encoded.subarray(0, 6))).toBe('GIF89a')
    expect(encoded[encoded.length - 1]).toBe(0x3B)

    const decoded = decodeGif(encoded)
    expect(decoded.width).toBe(w)
    expect(decoded.height).toBe(h)
    expect(decoded.frames).toHaveLength(2)
    expect(decoded.frames[0]!.delayMs).toBe(80)
    expect(decoded.frames[1]!.delayMs).toBe(120)

    // Transparent corner remains transparent on both frames
    expect(decoded.frames[0]!.rgba[3]).toBe(0)
    expect(decoded.frames[1]!.rgba[3]).toBe(0)
    // Center pixel matches frame 0 red & frame 1 green
    const center = (8 * w + 8) * 4
    expect(decoded.frames[0]!.rgba[center]).toBeGreaterThan(200)
    expect(decoded.frames[1]!.rgba[center + 1]).toBeGreaterThan(160)

    // Stress LZW dictionary growth past 4096 clear codes using a high-entropy 64x64 frame
    const sw = 64
    const sh = 64
    const noisy = new Uint8ClampedArray(sw * sh * 4)
    for (let i = 0; i < sw * sh; i++) {
      noisy[i * 4] = (i * 37) & 255
      noisy[i * 4 + 1] = (i * 73) & 255
      noisy[i * 4 + 2] = (i * 151) & 255
      noisy[i * 4 + 3] = 255
    }
    const bigGif = encodeGif([{ rgba: noisy, width: sw, height: sh, delayMs: 100 }], { width: sw, height: sh })
    const bigDecoded = decodeGif(bigGif)
    expect(bigDecoded.frames).toHaveLength(1)
    expect(bigDecoded.frames[0]!.rgba.length).toBe(sw * sh * 4)
    expect(bigDecoded.frames[0]!.rgba[sw * sh * 4 - 1]).toBe(255)
  })
})

describe('txAvatar editable integration & TxAvatarEditor', () => {
  const originalStubs = config.global.stubs
  let getContextSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeAll(() => {
    config.global.stubs = { ...originalStubs, teleport: true }
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterAll(() => {
    config.global.stubs = originalStubs
    getContextSpy?.mockRestore()
  })

  it('adds no edit overlay or editor DOM when editable is false', () => {
    const wrapper = mount(TxAvatar, { props: { name: 'Plain User' } })
    expect(wrapper.find('.tx-avatar__edit-overlay').exists()).toBe(false)
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(wrapper.findComponent(TxAvatarEditor).exists()).toBe(false)
  })

  it('opens TxAvatarEditor with TxFileUploader when an editable avatar is clicked', async () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Editable User',
        editable: true,
        editLabel: 'Change profile picture',
      },
    })

    expect(wrapper.attributes('role')).toBe('button')
    expect(wrapper.attributes('tabindex')).toBe('0')
    expect(wrapper.attributes('aria-label')).toBe('Change profile picture')
    expect(wrapper.find('.tx-avatar__edit-overlay').exists()).toBe(true)
    expect(wrapper.findComponent(TxAvatarEditor).exists()).toBe(false)

    await wrapper.trigger('click')
    await nextTick()

    expect(wrapper.emitted('edit-open')).toHaveLength(1)
    const editor = wrapper.findComponent(TxAvatarEditor)
    expect(editor.exists()).toBe(true)
    expect(editor.props('open')).toBe(true)
    expect(editor.findComponent(TxFileUploader).exists()).toBe(true)
  })

  it('blocks editing when disabled is true', async () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Locked User',
        editable: true,
        disabled: true,
      },
    })

    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    await wrapper.trigger('click')
    expect(wrapper.emitted('edit-open')).toBeUndefined()
    expect(wrapper.findComponent(TxAvatarEditor).exists()).toBe(false)
  })

  it('triggers file picker first when editTrigger is upload', async () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Quick Upload',
        editable: true,
        editTrigger: 'upload',
      },
    })

    const inputEl = wrapper.find('input[type="file"]').element as HTMLInputElement
    const clickSpy = vi.spyOn(inputEl, 'click').mockImplementation(() => {})

    await wrapper.trigger('click')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(TxAvatarEditor).exists()).toBe(false)

    clickSpy.mockRestore()
  })

  it('opens editor with dropped file and applies confirmed result to src and events', async () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Drop Target',
        editable: true,
      },
    })

    const file = new File(['<svg viewBox="0 0 16 16"></svg>'], 'icon.svg', { type: 'image/svg+xml' })
    await wrapper.trigger('drop', {
      dataTransfer: { files: [file] },
    })
    await nextTick()

    const editor = wrapper.findComponent(TxAvatarEditor)
    expect(editor.exists()).toBe(true)
    expect(editor.props('source')).toBe(file)

    const result = {
      file: new File(['abc'], 'icon.png', { type: 'image/png' }),
      blob: new Blob(['abc'], { type: 'image/png' }),
      url: 'data:image/png;base64,YWJj',
      dataUrl: 'data:image/png;base64,YWJj',
      format: 'png' as const,
      mimeType: 'image/png',
      width: 256,
      height: 256,
      size: 3,
      animated: false,
      sourceKind: 'svg' as const,
      originalFile: file,
      shape: 'circle' as const,
      transform: { ...DEFAULT_AVATAR_TRANSFORM },
    }
    editor.vm.$emit('confirm', result)
    await nextTick()

    expect(wrapper.emitted('update:src')?.[0]).toEqual([result.url])
    expect(wrapper.emitted('edit')?.[0]).toEqual([result])
    expect(wrapper.find('img.tx-avatar__image').attributes('src')).toBe(result.url)
  })

  it('emits cancel when closing TxAvatarEditor without saving', async () => {
    const wrapper = mount(TxAvatarEditor, {
      props: {
        open: true,
        labels: {
          title: '编辑头像',
          cancel: '取消',
        },
      },
    })

    expect(wrapper.text()).toContain('编辑头像')
    const cancelBtn = wrapper.find('.tx-avatar-editor__btn--secondary')
    expect(cancelBtn.text()).toBe('取消')
    await cancelBtn.trigger('click')

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

describe('avatar editor security, codecs & lifecycle guards', () => {
  const originalStubs = config.global.stubs
  let getContextSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeAll(() => {
    config.global.stubs = { ...originalStubs, teleport: true }
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterAll(() => {
    config.global.stubs = originalStubs
    getContextSpy?.mockRestore()
  })

  it('validates GIF screen/frame rects, enforces decoded byte budget, and signals truncation past maxFrames', () => {
    // 0x0 logical screen
    const zeroScreen = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0x3B])
    expect(() => decodeGif(zeroScreen)).toThrow(/Invalid GIF dimensions/i)

    // Oversized logical screen (5000x5000 > 4096)
    const hugeScreen = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
      5000 & 0xFF, (5000 >> 8) & 0xFF,
      5000 & 0xFF, (5000 >> 8) & 0xFF,
      0, 0, 0, 0x3B,
    ])
    expect(() => decodeGif(hugeScreen)).toThrow(/Invalid GIF dimensions/i)

    // Out-of-bounds frame rect (frame at left=10, w=10 inside 16x16 logical screen)
    const valid2 = encodeGif(
      [
        { rgba: new Uint8ClampedArray(8 * 8 * 4).fill(255), width: 8, height: 8, delayMs: 80 },
        { rgba: new Uint8ClampedArray(8 * 8 * 4).fill(128), width: 8, height: 8, delayMs: 80 },
        { rgba: new Uint8ClampedArray(8 * 8 * 4).fill(64), width: 8, height: 8, delayMs: 80 },
      ],
      { width: 8, height: 8 },
    )
    const badRect = new Uint8Array(valid2)
    const imgDescIdx = badRect.indexOf(0x2C)
    expect(imgDescIdx).toBeGreaterThan(0)
    // Set left = 6 on an 8px-wide frame inside 8px screen -> 6 + 8 > 8
    badRect[imgDescIdx + 1] = 6
    badRect[imgDescIdx + 2] = 0
    expect(() => decodeGif(badRect)).toThrow(/Invalid GIF frame bounds/i)

    // Cumulative decoded byte budget: 8x8x4 = 256 bytes/frame, allow only 512 bytes -> fails on 3rd frame
    expect(() => decodeGif(valid2, { maxFrames: 10, maxDecodedBytes: 512 })).toThrow(/pixel budget/i)

    // Truncation signal when frame count exceeds cap vs <= cap
    const truncated = decodeGif(valid2, { maxFrames: 2 })
    expect(truncated.frames).toHaveLength(2)
    expect(truncated.truncated).toBe(true)
    expect(truncated.totalFrameCount).toBe(3)

    const full = decodeGif(valid2, { maxFrames: 3 })
    expect(full.frames).toHaveLength(3)
    expect(full.truncated).toBe(false)
    expect(full.totalFrameCount).toBe(3)
  })

  it('trims GIFs by display-interval overlap and preserves total pacing when reducing frame count', () => {
    const frames = [
      { timestampSec: 0, delayMs: 500 }, // [0, 500)
      { timestampSec: 0.5, delayMs: 500 }, // [500, 1000)
      { timestampSec: 1.0, delayMs: 500 }, // [1000, 1500)
      { timestampSec: 1.5, delayMs: 500 }, // [1500, 2000)
    ]
    // Clip [250ms, 1250ms] overlaps frames 0 (250ms), 1 (500ms), 2 (250ms) = 1000ms total
    const slices = selectOverlappingGifFrames(frames, 250, 1250, 10)
    expect(slices).toEqual([
      { index: 0, delayMs: 250 },
      { index: 1, delayMs: 500 },
      { index: 2, delayMs: 250 },
    ])

    // Reducing 3 overlapping frames to maxFrames=2 sums represented bucket delays (still 1000ms)
    const reduced = selectOverlappingGifFrames(frames, 250, 1250, 2)
    expect(reduced).toHaveLength(2)
    expect(reduced.reduce((sum, s) => sum + s.delayMs, 0)).toBe(1000)
  })

  it('preserves full video clip duration when maxFrames caps a high-FPS clip', () => {
    // 6.0s at 15 FPS would want 90 frames; capped at 30 frames -> total delay stays 6000ms
    const schedule = computeVideoGifClipSchedule(1.0, 7.0, 15, 30)
    expect(schedule.timestamps).toHaveLength(30)
    expect(schedule.delaysMs).toHaveLength(30)
    expect(schedule.timestamps[0]).toBeCloseTo(1.0, 5)
    expect(schedule.timestamps[29]).toBeCloseTo(7.0, 5)
    expect(schedule.delaysMs.reduce((a, b) => a + b, 0)).toBe(6000)
  })

  it('keeps AVIF ISOBMFF containers on the image path while still detecting MP4/MOV video', () => {
    const makeFtyp = (major: string, compat = ''): Uint8Array => {
      const len = 16 + compat.length
      const buf = new Uint8Array(len)
      buf[3] = len
      buf.set([0x66, 0x74, 0x79, 0x70], 4) // 'ftyp'
      for (let i = 0; i < 4; i++) buf[8 + i] = major.charCodeAt(i)
      for (let i = 0; i < compat.length; i++) buf[16 + i] = compat.charCodeAt(i)
      return buf
    }

    expect(sniffAvatarKindFromBytes(makeFtyp('avif', 'avifmif1'), 'image')).toBe('image')
    expect(sniffAvatarKindFromBytes(makeFtyp('avis', 'avifmsf1'), 'image')).toBe('image')
    expect(sniffAvatarKindFromBytes(makeFtyp('mif1', 'avif'), 'image')).toBe('image')
    expect(sniffAvatarKindFromBytes(makeFtyp('isom', 'mp42'), 'image')).toBe('video')
    expect(sniffAvatarKindFromBytes(makeFtyp('qt  '), 'image')).toBe('video')
  })

  it('preserves inherited root SVG presentation attributes and flags unpreservable root styling for raster fallback', () => {
    const strokedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/></svg>`
    const parsed = parseAndSanitizeSvg(strokedSvg)
    expect(parsed).not.toBeNull()
    expect(parsed!.preservesRootStyling).toBe(true)
    expect(parsed!.rootAttributes).toMatchObject({
      'fill': 'none',
      'stroke': '#3b82f6',
      'stroke-width': '2',
      'stroke-linecap': 'round',
    })
    const out = buildVectorAvatarSvg(parsed!, { ...DEFAULT_AVATAR_TRANSFORM }, 'circle', 128)
    expect(out).toContain('fill="none"')
    expect(out).toContain('stroke="#3b82f6"')
    expect(out).toContain('stroke-width="2"')
    expect(out).toContain('stroke-linecap="round"')

    const styledRootSvg = `<svg viewBox="0 0 24 24" class="icon" style="mix-blend-mode:multiply"><circle cx="12" cy="12" r="9"/></svg>`
    const parsedStyled = parseAndSanitizeSvg(styledRootSvg)
    expect(parsedStyled).not.toBeNull()
    expect(parsedStyled!.preservesRootStyling).toBe(false)
  })

  it('validates customConverter Blob MIME type instead of relabeling mismatched bytes', async () => {
    expect(isBlobMimeMatchingFormat('image/webp', 'webp')).toBe(true)
    expect(isBlobMimeMatchingFormat('image/jpg', 'jpeg')).toBe(true)
    expect(isBlobMimeMatchingFormat('image/svg+xml;charset=utf-8', 'svg')).toBe(true)
    expect(isBlobMimeMatchingFormat('image/png', 'webp')).toBe(false)
    expect(isBlobMimeMatchingFormat('', 'png')).toBe(false)

    const fakeCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const localCtxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx)
    try {
      const media = {
        kind: 'image' as const,
        naturalWidth: 64,
        naturalHeight: 64,
        file: null,
        sourceName: 'avatar.png',
        image: {} as HTMLImageElement,
        duration: 0,
        animated: false,
        corsTainted: false,
        dispose: vi.fn(),
      }
      await expect(
        exportAvatarMedia(media, {
          format: 'webp',
          outputSize: 64,
          quality: 0.9,
          shape: 'circle',
          transform: { ...DEFAULT_AVATAR_TRANSFORM },
          customConverter: async () => new Blob(['not-webp'], { type: 'image/png' }),
        }),
      ).rejects.toThrow(/Custom converter returned "image\/png" instead of expected "image\/webp"/i)
    }
    finally {
      localCtxSpy.mockReturnValue(null)
    }
  })

  it('rejects seekVideoElement on error, setter exception, or timeout and waits for frame readiness', async () => {
    vi.useFakeTimers()
    try {
      const video = document.createElement('video')
      Object.defineProperty(video, 'duration', { value: 10, configurable: true })
      Object.defineProperty(video, 'readyState', { value: 1, configurable: true, writable: true })
      Object.defineProperty(video, 'seeking', { value: true, configurable: true, writable: true })

      let current = 2
      Object.defineProperty(video, 'currentTime', {
        get: () => current,
        set: (v: number) => {
          current = v
        },
        configurable: true,
      })

      // Even though currentTime === 2, seeking=true / readyState<2 must NOT fast-path resolve.
      const pending = seekVideoElement(video, 2)
      video.dispatchEvent(new Event('seeked'))
      ;(video as unknown as { readyState: number }).readyState = 2
      ;(video as unknown as { seeking: boolean }).seeking = false
      video.dispatchEvent(new Event('canplay'))
      await expect(pending).resolves.toBeUndefined()

      // Error event rejects
      const errPromise = seekVideoElement(video, 5)
      video.dispatchEvent(new Event('error'))
      await expect(errPromise).rejects.toThrow(/Video seek failed/i)

      // Timeout rejects
      const timeoutPromise = seekVideoElement(video, 7)
      const assertion = expect(timeoutPromise).rejects.toThrow(/Video seek timed out/i)
      await vi.advanceTimersByTimeAsync(1600)
      await assertion

      // Setter exception rejects
      Object.defineProperty(video, 'currentTime', {
        get: () => 0,
        set: () => {
          throw new Error('Seek setter failed')
        },
        configurable: true,
      })
      await expect(seekVideoElement(video, 3)).rejects.toThrow(/Seek setter failed/i)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('blocks remote http(s) URLs by default in loadAvatarMedia and always blocks javascript: URLs', async () => {
    const imgSpy = vi.spyOn(globalThis, 'Image')
    await expect(loadAvatarMedia('https://example.com/avatar.png')).rejects.toThrow(/allowRemoteSource/i)
    expect(imgSpy).not.toHaveBeenCalled()

    await expect(
      loadAvatarMedia('javascript:alert(1)', { allowRemoteSource: true }),
    ).rejects.toThrow(/Unsupported media source URL/i)
    imgSpy.mockRestore()

    // TxAvatar with remote src does not pass remote URL to TxAvatarEditor unless allowRemoteSource is set
    const avatar = mount(TxAvatar, {
      props: {
        src: 'https://example.com/user.png',
        editable: true,
      },
    })
    await avatar.trigger('click')
    await nextTick()
    expect(avatar.findComponent(TxAvatarEditor).props('source')).toBeNull()
  })

  it('enforces decoded GIF pixel budget in ImageDecoder path without falling back', async () => {
    const closeFrame = vi.fn()
    const closeDecoder = vi.fn()
    class MockImageDecoder {
      static isTypeSupported = vi.fn(async () => true)
      tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 4 } }
      decode = vi.fn(async () => ({
        image: {
          displayWidth: 256,
          displayHeight: 256,
          duration: 100_000,
          close: closeFrame,
        },
      }))

      close = closeDecoder
    }
    const origDecoder = (globalThis as Record<string, unknown>).ImageDecoder
    ;(globalThis as Record<string, unknown>).ImageDecoder = MockImageDecoder

    try {
      const tinyGif = encodeGif(
        [{ rgba: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4, delayMs: 80 }],
        { width: 4, height: 4 },
      )
      const gifFile = new File([tinyGif], 'huge.gif', { type: 'image/gif' })
      // Budget of 512 bytes cannot fit even a 16x16x4x4 downsampled GIF -> throws budget error directly
      await expect(
        loadAvatarMedia(gifFile, { maxGifDecodedBytes: 512 }),
      ).rejects.toThrow(/pixel budget/i)
      expect(closeFrame).toHaveBeenCalled()
      expect(closeDecoder).toHaveBeenCalled()
    }
    finally {
      ;(globalThis as Record<string, unknown>).ImageDecoder = origDecoder
    }
  })

  it('invalidates stale loads on close/source-clear, cancels active exports on Cancel/source-replace, exits gif-clip on format prop change, and disables Apply when no format is usable', async () => {
    resetSupportedAvatarFormatsCache()
    const detectSpy = vi.spyOn(mediaCodecs, 'detectSupportedAvatarFormats').mockResolvedValue({
      png: true,
      jpeg: true,
      webp: true,
      avif: false,
      ico: true,
      svg: true,
      gif: true,
      bmp: true,
    })

    // 1. Stale pending load disposes cleanly when source clears to null or editor closes
    let resolveLoad!: (m: mediaLoader.LoadedAvatarMedia) => void
    const disposeStale = vi.fn()
    const loadSpy = vi.spyOn(mediaLoader, 'loadAvatarMedia').mockImplementation(
      () => new Promise(resolve => { resolveLoad = resolve }),
    )
    const file1 = new File(['a'], 'a.png', { type: 'image/png' })
    const wrapper = mount(TxAvatarEditor, {
      props: {
        open: true,
        source: file1,
      },
    })
    await nextTick()
    // Clear source before load finishes
    await wrapper.setProps({ source: null })
    resolveLoad({
      kind: 'image',
      naturalWidth: 64,
      naturalHeight: 64,
      file: file1,
      sourceName: 'a.png',
      image: {} as HTMLImageElement,
      duration: 0,
      animated: false,
      corsTainted: false,
      dispose: disposeStale,
    })
    await nextTick()
    await Promise.resolve()
    expect(disposeStale).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('source-change')).toBeUndefined()

    // 2. Unsupported sole allowed format disables Apply and displays explanation
    const loadedGif: mediaLoader.LoadedAvatarMedia = {
      kind: 'gif',
      naturalWidth: 64,
      naturalHeight: 64,
      file: new File(['g'], 'anim.gif', { type: 'image/gif' }),
      sourceName: 'anim.gif',
      gifFrames: [
        { canvas: document.createElement('canvas'), delayMs: 100, timestampSec: 0 },
        { canvas: document.createElement('canvas'), delayMs: 100, timestampSec: 0.1 },
      ],
      duration: 0.2,
      animated: true,
      truncated: true,
      totalFrameCount: 250,
      maxFrameCount: 180,
      corsTainted: false,
      dispose: vi.fn(),
    }
    loadSpy.mockResolvedValue(loadedGif)

    const unsupportedWrapper = mount(TxAvatarEditor, {
      props: {
        open: true,
        source: loadedGif.file,
        outputFormat: 'avif',
        allowedOutputFormats: ['avif'],
      },
    })
    await vi.waitFor(() => {
      expect(unsupportedWrapper.emitted('source-change')).toHaveLength(1)
    })
    await nextTick()
    expect(unsupportedWrapper.find('.tx-avatar-editor__notice').exists()).toBe(true)
    expect(unsupportedWrapper.find('.tx-avatar-editor__error').text()).toContain('Not supported')
    expect((unsupportedWrapper.find('.tx-avatar-editor__btn--primary').element as HTMLButtonElement).disabled).toBe(true)

    // 3. Switching outputFormat prop away from gif exits gif-clip mode & Cancel during beforeConfirm prevents confirm
    let resolveBeforeConfirm!: (v: boolean) => void
    const beforeConfirm = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveBeforeConfirm = resolve
    }))
    const exportSpy = vi.spyOn(mediaCodecs, 'exportAvatarMedia').mockResolvedValue({
      file: new File(['x'], 'anim.gif', { type: 'image/gif' }),
      blob: new Blob(['x'], { type: 'image/gif' }),
      url: 'data:image/gif;base64,eA==',
      dataUrl: 'data:image/gif;base64,eA==',
      format: 'gif',
      mimeType: 'image/gif',
      width: 128,
      height: 128,
      size: 1,
      animated: true,
      sourceKind: 'gif',
      originalFile: loadedGif.file,
      shape: 'circle',
      transform: { ...DEFAULT_AVATAR_TRANSFORM },
    })

    const activeWrapper = mount(TxAvatarEditor, {
      props: {
        open: true,
        source: loadedGif.file,
        outputFormat: 'gif',
        beforeConfirm,
      },
    })
    await vi.waitFor(() => {
      expect(activeWrapper.emitted('source-change')).toHaveLength(1)
    })
    await nextTick()

    // Enter gif-clip mode via timeline button, then switch outputFormat prop to png -> exits gif-clip
    const gifClipBtn = activeWrapper.findAll('.tx-avatar-editor__seg-btn').find(b => b.text().includes('Animated GIF'))
    expect(gifClipBtn).toBeTruthy()
    await gifClipBtn!.trigger('click')
    expect(activeWrapper.find('.tx-avatar-editor__clip-grid').exists()).toBe(true)
    await activeWrapper.setProps({ outputFormat: 'png' })
    await nextTick()
    expect(activeWrapper.find('.tx-avatar-editor__clip-grid').exists()).toBe(false)

    // Start Apply -> pause inside beforeConfirm -> click Cancel -> resolve beforeConfirm late -> NO confirm emitted
    await activeWrapper.find('.tx-avatar-editor__btn--primary').trigger('click')
    await vi.waitFor(() => {
      expect(beforeConfirm).toHaveBeenCalledTimes(1)
    })
    await activeWrapper.find('.tx-avatar-editor__btn--secondary').trigger('click')
    resolveBeforeConfirm(true)
    await nextTick()
    await Promise.resolve()
    expect(activeWrapper.emitted('confirm')).toBeUndefined()
    expect(activeWrapper.emitted('cancel')).toHaveLength(1)

    exportSpy.mockRestore()
    loadSpy.mockRestore()
    detectSpy.mockRestore()
    resetSupportedAvatarFormatsCache()
  })

  it('auto-selects animated GIF clip mode for animated GIFs and respects autoSelectAnimated=false and static restore', async () => {
    const w = 8
    const h = 8
    const frameA = new Uint8ClampedArray(w * h * 4).fill(255)
    const frameB = new Uint8ClampedArray(w * h * 4).fill(120)
    for (let i = 3; i < frameB.length; i += 4)
      frameB[i] = 255
    const gifBytes = encodeGif([
      { rgba: frameA, width: w, height: h, delayMs: 120 },
      { rgba: frameB, width: w, height: h, delayMs: 120 },
    ], { width: w, height: h, loop: 0 })
    const gifFile = new File([gifBytes], 'anim.gif', { type: 'image/gif' })

    const wrapper = mount(TxAvatarEditor, {
      props: {
        open: true,
        source: gifFile,
        outputFormat: 'png',
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.emitted('source-change')).toHaveLength(1)
    })
    await nextTick()

    const timelineBtns = wrapper.findAll('.tx-avatar-editor__timeline .tx-avatar-editor__seg-btn')
    expect(timelineBtns).toHaveLength(2)
    expect(timelineBtns[1]!.classes()).toContain('is-active')
    expect(wrapper.find('.tx-avatar-editor__format-btn.is-active').text().trim()).toBe('GIF')

    // Subsequent static source restores default outputFormat ('png') and exits gif-clip mode
    const loadSpy = vi.spyOn(mediaLoader, 'loadAvatarMedia').mockResolvedValueOnce({
      kind: 'image',
      naturalWidth: 64,
      naturalHeight: 64,
      file: new File(['s'], 'static.png', { type: 'image/png' }),
      sourceName: 'static.png',
      image: {} as HTMLImageElement,
      duration: 0,
      animated: false,
      corsTainted: false,
      dispose: vi.fn(),
    })
    await wrapper.setProps({ source: new File(['s'], 'static.png', { type: 'image/png' }) })
    await vi.waitFor(() => {
      expect(wrapper.emitted('source-change')).toHaveLength(2)
    })
    await nextTick()
    expect(wrapper.find('.tx-avatar-editor__format-btn.is-active').text().trim()).toBe('PNG')
    expect(wrapper.find('.tx-avatar-editor__clip-grid').exists()).toBe(false)
    loadSpy.mockRestore()
    wrapper.unmount()

    // Opt-out: autoSelectAnimated=false stays on static frame + initial outputFormat
    const optOutWrapper = mount(TxAvatarEditor, {
      props: {
        open: true,
        source: gifFile,
        outputFormat: 'png',
        autoSelectAnimated: false,
      },
    })
    await vi.waitFor(() => {
      expect(optOutWrapper.emitted('source-change')).toHaveLength(1)
    })
    await nextTick()
    const optOutBtns = optOutWrapper.findAll('.tx-avatar-editor__timeline .tx-avatar-editor__seg-btn')
    expect(optOutBtns[0]!.classes()).toContain('is-active')
    expect(optOutWrapper.find('.tx-avatar-editor__format-btn.is-active').text().trim()).toBe('PNG')
    optOutWrapper.unmount()
  })

  it('decodes animated WebP frames via ImageDecoder with pixel-budget enforcement', async () => {
    const closeFrame = vi.fn()
    const closeDecoder = vi.fn()
    class MockAnimatedWebpDecoder {
      static isTypeSupported = vi.fn(async (mime: string) => mime === 'image/webp')
      tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 3 } }
      decode = vi.fn(async () => ({
        image: {
          displayWidth: 32,
          displayHeight: 32,
          duration: 80_000,
          close: closeFrame,
        },
      }))

      close = closeDecoder
    }

    const origDecoder = (globalThis as Record<string, unknown>).ImageDecoder
    ;(globalThis as Record<string, unknown>).ImageDecoder = MockAnimatedWebpDecoder

    try {
      const animWebp = new Uint8Array(24)
      animWebp.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
      animWebp.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
      animWebp.set([0x56, 0x50, 0x38, 0x58], 12) // VP8X
      animWebp[20] = 0x02 // animation flag
      const webpFile = new File([animWebp], 'sticker.webp', { type: 'image/webp' })

      const loaded = await loadAvatarMedia(webpFile)
      expect(loaded.kind).toBe('image')
      expect(loaded.animated).toBe(true)
      expect(loaded.gifFrames).toHaveLength(3)
      expect(loaded.duration).toBeCloseTo(0.24, 3)
      expect(closeFrame).toHaveBeenCalledTimes(3)
      expect(closeDecoder).toHaveBeenCalledTimes(1)
      loaded.dispose()

      // Budget enforcement still rejects oversized animated WebP without silently falling back
      await expect(
        loadAvatarMedia(webpFile, { maxGifDecodedBytes: 512 }),
      ).rejects.toThrow(/pixel budget/i)
    }
    finally {
      ;(globalThis as Record<string, unknown>).ImageDecoder = origDecoder
    }
  })

  it('walks PNG chunks past large ancillary chunks to detect APNG acTL and aborts exportAvatarMedia after customConverter cancellation', async () => {
    const makeChunk = (type: string, payloadLen: number): Uint8Array => {
      const out = new Uint8Array(12 + payloadLen)
      out[0] = (payloadLen >>> 24) & 0xFF
      out[1] = (payloadLen >>> 16) & 0xFF
      out[2] = (payloadLen >>> 8) & 0xFF
      out[3] = payloadLen & 0xFF
      for (let i = 0; i < 4; i++)
        out[4 + i] = type.charCodeAt(i)
      return out
    }
    const sig = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const ihdr = makeChunk('IHDR', 13)
    const largeIccp = makeChunk('iCCP', 2048) // pushes acTL well past 512 bytes
    const actl = makeChunk('acTL', 8)
    const idat = makeChunk('IDAT', 4)

    const apngWithIccp = new Blob([sig, ihdr, largeIccp, actl, idat], { type: 'image/png' })
    expect(await isApngBlob(apngWithIccp, new Uint8Array(await readBlobArrayBuffer(apngWithIccp.slice(0, 512))))).toBe(true)

    const staticWithIccp = new Blob([sig, ihdr, largeIccp, idat], { type: 'image/png' })
    expect(await isApngBlob(staticWithIccp, new Uint8Array(await readBlobArrayBuffer(staticWithIccp.slice(0, 512))))).toBe(false)

    // Abort during customConverter rejects with AbortError and never reports 100% progress
    const fakeCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const localCtxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx)
    const controller = new AbortController()
    const progressMarks: number[] = []
    try {
      const media = {
        kind: 'image' as const,
        naturalWidth: 64,
        naturalHeight: 64,
        file: null,
        sourceName: 'avatar.png',
        image: {} as HTMLImageElement,
        duration: 0,
        animated: false,
        corsTainted: false,
        dispose: vi.fn(),
      }
      await expect(
        exportAvatarMedia(media, {
          format: 'webp',
          outputSize: 64,
          quality: 0.9,
          shape: 'circle',
          transform: { ...DEFAULT_AVATAR_TRANSFORM },
          signal: controller.signal,
          onProgress: p => progressMarks.push(p),
          customConverter: async () => {
            controller.abort()
            return new Blob(['webp'], { type: 'image/webp' })
          },
        }),
      ).rejects.toThrow(/aborted/i)
      expect(progressMarks).not.toContain(100)
    }
    finally {
      localCtxSpy.mockReturnValue(null)
    }
  })

  it('honors editorProps.autoSelectAnimated fallback in TxAvatar and auto-plays video sources in TxAvatarEditor', async () => {
    // 1. Omitted top-level prop falls back to editorProps.autoSelectAnimated
    const fromEditorProps = mount(TxAvatar, {
      props: {
        editable: true,
        editorProps: { autoSelectAnimated: false },
      },
    })
    await fromEditorProps.trigger('click')
    await nextTick()
    expect(fromEditorProps.findComponent(TxAvatarEditor).props('autoSelectAnimated')).toBe(false)
    fromEditorProps.unmount()

    // 2. Explicit top-level prop overrides editorProps.autoSelectAnimated
    const topLevelOverride = mount(TxAvatar, {
      props: {
        editable: true,
        autoSelectAnimated: true,
        editorProps: { autoSelectAnimated: false },
      },
    })
    await topLevelOverride.trigger('click')
    await nextTick()
    expect(topLevelOverride.findComponent(TxAvatarEditor).props('autoSelectAnimated')).toBe(true)
    topLevelOverride.unmount()

    // 3. Video source auto-selects gif-clip and starts playback when reduced-motion is not set
    const fakeVideo = document.createElement('video')
    const playSpy = vi.spyOn(fakeVideo, 'play').mockResolvedValue(undefined)
    const pauseSpy = vi.spyOn(fakeVideo, 'pause').mockImplementation(() => {})
    const loadSpy = vi.spyOn(mediaLoader, 'loadAvatarMedia').mockResolvedValueOnce({
      kind: 'video',
      naturalWidth: 320,
      naturalHeight: 240,
      file: new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
      sourceName: 'clip.mp4',
      video: fakeVideo,
      duration: 4,
      animated: true,
      corsTainted: false,
      dispose: vi.fn(),
    })

    const videoEditor = mount(TxAvatarEditor, {
      props: {
        open: true,
        source: new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
        outputFormat: 'png',
      },
    })
    await vi.waitFor(() => {
      expect(videoEditor.emitted('source-change')).toHaveLength(1)
    })
    await nextTick()
    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(videoEditor.find('.tx-avatar-editor__format-btn.is-active').text().trim()).toBe('GIF')
    videoEditor.unmount()
    loadSpy.mockRestore()
    playSpy.mockRestore()
    pauseSpy.mockRestore()
  })

  it('omits verbose upload/paste hint clutter, snaps magnetic slider angles, and springs across ±180° via shortest path', async () => {
    // 1. Empty upload state contains zero verbose formats/paste hint paragraphs
    const emptyEditor = mount(TxAvatarEditor, {
      props: { open: true },
    })
    expect(emptyEditor.find('.tx-avatar-editor__formats-hint').exists()).toBe(false)
    expect(emptyEditor.find('.tx-avatar-editor__paste-hint').exists()).toBe(false)
    expect(emptyEditor.find('.tx-avatar-editor__media-glyphs').exists()).toBe(true)
    emptyEditor.unmount()

    // 2. AvatarEditorSlider snaps magnetically during pointer drag, stays unsnapped for keyboard steps, and resets on readout click
    const slider = mount(AvatarEditorSlider, {
      props: {
        modelValue: 45,
        min: -180,
        max: 180,
        icon: 'angle',
        label: 'Angle',
        readout: '45°',
        centerOrigin: true,
        snapPoints: [-90, 0, 90],
        snapThreshold: 4,
        resetValue: 0,
      },
    })
    const input = slider.find('input[type="range"]')
    await input.trigger('pointerdown')
    await input.setValue('88')
    expect(slider.emitted('update:modelValue')?.[0]).toEqual([90])
    await input.trigger('pointerup')
    await input.setValue('2')
    expect(slider.emitted('update:modelValue')?.[1]).toEqual([2])
    await slider.find('.tx-ae-slider__readout--btn').trigger('click')
    expect(slider.emitted('reset')?.[0]).toEqual([0])
    slider.unmount()

    // 3. Stage spring takes shortest angular delta across ±180° and settles cleanly
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    try {
      const motion = createStageMotion(0.5)
      motion.snap({ ...DEFAULT_AVATAR_TRANSFORM, rotation: 170 }, 0.5, 0)
      const frames: number[] = []
      motion.springTo({ ...DEFAULT_AVATAR_TRANSFORM, rotation: -170 }, 0.24, 1, () => {
        frames.push(motion.state.rotation)
      })
      await vi.advanceTimersByTimeAsync(900)
      // Rotating from 170° to -170° must advance clockwise (+20° -> ~190° -> normalized -170°), never backwards through 0°
      expect(frames.length).toBeGreaterThan(2)
      expect(frames.slice(0, -1).every(deg => deg >= 169)).toBe(true)
      expect(motion.state.rotation).toBe(-170)
      expect(motion.state.maskRadiusRatio).toBeCloseTo(0.24, 3)
      motion.stop()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
