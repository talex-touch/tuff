import { afterEach, describe, expect, it, vi } from 'vitest'

const loadUrlMock = vi.hoisted(() => vi.fn())
const setAlwaysOnTopMock = vi.hoisted(() => vi.fn())

const electronMocks = vi.hoisted(() => ({
  createFromBuffer: vi.fn(() => ({
    getSize: () => ({ width: 320, height: 240 })
  }))
}))

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: electronMocks.createFromBuffer
  }
}))

vi.mock('../../../core/touch-window', () => ({
  TouchWindow: class TouchWindow {
    window = {
      setAlwaysOnTop: setAlwaysOnTopMock,
      loadURL: loadUrlMock
    }

    constructor(public readonly options: unknown) {}
  }
}))

import { openImageTranslatePinWindow } from './image-translate-pin-window'

describe('openImageTranslatePinWindow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('opens an always-on-top translated image window with escaped text', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      sourceText: '<hello>',
      targetText: '"你好"'
    })

    expect(electronMocks.createFromBuffer).toHaveBeenCalledWith(Buffer.from('translated-image'))
    expect(setAlwaysOnTopMock).toHaveBeenCalledWith(true, 'floating')
    expect(loadUrlMock).toHaveBeenCalledTimes(1)
    const url = String(loadUrlMock.mock.calls[0]?.[0] ?? '')
    expect(url).toContain('data:text/html')
    const html = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('&lt;hello&gt;')
    expect(html).toContain('&quot;你好&quot;')
  })

  it('renders client overlay when composed scene returns overlay payload', async () => {
    await openImageTranslatePinWindow({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      imageMimeType: 'image/jpeg',
      targetText: '<你好>',
      overlay: { mode: 'client-render' }
    })

    const url = String(loadUrlMock.mock.calls[0]?.[0] ?? '')
    const html = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('class="overlay"')
    expect(html).toContain('&lt;你好&gt;')
  })
})
