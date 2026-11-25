import type { ImageAddon } from '@xterm/addon-image'
import type { IDisposable, Terminal as XtermTerminal } from '@xterm/xterm'
import { describe, expect, it, vi } from 'vitest'
import { configureHiDpiImageAddon, getDeviceCellSizePixels, XTVERSION_IIP_IDENTITY } from '../src/image-hidpi'

interface RegisteredHandler {
  matcher: { prefix?: string, final: string }
  callback: (params: Array<number | number[]>) => boolean
  disposed: boolean
}

function createTerminalFixture(options: {
  deviceCanvas?: { width: number, height: number }
  cssCanvas?: { width: number, height: number }
  deviceCell?: { width: number, height: number }
  cssCell?: { width: number, height: number }
  windowOptions?: Record<string, boolean>
} = {}) {
  const dimensions = {
    css: {
      canvas: options.cssCanvas ?? { width: 885, height: 600 },
      cell: options.cssCell ?? { width: 7.5, height: 15 },
    },
    device: {
      canvas: options.deviceCanvas ?? { width: 1770.4, height: 1200 },
      cell: options.deviceCell ?? { width: 15.6, height: 30 },
    },
  }
  const reported: string[] = []
  const handlers: RegisteredHandler[] = []
  const renderService = { dimensions }
  const terminal = {
    options: {
      windowOptions: options.windowOptions ?? {
        getWinSizePixels: true,
        getCellSizePixels: true,
        getWinSizeChars: true,
      },
    },
    parser: {
      registerCsiHandler(
        matcher: { prefix?: string, final: string },
        callback: (params: Array<number | number[]>) => boolean,
      ): IDisposable {
        const record: RegisteredHandler = { matcher, callback, disposed: false }
        handlers.push(record)
        return {
          dispose: () => {
            record.disposed = true
          },
        }
      },
    },
    _core: {
      _renderService: renderService,
      coreService: {
        triggerDataEvent: (data: string) => {
          reported.push(data)
        },
      },
    },
  }

  class MockImageRenderer {
    canvas: HTMLCanvasElement | undefined
    _renderService = renderService

    get dimensions() {
      return this._renderService.dimensions
    }

    insertLayerToDom() {
      const canvas = document.createElement('canvas')
      canvas.width = this.dimensions.css.canvas.width
      canvas.height = this.dimensions.css.canvas.height
      this.canvas = canvas
    }

    rescaleCanvas() {
      if (!this.canvas)
        return
      if (
        this.canvas.width !== this.dimensions.css.canvas.width
        || this.canvas.height !== this.dimensions.css.canvas.height
      ) {
        this.canvas.width = this.dimensions.css.canvas.width
        this.canvas.height = this.dimensions.css.canvas.height
      }
    }
  }

  const renderer = new MockImageRenderer()
  const imageAddon = {
    _renderer: renderer,
    dispose: vi.fn(),
  }

  const dispatchCsi = (matcher: { prefix?: string, final: string }, params: Array<number | number[]>) => {
    const active = handlers.filter(
      h => !h.disposed && h.matcher.final === matcher.final && h.matcher.prefix === matcher.prefix,
    )
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.callback(params))
        return true
    }
    return false
  }

  return { terminal, imageAddon, renderer, dimensions, reported, handlers, dispatchCsi }
}

describe('configureHiDpiImageAddon', () => {
  it('projects integer device-pixel backing size onto ImageRenderer while keeping CSS layout size exact', () => {
    const fixture = createTerminalFixture()
    const handle = configureHiDpiImageAddon(
      fixture.terminal as unknown as XtermTerminal,
      fixture.imageAddon as unknown as ImageAddon,
    )

    fixture.renderer.insertLayerToDom()
    expect(fixture.renderer.canvas?.width).toBe(1771)
    expect(fixture.renderer.canvas?.height).toBe(1200)
    expect(fixture.renderer.canvas?.style.width).toBe('885px')
    expect(fixture.renderer.canvas?.style.height).toBe('600px')
    expect(fixture.renderer.dimensions.css.cell).toEqual({ width: 15.6, height: 30 })

    // Re-calling rescaleCanvas when dimensions are unchanged must not mutate canvas.width
    // (which would wipe the 2D canvas buffer on every frame).
    const widthSetter = vi.spyOn(fixture.renderer.canvas!, 'width', 'set')
    fixture.renderer.rescaleCanvas()
    expect(widthSetter).not.toHaveBeenCalled()

    // Dynamic DPR change (e.g. moving from a 2x Retina display to a 1x monitor)
    fixture.dimensions.device.canvas = { width: 885, height: 600 }
    fixture.dimensions.device.cell = { width: 7.5, height: 15 }
    fixture.renderer.rescaleCanvas()
    expect(fixture.renderer.canvas?.width).toBe(885)
    expect(fixture.renderer.canvas?.style.width).toBe('885px')

    handle.dispose()
    expect(fixture.renderer.dimensions.css.canvas).toEqual({ width: 885, height: 600 })
  })

  it('reports floor-rounded physical pixels on CSI 14t and CSI 16t and delegates unrelated CSI t queries', () => {
    const fixture = createTerminalFixture()
    const handle = configureHiDpiImageAddon(
      fixture.terminal as unknown as XtermTerminal,
      fixture.imageAddon as unknown as ImageAddon,
    )

    expect(fixture.dispatchCsi({ final: 't' }, [14])).toBe(true)
    expect(fixture.dispatchCsi({ final: 't' }, [16])).toBe(true)
    // CSI 14;2 t requests outer window pixels (ignored by xterm); CSI 18 t requests char grid size.
    expect(fixture.dispatchCsi({ final: 't' }, [14, 2])).toBe(false)
    expect(fixture.dispatchCsi({ final: 't' }, [18])).toBe(false)

    expect(fixture.reported).toEqual([
      '\u001B[4;1200;1770t',
      '\u001B[6;30;15t',
    ])

    handle.dispose()
    expect(fixture.dispatchCsi({ final: 't' }, [16])).toBe(false)
  })

  it('respects windowOptions gates and falls back cleanly when device metrics are unavailable', () => {
    const fixture = createTerminalFixture({
      deviceCanvas: { width: 0, height: 0 },
      deviceCell: { width: 0, height: 0 },
      windowOptions: { getWinSizePixels: false, getCellSizePixels: true },
    })
    const handle = configureHiDpiImageAddon(
      fixture.terminal as unknown as XtermTerminal,
      fixture.imageAddon as unknown as ImageAddon,
    )

    expect(fixture.renderer.dimensions.css.canvas).toEqual({ width: 885, height: 600 })
    expect(fixture.dispatchCsi({ final: 't' }, [14])).toBe(false)
    expect(fixture.dispatchCsi({ final: 't' }, [16])).toBe(false)
    expect(fixture.reported).toEqual([])
    handle.dispose()
  })

  it('responds to XTVERSION (CSI > q / CSI > 0 q) only when advertiseIip is enabled', () => {
    const disabled = createTerminalFixture()
    const disabledHandle = configureHiDpiImageAddon(
      disabled.terminal as unknown as XtermTerminal,
      disabled.imageAddon as unknown as ImageAddon,
      { advertiseIip: false },
    )
    expect(disabled.dispatchCsi({ prefix: '>', final: 'q' }, [])).toBe(false)
    disabledHandle.dispose()

    const enabled = createTerminalFixture()
    const enabledHandle = configureHiDpiImageAddon(
      enabled.terminal as unknown as XtermTerminal,
      enabled.imageAddon as unknown as ImageAddon,
      { advertiseIip: true },
    )
    expect(enabled.dispatchCsi({ prefix: '>', final: 'q' }, [])).toBe(true)
    expect(enabled.dispatchCsi({ prefix: '>', final: 'q' }, [0])).toBe(true)
    expect(enabled.dispatchCsi({ prefix: '>', final: 'q' }, [1])).toBe(false)
    expect(enabled.reported).toEqual([
      `\u001BP>|${XTVERSION_IIP_IDENTITY}\u001B\\`,
      `\u001BP>|${XTVERSION_IIP_IDENTITY}\u001B\\`,
    ])
    enabledHandle.dispose()
    expect(enabled.handlers.every(h => h.disposed)).toBe(true)
  })

  it('degrades without throwing when xterm or addon internals are mocked without private fields', () => {
    const handle = configureHiDpiImageAddon(
      {} as unknown as XtermTerminal,
      {} as unknown as ImageAddon,
      { advertiseIip: true },
    )
    expect(() => handle.dispose()).not.toThrow()
    expect(getDeviceCellSizePixels({} as unknown as XtermTerminal)).toBeNull()
  })

  it('reports floor-rounded physical device cell pixels via getDeviceCellSizePixels', () => {
    const fixture = createTerminalFixture({
      deviceCell: { width: 16.8, height: 32.9 },
    })
    expect(getDeviceCellSizePixels(fixture.terminal as unknown as XtermTerminal)).toEqual({
      width: 16,
      height: 32,
    })
  })
})
