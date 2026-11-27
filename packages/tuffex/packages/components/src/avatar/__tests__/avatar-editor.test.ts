import { config, mount } from '@vue/test-utils'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { TxFileUploader } from '../../file-uploader'
import { encodeBmp } from '../src/editor/bmp-encoder'
import {
  buildCanvasFilter,
  clampTransform,
  computeContainZoom,
  computeCoverZoom,
  computeTransformMetrics,
  normalizeRotation,
} from '../src/editor/geometry'
import { decodeGif, encodeGif } from '../src/editor/gif-codec'
import { encodeIco, extractBestIcoEntry, parseIcoEntries, resolveIcoSizes } from '../src/editor/ico-codec'
import { buildOutputFileName, formatByteSize, formatMediaTime } from '../src/editor/media-codecs'
import { detectAvatarSourceKind, readBlobArrayBuffer } from '../src/editor/media-loader'
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
