import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const image = {
    getSize: vi.fn(() => ({ width: 320, height: 240 }))
  }
  const menu = { popup: vi.fn() }

  return {
    image,
    createFromBuffer: vi.fn(() => image),
    writeImage: vi.fn(),
    writeText: vi.fn(),
    getCursorScreenPoint: vi.fn(() => ({ x: 640, y: 360 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1280, height: 720 }
    })),
    buildFromTemplate: vi.fn((_template: unknown) => menu),
    menu
  }
})

const pinWindowMocks = vi.hoisted(() => ({
  options: [] as unknown[],
  bounds: { x: 0, y: 0, width: 420, height: 378 },
  setAlwaysOnTop: vi.fn(),
  setVisibleOnAllWorkspaces: vi.fn(),
  setBounds: vi.fn((bounds: { x: number; y: number; width: number; height: number }) => {
    pinWindowMocks.bounds = { ...bounds }
  }),
  getBounds: vi.fn(() => ({ ...pinWindowMocks.bounds })),
  setOpacity: vi.fn(),
  loadURL: vi.fn(),
  show: vi.fn(),
  close: vi.fn(),
  isDestroyed: vi.fn(() => false),
  webContentsOn: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    writeImage: electronMocks.writeImage,
    writeText: electronMocks.writeText
  },
  Menu: {
    buildFromTemplate: electronMocks.buildFromTemplate
  },
  nativeImage: {
    createFromBuffer: electronMocks.createFromBuffer
  },
  screen: {
    getCursorScreenPoint: electronMocks.getCursorScreenPoint,
    getDisplayNearestPoint: electronMocks.getDisplayNearestPoint
  }
}))

vi.mock('../../../core/touch-window', () => ({
  TouchWindow: class TouchWindow {
    window = {
      webContents: { on: pinWindowMocks.webContentsOn },
      setAlwaysOnTop: pinWindowMocks.setAlwaysOnTop,
      setVisibleOnAllWorkspaces: pinWindowMocks.setVisibleOnAllWorkspaces,
      setBounds: pinWindowMocks.setBounds,
      getBounds: pinWindowMocks.getBounds,
      setOpacity: pinWindowMocks.setOpacity,
      loadURL: pinWindowMocks.loadURL,
      show: pinWindowMocks.show,
      close: pinWindowMocks.close,
      isDestroyed: pinWindowMocks.isDestroyed
    }

    constructor(options: unknown) {
      pinWindowMocks.options.push(options)
      const bounds = options as Partial<{ x: number; y: number; width: number; height: number }>
      pinWindowMocks.bounds = {
        x: bounds.x ?? 0,
        y: bounds.y ?? 0,
        width: bounds.width ?? 420,
        height: bounds.height ?? 378
      }
    }
  }
}))

import { openImageTranslatePinWindow } from './image-translate-pin-window'

interface ContextMenuItem {
  label?: string
  type?: string
  checked?: boolean
  enabled?: boolean
  submenu?: ContextMenuItem[]
  click?: () => void
}

function translatedImageBase64(): string {
  return Buffer.from('translated-image').toString('base64')
}

function createdWindowOptions(): Record<string, unknown> {
  const options = pinWindowMocks.options.at(-1)
  if (!options || typeof options !== 'object') {
    throw new Error('Expected TouchWindow options')
  }
  return options as Record<string, unknown>
}

function menuItems(): ContextMenuItem[] {
  const template = electronMocks.buildFromTemplate.mock.calls[0]?.[0]
  if (!Array.isArray(template)) {
    throw new TypeError('Expected context menu template')
  }
  return template as ContextMenuItem[]
}

function menuItem(label: string): ContextMenuItem {
  const item = menuItems().find((candidate) => candidate.label === label)
  if (!item) throw new Error(`Expected ${label} menu item`)
  return item
}

function submenuItem(parentLabel: string, label: string): ContextMenuItem {
  const item = menuItem(parentLabel).submenu?.find((candidate) => candidate.label === label)
  if (!item) throw new Error(`Expected ${parentLabel} > ${label} menu item`)
  return item
}

function webContentsHandler(eventName: string): (...args: unknown[]) => void {
  const call = pinWindowMocks.webContentsOn.mock.calls.find(([event]) => event === eventName)
  if (!call || typeof call[1] !== 'function') {
    throw new Error(`Expected ${eventName} handler`)
  }
  return call[1] as (...args: unknown[]) => void
}

describe('openImageTranslatePinWindow', () => {
  beforeEach(() => {
    pinWindowMocks.options.length = 0
    electronMocks.image.getSize.mockReturnValue({ width: 320, height: 240 })
    electronMocks.getCursorScreenPoint.mockReturnValue({ x: 640, y: 360 })
    electronMocks.getDisplayNearestPoint.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1280, height: 720 }
    })
    pinWindowMocks.bounds = { x: 0, y: 0, width: 420, height: 378 }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clamps and centers the pin window in the cursor display work area', async () => {
    electronMocks.image.getSize.mockReturnValue({ width: 1200, height: 900 })
    electronMocks.getCursorScreenPoint.mockReturnValue({ x: 400, y: 260 })
    electronMocks.getDisplayNearestPoint.mockReturnValue({
      workArea: { x: 100, y: 80, width: 640, height: 480 }
    })

    await openImageTranslatePinWindow({ translatedImageBase64: translatedImageBase64() })

    expect(electronMocks.getDisplayNearestPoint).toHaveBeenCalledWith({ x: 400, y: 260 })
    expect(createdWindowOptions()).toMatchObject({
      x: 116,
      y: 96,
      width: 608,
      height: 448,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    expect(pinWindowMocks.show).toHaveBeenCalledOnce()
    expect(pinWindowMocks.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true
    })
  })

  it('offers available host copy actions and close through the context menu', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: translatedImageBase64(),
      sourceText: ' source text ',
      targetText: ' translated text '
    })

    expect(
      menuItems()
        .map((item) => item.label)
        .filter(Boolean)
    ).toEqual([
      'Copy Translated Image',
      'Copy Translation',
      'Copy Source Text',
      'Zoom In',
      'Zoom Out',
      'Reset Zoom',
      'Opacity',
      'Close'
    ])

    menuItem('Copy Translated Image').click?.()
    menuItem('Copy Translation').click?.()
    menuItem('Copy Source Text').click?.()
    menuItem('Close').click?.()

    expect(electronMocks.writeImage).toHaveBeenCalledWith(electronMocks.image)
    expect(electronMocks.writeText).toHaveBeenNthCalledWith(1, 'translated text')
    expect(electronMocks.writeText).toHaveBeenNthCalledWith(2, 'source text')
    expect(pinWindowMocks.close).toHaveBeenCalledOnce()

    const preventDefault = vi.fn()
    webContentsHandler('context-menu')({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(electronMocks.menu.popup).toHaveBeenCalledOnce()
  })

  it('zooms around the window center within the work area and applies opacity presets', async () => {
    await openImageTranslatePinWindow({ translatedImageBase64: translatedImageBase64() })

    menuItem('Zoom In').click?.()
    expect(pinWindowMocks.setBounds).toHaveBeenLastCalledWith({
      x: 378,
      y: 124,
      width: 525,
      height: 473
    })

    menuItem('Reset Zoom').click?.()
    expect(pinWindowMocks.setBounds).toHaveBeenLastCalledWith({
      x: 430,
      y: 171,
      width: 420,
      height: 378
    })

    submenuItem('Opacity', '70%').click?.()
    expect(pinWindowMocks.setOpacity).toHaveBeenCalledWith(0.7)
  })

  it('handles close, copy, and zoom keyboard shortcuts', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: translatedImageBase64(),
      targetText: 'translated text'
    })
    expect(
      menuItems()
        .map((item) => item.label)
        .filter(Boolean)
    ).toEqual([
      'Copy Translated Image',
      'Copy Translation',
      'Zoom In',
      'Zoom Out',
      'Reset Zoom',
      'Opacity',
      'Close'
    ])

    const keyHandler = webContentsHandler('before-input-event')
    const escapePreventDefault = vi.fn()
    keyHandler({ preventDefault: escapePreventDefault }, { key: 'Escape' })
    expect(escapePreventDefault).toHaveBeenCalledOnce()
    expect(pinWindowMocks.close).toHaveBeenCalledOnce()

    const copyPreventDefault = vi.fn()
    keyHandler(
      { preventDefault: copyPreventDefault },
      { key: 'C', shift: true, control: true, meta: false }
    )
    expect(copyPreventDefault).toHaveBeenCalledOnce()
    expect(electronMocks.writeText).toHaveBeenCalledWith('translated text')

    const zoomInPreventDefault = vi.fn()
    keyHandler(
      { preventDefault: zoomInPreventDefault },
      { key: '+', control: false, meta: true, alt: false }
    )
    expect(zoomInPreventDefault).toHaveBeenCalledOnce()
    expect(pinWindowMocks.setBounds).toHaveBeenLastCalledWith({
      x: 378,
      y: 124,
      width: 525,
      height: 473
    })

    const zoomOutPreventDefault = vi.fn()
    keyHandler(
      { preventDefault: zoomOutPreventDefault },
      { key: '-', control: false, meta: true, alt: false }
    )
    expect(zoomOutPreventDefault).toHaveBeenCalledOnce()
    expect(pinWindowMocks.setBounds).toHaveBeenLastCalledWith({
      x: 430,
      y: 171,
      width: 420,
      height: 378
    })
  })

  it('offers source copy without a target translation', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: translatedImageBase64(),
      sourceText: 'source text'
    })

    expect(
      menuItems()
        .map((item) => item.label)
        .filter(Boolean)
    ).toEqual([
      'Copy Translated Image',
      'Copy Source Text',
      'Zoom In',
      'Zoom Out',
      'Reset Zoom',
      'Opacity',
      'Close'
    ])
  })

  it('omits unavailable text actions and copies the image when shortcut text is absent', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: translatedImageBase64(),
      sourceText: '   ',
      targetText: '   '
    })

    expect(
      menuItems()
        .map((item) => item.label)
        .filter(Boolean)
    ).toEqual(['Copy Translated Image', 'Zoom In', 'Zoom Out', 'Reset Zoom', 'Opacity', 'Close'])

    const preventDefault = vi.fn()
    webContentsHandler('before-input-event')(
      { preventDefault },
      {
        key: 'c',
        shift: true,
        control: false,
        meta: true
      }
    )
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(electronMocks.writeImage).toHaveBeenCalledWith(electronMocks.image)
    expect(electronMocks.writeText).not.toHaveBeenCalled()
  })

  it('loads a sandboxed data document with visible instructions and escaped content', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: translatedImageBase64(),
      sourceText: `<script>alert('source')</script>`,
      targetText: `&<script>alert("target")</script>`
    })

    expect(electronMocks.createFromBuffer).toHaveBeenCalledWith(Buffer.from('translated-image'))
    expect(pinWindowMocks.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating')
    const url = String(pinWindowMocks.loadURL.mock.calls[0]?.[0] ?? '')
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    const html = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    expect(html).toContain(
      "Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline';\""
    )
    expect(html).toContain('Right-click: copy · zoom · opacity · close')
    expect(html).toContain('&lt;script&gt;alert(&#39;source&#39;)&lt;/script&gt;')
    expect(html).toContain('&amp;&lt;script&gt;alert(&quot;target&quot;)&lt;/script&gt;')
    expect(html).not.toContain(`<script>alert('source')</script>`)
    expect(html).not.toContain(`<script>alert("target")</script>`)
  })

  it('renders the client overlay with the validated image MIME type', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: translatedImageBase64(),
      imageMimeType: 'image/jpeg',
      targetText: '<你好>',
      overlay: { mode: 'client-render' }
    })

    const url = String(pinWindowMocks.loadURL.mock.calls[0]?.[0] ?? '')
    const html = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('class="overlay"')
    expect(html).toContain('&lt;你好&gt;')
  })
})
