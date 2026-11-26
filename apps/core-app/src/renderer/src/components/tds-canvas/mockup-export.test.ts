// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  buildSandboxedFrameSrcdoc,
  sanitizeEmbeddedStyleCss,
  TDS_CANVAS_FRAME_CSP
} from './canvas-geometry'
import {
  createDefaultMockupOptions,
  DEFAULT_MOCKUP_OPTIONS,
  inferDefaultPerPage,
  loadMockupOptions,
  normalizeMockupOptions,
  saveMockupOptions,
  TDS_MOCKUP_MAX_BEZEL,
  TDS_MOCKUP_MAX_RADIUS,
  TDS_MOCKUP_MIN_BEZEL,
  TDS_MOCKUP_MIN_RADIUS,
  type TdsMockupOptions
} from './mockup-options'
import {
  buildPrintableMockupHtml,
  computeMockupPageLayout,
  escapeXml,
  isValidFrameBitmapDataUrl,
  paginateMockupFrames,
  rasterizeSvgToPngBlob,
  renderMockupPagePngBlob,
  renderMockupPageSvg
} from './mockup-renderer'
import type { TdsCanvasFrame, TdsMockupExportEventPayload } from './types'

enableAutoUnmount(afterEach)

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    props: ['modelValue', 'panelBackground'],
    emits: ['update:modelValue'],
    template:
      '<div class="tx-popover-stub" :data-panel-background="panelBackground"><div @click="$emit(\'update:modelValue\', !modelValue)"><slot name="reference" /></div><div v-if="modelValue"><slot /></div></div>'
  }
}))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: {
    props: ['modelValue', 'title', 'width', 'surface', 'closeLabel'],
    emits: ['update:modelValue', 'close'],
    template:
      '<div v-if="modelValue" class="tx-modal-stub" :data-surface="surface" :data-title="title"><header>{{ title }}<button type="button" data-testid="tx-modal-close" @click="$emit(\'update:modelValue\', false)">{{ closeLabel }}</button></header><div class="tx-modal-body"><slot /></div><footer class="tx-modal-footer"><slot name="footer" /></footer></div>'
  }
}))

import TdsDesignCanvas from './TdsDesignCanvas.vue'
import TdsMockupExportDialog from './TdsMockupExportDialog.vue'

function makeFrame(overrides: Partial<TdsCanvasFrame> = {}): TdsCanvasFrame {
  return {
    id: 'frame-1',
    title: 'Checkout Flow',
    kind: 'html',
    source:
      '<!doctype html><html><head><title>Checkout Flow</title><style>:root{--shell-bg:#ffffff;--shell-primary:#2b7fd9;}</style></head><body><h1>Checkout Flow</h1><p>Fast one-tap review.</p></body></html>',
    deviceId: 'iphone-17-pro',
    orientation: 'portrait',
    showShell: true,
    x: 0,
    y: 0,
    ...overrides
  }
}

describe('buildSandboxedFrameSrcdoc extraStyleCss theme pack injection & sanitization', () => {
  it('injects sanitized <style data-tds-theme-pack> inside strict CSP sandbox for HTML and SVG', () => {
    const themeCss = ':root:not(.contrast) { --shell-primary: #3b82f6; --shell-bg: #111113; }'
    const htmlDoc = buildSandboxedFrameSrcdoc(
      '<!doctype html><html><head><style>:root{--shell-bg:#fff}</style></head><body><h1>Demo</h1></body></html>',
      'html',
      themeCss
    )

    expect(htmlDoc).toContain('Content-Security-Policy')
    expect(htmlDoc).toContain(TDS_CANVAS_FRAME_CSP)
    expect(htmlDoc).toContain("default-src 'none'")
    expect(htmlDoc).toContain('sandbox="allow-scripts allow-forms allow-modals"')
    expect(htmlDoc).not.toContain('allow-same-origin')
    expect(htmlDoc).toContain('<style data-tds-theme-pack>')
    expect(htmlDoc).toContain('--shell-primary: #3b82f6;')
    // Injected before </head> so theme tokens cascade after frame defaults
    expect(htmlDoc.indexOf('<style data-tds-theme-pack>')).toBeLessThan(htmlDoc.indexOf('</head>'))

    const svgDoc = buildSandboxedFrameSrcdoc(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
      'svg',
      themeCss
    )
    expect(svgDoc).toContain('sandbox=""')
    expect(svgDoc).not.toContain('allow-scripts')
    expect(svgDoc).toContain('<style data-tds-theme-pack>')
    expect(svgDoc).toContain('--shell-primary: #3b82f6;')

    // Empty / whitespace extraStyleCss leaves output untouched without empty style tags
    const plain = buildSandboxedFrameSrcdoc('<div>Plain</div>', 'html', '   ')
    expect(plain).not.toContain('data-tds-theme-pack')
  })

  it('escapes </style>, <!--, -->, and <script sequences to prevent style tag breakout', () => {
    const hostileCss =
      ':root { --x: 1; } </style><script>alert(1)</script><!-- comment --> </STYLE >'
    const sanitized = sanitizeEmbeddedStyleCss(hostileCss)

    expect(sanitized).not.toMatch(/<\/\s*style/i)
    expect(sanitized).not.toContain('<!--')
    expect(sanitized).not.toContain('-->')
    expect(sanitized).not.toMatch(/<\s*script/i)
    expect(sanitized).toContain('--x: 1;')

    const doc = buildSandboxedFrameSrcdoc(
      '<!doctype html><html><head></head><body>Safe</body></html>',
      'html',
      hostileCss
    )
    // Only the legitimate closing </style> of our injected block & outer wrapper exist, never raw hostile breakout
    expect(doc).not.toContain('<script>alert(1)')
    expect(doc).not.toContain('<!-- comment')
    expect(doc).toContain('<\\/style><\\script>alert(1)</script><\\!-- comment --\\>')
  })
})

describe('mockup-options per-field tolerant normalization and persistence', () => {
  const STORAGE_KEY = 'tds.test.mockupOptions.v1'

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('infers sensible perPage defaults: 3 for phones, 2 for tablets, 1 for wide desktop frames', () => {
    expect(inferDefaultPerPage([makeFrame({ deviceId: 'iphone-17-pro' })])).toBe(3)
    expect(inferDefaultPerPage([makeFrame({ deviceId: 'ipad-pro-11' })])).toBe(2)
    expect(inferDefaultPerPage([makeFrame({ deviceId: 'desktop-hd' })])).toBe(1)
    expect(
      inferDefaultPerPage([makeFrame({ deviceId: 'responsive', width: 1200, height: 800 })])
    ).toBe(1)

    expect(createDefaultMockupOptions([makeFrame({ deviceId: 'desktop-hd' })]).perPage).toBe(1)
    expect(createDefaultMockupOptions([makeFrame({ deviceId: 'iphone-17-pro' })]).perPage).toBe(3)
  })

  it('normalizes partial, corrupt, out-of-range, and forward-compatible options per field', () => {
    const fallback: TdsMockupOptions = {
      ...DEFAULT_MOCKUP_OPTIONS,
      perPage: 2,
      background: '#2b303a'
    }

    const normalized = normalizeMockupOptions(
      {
        perPage: 99, // invalid -> fallback (2)
        radius: 500, // clamped -> TDS_MOCKUP_MAX_RADIUS
        bezelWidth: -8, // clamped -> TDS_MOCKUP_MIN_BEZEL
        bezelColor: 'javascript:alert(1)', // rejected -> fallback
        background: '#f5f5f7', // valid -> kept
        transparent: true, // valid -> kept
        shadow: 'yes', // invalid type -> fallback (true)
        brand: false, // valid -> kept
        scale: 4, // invalid -> fallback (2)
        showTitles: false, // valid -> kept
        futureExperimentalFlag: 'keep-calm' // unknown field -> ignored safely
      },
      fallback
    )

    expect(normalized).toEqual({
      perPage: 2,
      radius: TDS_MOCKUP_MAX_RADIUS,
      bezelWidth: TDS_MOCKUP_MIN_BEZEL,
      bezelColor: DEFAULT_MOCKUP_OPTIONS.bezelColor,
      background: '#f5f5f7',
      transparent: true,
      shadow: true,
      brand: false,
      scale: 2,
      showTitles: false
    })

    // Non-object / array inputs safely fall back
    expect(normalizeMockupOptions(null, fallback)).toEqual(fallback)
    expect(normalizeMockupOptions(['bad'], fallback)).toEqual(fallback)
    expect(normalizeMockupOptions('corrupt', fallback)).toEqual(fallback)

    // Minimum radius / maximum bezel clamping
    const clamped = normalizeMockupOptions({ radius: -20, bezelWidth: 999 })
    expect(clamped.radius).toBe(TDS_MOCKUP_MIN_RADIUS)
    expect(clamped.bezelWidth).toBe(TDS_MOCKUP_MAX_BEZEL)
  })

  it('round-trips options through localStorage and tolerates corrupt stored JSON', () => {
    const custom: TdsMockupOptions = {
      ...DEFAULT_MOCKUP_OPTIONS,
      perPage: 4,
      transparent: true,
      shadow: false,
      scale: 1
    }
    saveMockupOptions(STORAGE_KEY, custom)
    expect(loadMockupOptions(STORAGE_KEY)).toEqual(custom)

    // Corrupt JSON does not throw and returns normalized fallback
    window.localStorage.setItem(STORAGE_KEY, '{not-valid-json')
    expect(loadMockupOptions(STORAGE_KEY)).toEqual(DEFAULT_MOCKUP_OPTIONS)

    // Partial legacy JSON preserves saved valid fields while backfilling missing fields
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ perPage: 1, brand: false }))
    const hydrated = loadMockupOptions(STORAGE_KEY)
    expect(hydrated.perPage).toBe(1)
    expect(hydrated.brand).toBe(false)
    expect(hydrated.bezelWidth).toBe(DEFAULT_MOCKUP_OPTIONS.bezelWidth)
  })
})

describe('mockup-renderer pagination, layout math, SVG XML safety, printable HTML, and PNG fallback', () => {
  it('paginates frames deterministically and computes concentric bezel coordinates', () => {
    const frames = [
      makeFrame({ id: 'f1', title: 'Screen 1', deviceId: 'iphone-17-pro' }),
      makeFrame({ id: 'f2', title: 'Screen 2', deviceId: 'iphone-14' }),
      makeFrame({ id: 'f3', title: 'Screen 3', deviceId: 'pixel-9' }),
      makeFrame({ id: 'f4', title: 'Screen 4', deviceId: 'harmony-mate' }),
      makeFrame({ id: 'f5', title: 'Screen 5', deviceId: 'a4' })
    ]

    expect(paginateMockupFrames([], 3)).toEqual([])

    const pages = paginateMockupFrames(frames, 2)
    expect(pages).toHaveLength(3)
    expect(pages.map((p) => p.frames.map((f) => f.id))).toEqual([
      ['f1', 'f2'],
      ['f3', 'f4'],
      ['f5']
    ])
    expect(pages[0]?.pageIndex).toBe(0)
    expect(pages[0]?.totalPages).toBe(3)
    expect(pages[2]?.pageIndex).toBe(2)

    const layout = computeMockupPageLayout(pages[0]!, {
      ...DEFAULT_MOCKUP_OPTIONS,
      bezelWidth: 12,
      radius: 32
    })
    expect(layout.slots).toHaveLength(2)
    const slotA = layout.slots[0]!
    const slotB = layout.slots[1]!

    // Concentric outer = inner + bezel
    expect(slotA.outerRadius).toBe(slotA.innerRadius + slotA.bezelWidth)
    expect(slotA.screenX).toBe(slotA.x + slotA.bezelWidth)
    expect(slotA.screenY).toBe(slotA.y + slotA.bezelWidth)
    expect(slotB.x).toBe(slotA.x + slotA.width + layout.gap)
    expect(layout.width).toBeGreaterThanOrEqual(slotB.x + slotB.width + layout.paddingX)

    // Paper preset omits bezel
    const paperLayout = computeMockupPageLayout(pages[2]!, DEFAULT_MOCKUP_OPTIONS)
    expect(paperLayout.slots[0]?.bezelWidth).toBe(0)
  })

  it('generates XML-safe standalone SVG showcase boards honoring backdrop, shadow, cutout, and brand options', () => {
    const frames = [
      makeFrame({
        id: 'f-xss',
        title: 'Pricing & Plans <script>alert("xss")</script>',
        deviceId: 'iphone-17-pro',
        source:
          '<!doctype html><body><h1>Hero & "Deals"</h1><p></foreignObject><script>evil()</script></p></body>'
      })
    ]
    const page = paginateMockupFrames(frames, 1)[0]!

    const opaqueSvg = renderMockupPageSvg(page, {
      ...DEFAULT_MOCKUP_OPTIONS,
      background: '#1c1c1e',
      transparent: false,
      shadow: true,
      brand: true,
      showTitles: true
    })

    expect(opaqueSvg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(opaqueSvg).toContain('class="tds-mockup-backdrop"')
    expect(opaqueSvg).toContain('fill="#1c1c1e"')
    expect(opaqueSvg).toContain('id="tds-mockup-shadow"')
    expect(opaqueSvg).toContain('data-cutout="island"')
    expect(opaqueSvg).toContain('class="tds-mockup-brand"')
    expect(opaqueSvg).toContain('Tuff Design System')
    // Strict XML escaping of untrusted frame title & body
    expect(opaqueSvg).toContain(escapeXml(frames[0]!.title))
    expect(opaqueSvg).not.toContain('<script>')
    expect(opaqueSvg).not.toContain('evil()')

    const transparentSvg = renderMockupPageSvg(page, {
      ...DEFAULT_MOCKUP_OPTIONS,
      transparent: true,
      shadow: false,
      brand: false,
      showTitles: false
    })
    expect(transparentSvg).not.toContain('class="tds-mockup-backdrop"')
    expect(transparentSvg).not.toContain('id="tds-mockup-shadow"')
    expect(transparentSvg).not.toContain('class="tds-mockup-brand"')
    expect(transparentSvg).not.toContain('class="tds-mockup-title"')
  })

  it('builds self-contained zero-network printable HTML with @page breaks and strict sandboxed iframes', () => {
    const frames = [
      makeFrame({
        id: 'html-1',
        title: 'Landing </title><script>alert(1)</script>',
        kind: 'html',
        source: '<!doctype html><head></head><body><h1>Live "HTML" & Preview</h1></body>'
      }),
      makeFrame({
        id: 'svg-2',
        title: 'Brand Mark',
        kind: 'svg',
        deviceId: 'apple-watch-46',
        source: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="8"/></svg>'
      })
    ]
    const pages = paginateMockupFrames(frames, 1)
    const html = buildPrintableMockupHtml(
      pages,
      DEFAULT_MOCKUP_OPTIONS,
      'Deck </title><script>boom()</script>',
      { themeCss: ':root { --shell-primary: #2563eb; } </style><script>bad()</script>' }
    )

    expect(html).toContain('@page { size: landscape;')
    expect(html).toContain('break-after: page')
    expect(html).toContain('print-color-adjust: exact')
    expect(html).toContain(`content="${TDS_CANVAS_FRAME_CSP}"`)
    expect(html).toContain('data-page="1"')
    expect(html).toContain('data-page="2"')
    // Strict sandbox per frame kind, never allow-same-origin
    expect(html).toContain('sandbox="allow-scripts allow-forms allow-modals"')
    expect(html).toContain('sandbox=""')
    expect(html).not.toContain('allow-same-origin')
    // Escaped title and themeCss injection safety
    expect(html).not.toContain('<script>boom()</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<script>bad()</script>')
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;boom()&lt;/script&gt;')
  })

  it('rasterizeSvgToPngBlob resolves cleanly with a valid PNG Blob fallback in jsdom', async () => {
    const page = paginateMockupFrames([makeFrame()], 1)[0]!
    const svg = renderMockupPageSvg(page, DEFAULT_MOCKUP_OPTIONS)
    const blob = await rasterizeSvgToPngBlob(svg, 480, 640, 2, { timeoutMs: 30 })

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(8)
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    const bytes = new Uint8Array(buffer)
    // PNG magic signature: 89 50 4E 47
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('renders real-pixel <image> with zero <foreignObject> when valid frameBitmaps are supplied and falls back otherwise', () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    expect(isValidFrameBitmapDataUrl(validPng)).toBe(true)
    expect(isValidFrameBitmapDataUrl('https://evil.example/a.png')).toBe(false)
    expect(isValidFrameBitmapDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false)
    expect(isValidFrameBitmapDataUrl('javascript:alert(1)')).toBe(false)

    const f1 = makeFrame({ id: 'real-1', title: 'Real Pixel Screen' })
    const f2 = makeFrame({ id: 'wire-2', title: 'Wireframe Fallback' })
    const singlePage = paginateMockupFrames([f1], 1)[0]!

    const realSvg = renderMockupPageSvg(singlePage, DEFAULT_MOCKUP_OPTIONS, {
      frameBitmaps: { 'real-1': validPng }
    })
    expect(realSvg).toContain('<image class="tds-mockup-bitmap"')
    expect(realSvg).toContain(`href="${validPng}"`)
    expect(realSvg).toContain('preserveAspectRatio="xMidYMid slice"')
    expect(realSvg).toContain('clip-path="url(#tds-mockup-clip-0)"')
    expect(realSvg).not.toContain('<foreignObject')

    // Mixed board: valid bitmap gets <image>, invalid/missing falls back cleanly to <foreignObject>
    const mixedPage = paginateMockupFrames([f1, f2], 2)[0]!
    const mixedSvg = renderMockupPageSvg(mixedPage, DEFAULT_MOCKUP_OPTIONS, {
      frameBitmaps: {
        'real-1': validPng,
        'wire-2': 'https://blocked.example/remote.png'
      }
    })
    expect(mixedSvg).toContain(`href="${validPng}"`)
    expect(mixedSvg).not.toContain('https://blocked.example/remote.png')
    expect(mixedSvg).toContain('<foreignObject')
  })

  it('composites real frame bitmaps directly onto native Canvas via ctx.drawImage in renderMockupPagePngBlob', async () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const page = paginateMockupFrames([makeFrame({ id: 'px-1', title: 'Retina Board' })], 1)[0]!

    // 1. Without bitmaps -> cleanly falls back to rasterizeSvgToPngBlob PNG Blob
    const fallbackBlob = await renderMockupPagePngBlob(
      page,
      DEFAULT_MOCKUP_OPTIONS,
      {},
      { timeoutMs: 25 }
    )
    expect(fallbackBlob).toBeInstanceOf(Blob)
    expect(fallbackBlob.type).toBe('image/png')

    // 2. With bitmaps + mocked Canvas 2D & Image decode -> composites directly with ctx.drawImage
    const drawImageSpy = vi.fn()
    const fillRectSpy = vi.fn()
    const clipSpy = vi.fn()
    const scaleSpy = vi.fn()
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      scale: scaleSpy,
      fillRect: fillRectSpy,
      beginPath: vi.fn(),
      rect: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: clipSpy,
      fillText: vi.fn(),
      drawImage: drawImageSpy,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      globalAlpha: 1
    } as unknown as CanvasRenderingContext2D

    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx)
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb(
        new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])], {
          type: 'image/png'
        })
      )
    })

    const OriginalImage = globalThis.Image
    class MockBitmapImage {
      decoding = 'async'
      naturalWidth = 402
      naturalHeight = 874
      width = 402
      height = 874
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.()
        })
      }
    }
    vi.stubGlobal('Image', MockBitmapImage)

    try {
      const pngBlob = await renderMockupPagePngBlob(
        page,
        { ...DEFAULT_MOCKUP_OPTIONS, scale: 2, shadow: true, brand: true, showTitles: true },
        { frameBitmaps: { 'px-1': validPng } },
        { timeoutMs: 200 }
      )
      expect(pngBlob).toBeInstanceOf(Blob)
      expect(pngBlob.type).toBe('image/png')
      expect(scaleSpy).toHaveBeenCalledWith(2, 2)
      expect(clipSpy).toHaveBeenCalled()
      expect(drawImageSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.stubGlobal('Image', OriginalImage)
      getContextSpy.mockRestore()
      toBlobSpy.mockRestore()
    }
  })
})

describe('TdsMockupExportDialog & TdsDesignCanvas themeCss / canvasPattern / export integration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('mounts TdsMockupExportDialog, previews boards, toggles options, and triggers SVG/PNG/Print exports', async () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectUrlSpy = vi.fn(() => 'blob:mock-tds-export')
    const revokeObjectUrlSpy = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectUrlSpy,
      configurable: true,
      writable: true
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrlSpy,
      configurable: true,
      writable: true
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    try {
      const frames = [
        makeFrame({ id: 'p1', title: 'Onboarding 1', deviceId: 'iphone-17-pro' }),
        makeFrame({ id: 'p2', title: 'Onboarding 2', deviceId: 'iphone-17-pro' }),
        makeFrame({ id: 'p3', title: 'Onboarding 3', deviceId: 'iphone-17-pro' })
      ]

      const wrapper = mount(TdsMockupExportDialog, {
        props: {
          modelValue: true,
          frames,
          storageKey: 'tds.dialog.test.v1',
          defaultTitle: 'Mobile Onboarding'
        }
      })
      await flushPromises()

      // Uses refraction surface
      expect(wrapper.get('.tx-modal-stub').attributes('data-surface')).toBe('refraction')

      // Live scaled SVG preview image renders
      const previewImg = wrapper.get('[data-testid="tds-mockup-preview-img"]')
      expect(previewImg.attributes('src')).toContain('data:image/svg+xml;charset=utf-8,')
      expect(wrapper.get('[data-testid="tds-mockup-page-readout"]').text()).toContain('1 / 1')

      // Change per-page to 1 -> 3 boards and next button advances page
      await wrapper.get('[data-testid="tds-mockup-per-page-1"]').trigger('click')
      await nextTick()
      expect(wrapper.get('[data-testid="tds-mockup-page-readout"]').text()).toContain('1 / 3')
      await wrapper.get('[data-testid="tds-mockup-page-next"]').trigger('click')
      await nextTick()
      expect(wrapper.get('[data-testid="tds-mockup-page-readout"]').text()).toContain('2 / 3')

      // Switch backdrop swatch to Transparent -> checkerboard class active
      await wrapper.get('[data-testid="tds-mockup-swatch-transparent"]').trigger('click')
      await nextTick()
      expect(wrapper.get('[data-testid="tds-mockup-preview-stage"]').classes()).toContain(
        'is-transparent'
      )

      // Toggle scale to 1x and shadow off
      await wrapper.get('[data-testid="tds-mockup-scale-1"]').trigger('click')
      await wrapper.get('[data-testid="tds-mockup-toggle-shadow"]').setValue(false)
      await nextTick()

      // Options persisted to localStorage
      const saved = loadMockupOptions('tds.dialog.test.v1')
      expect(saved.perPage).toBe(1)
      expect(saved.transparent).toBe(true)
      expect(saved.scale).toBe(1)
      expect(saved.shadow).toBe(false)

      // Clear selection disables export buttons and shows empty state
      await wrapper.get('[data-testid="tds-mockup-select-none"]').trigger('click')
      await nextTick()
      expect(wrapper.find('[data-testid="tds-mockup-preview-empty"]').exists()).toBe(true)
      expect(
        wrapper.get('[data-testid="tds-mockup-export-svg"]').attributes('disabled')
      ).toBeDefined()

      // Re-select all & trigger all 3 exports
      await wrapper.get('[data-testid="tds-mockup-select-all"]').trigger('click')
      await nextTick()

      await wrapper.get('[data-testid="tds-mockup-export-svg"]').trigger('click')
      await wrapper.get('[data-testid="tds-mockup-export-print"]').trigger('click')
      await wrapper.get('[data-testid="tds-mockup-export-png"]').trigger('click')
      await flushPromises()

      const emitted = (wrapper.emitted('export') ?? []).map(
        (entry) => entry[0] as TdsMockupExportEventPayload
      )
      expect(emitted).toEqual([
        { format: 'svg', pageCount: 3, frameIds: ['p1', 'p2', 'p3'] },
        { format: 'print-html', pageCount: 3, frameIds: ['p1', 'p2', 'p3'] },
        { format: 'png', pageCount: 3, frameIds: ['p1', 'p2', 'p3'] }
      ])
      expect(createObjectUrlSpy).toHaveBeenCalled()
      expect(anchorClickSpy).toHaveBeenCalled()
    } finally {
      openSpy.mockRestore()
      anchorClickSpy.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', {
        value: originalCreateObjectUrl,
        configurable: true,
        writable: true
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: originalRevokeObjectUrl,
        configurable: true,
        writable: true
      })
    }
  })

  it('wires themeCss, canvasPattern, and Export Mockup toolbar action in TdsDesignCanvas', async () => {
    // Empty frames -> export button disabled
    const emptyWrapper = mount(TdsDesignCanvas, {
      props: { frames: [], canvasPattern: 'paper-grain' }
    })
    await flushPromises()
    expect(
      emptyWrapper.get('[data-testid="tds-canvas-export-mockup"]').attributes('disabled')
    ).toBeDefined()
    expect(emptyWrapper.get('[data-testid="tds-canvas-stage"]').attributes('data-pattern')).toBe(
      'paper-grain'
    )
    expect(emptyWrapper.get('[data-testid="tds-canvas-stage"]').classes()).toContain(
      'is-pattern-paper-grain'
    )

    // With frames + themeCss + grid pattern -> themeCss injected into iframe srcdoc & dialog opens
    const themeCss = ':root:not(.contrast) { --shell-primary: #0f766e; }'
    const wrapper = mount(TdsDesignCanvas, {
      props: {
        frames: [makeFrame({ id: 'm1', title: 'Studio Card' })],
        themeCss,
        canvasPattern: 'grid'
      }
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="tds-canvas-stage"]').attributes('data-pattern')).toBe('grid')
    expect(wrapper.get('[data-testid="tds-canvas-stage"]').classes()).toContain('is-pattern-grid')

    const iframeSrcdoc = wrapper
      .get('[data-testid="tds-canvas-frame-iframe-m1"]')
      .attributes('srcdoc')
    expect(iframeSrcdoc).toContain('<style data-tds-theme-pack>')
    expect(iframeSrcdoc).toContain('--shell-primary: #0f766e;')
    expect(iframeSrcdoc).toContain("default-src 'none'")

    await wrapper.get('[data-testid="tds-canvas-export-mockup"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="tds-mockup-export-dialog"]').exists()).toBe(true)

    // With frameBitmaps forwarded through TdsDesignCanvas -> TdsMockupExportDialog, preview SVG embeds real <image>
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    await wrapper.setProps({ frameBitmaps: { m1: validPng } })
    await nextTick()
    const previewSrc = decodeURIComponent(
      wrapper.get('[data-testid="tds-mockup-preview-img"]').attributes('src') ?? ''
    )
    expect(previewSrc).toContain('<image class="tds-mockup-bitmap"')
    expect(previewSrc).not.toContain('<foreignObject')
  })

  it('satisfies TDS design discipline in TdsMockupExportDialog.vue (tokens-only, refraction surface, zero hover color transition, reduced motion)', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const sfcSource = readFileSync(path.join(dir, 'TdsMockupExportDialog.vue'), 'utf8')
    const styleMatch = sfcSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)
    const styleBlock = styleMatch?.[1] ?? ''

    // Zero raw hex or rgba/rgb literals in component styles
    expect(styleBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styleBlock).not.toMatch(/\brgba?\s*\(/i)

    // Zero hover color/background-color/border-color transitions
    expect(styleBlock).not.toMatch(/transition[^;]*(background-color|border-color|\bcolor\b)/i)

    // Reduced-motion guard present
    expect(styleBlock).toContain('@media (prefers-reduced-motion: reduce)')

    // TxModal explicitly uses surface="refraction"
    expect(sfcSource).toContain('surface="refraction"')
  })
})
