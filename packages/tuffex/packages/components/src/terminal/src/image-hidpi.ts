import type { ImageAddon } from '@xterm/addon-image'
import type { IDisposable, Terminal as XtermTerminal } from '@xterm/xterm'

interface DimensionsBox {
  width: number
  height: number
}

interface XtermRenderDimensions {
  css?: {
    canvas?: DimensionsBox
    cell?: DimensionsBox
  }
  device?: {
    canvas?: DimensionsBox
    cell?: DimensionsBox
  }
}

interface XtermRenderServiceLike {
  dimensions?: XtermRenderDimensions
}

interface XtermCoreLike {
  _renderService?: XtermRenderServiceLike
  coreService?: {
    triggerDataEvent?: (data: string) => void
  }
}

interface ImageRendererLike {
  canvas?: HTMLCanvasElement
  dimensions?: XtermRenderDimensions
  _renderService?: XtermRenderServiceLike
  insertLayerToDom?: () => void
  rescaleCanvas?: () => void
}

interface InternalXtermTerminal extends XtermTerminal {
  _core?: XtermCoreLike
}

interface InternalImageAddon extends ImageAddon {
  _renderer?: ImageRendererLike
}

export interface HiDpiImageAddonOptions {
  /**
   * Advertise IIP (`OSC 1337`) capability via `XTVERSION` (`CSI > q`) so TUIs
   * such as `yazi` prefer 24-bit truecolor IIP over 256-color dithered SIXEL.
   */
  advertiseIip?: boolean
}

// `OSC 1337` (IIP) has no DA1/DECRQM capability flag. Reporting `xterm.js(Bobcat)`
// on `XTVERSION` lets `yazi` select 24-bit IIP across local PTYs, `herdr-core`, and
// SSH without triggering `iTerm2`/`WezTerm`-specific quirks in editors or shells.
export const XTVERSION_IIP_IDENTITY = 'xterm.js(Bobcat)'

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function resolveRawDimensions(
  renderer: ImageRendererLike | undefined,
  terminal: InternalXtermTerminal,
): XtermRenderDimensions | undefined {
  return renderer?._renderService?.dimensions ?? terminal._core?._renderService?.dimensions
}

/**
 * Returns the floor-rounded physical device-pixel cell size reported to TUIs via
 * `CSI 16 t`, or falls back to CSS cell size when device metrics are unavailable.
 */
export function getDeviceCellSizePixels(
  terminal: XtermTerminal,
): { width: number, height: number } | null {
  const raw = (terminal as InternalXtermTerminal)._core?._renderService?.dimensions
  const cell = raw?.device?.cell ?? raw?.css?.cell
  if (!isPositiveFinite(cell?.width) || !isPositiveFinite(cell?.height))
    return null
  const width = Math.floor(cell.width)
  const height = Math.floor(cell.height)
  return width > 0 && height > 0 ? { width, height } : null
}

function projectDeviceDimensions(raw: XtermRenderDimensions | undefined): XtermRenderDimensions | undefined {
  const deviceCanvas = raw?.device?.canvas
  const deviceCell = raw?.device?.cell
  if (
    !raw
    || !isPositiveFinite(deviceCanvas?.width)
    || !isPositiveFinite(deviceCanvas?.height)
    || !isPositiveFinite(deviceCell?.width)
    || !isPositiveFinite(deviceCell?.height)
  ) {
    return raw
  }

  return {
    ...raw,
    css: {
      ...raw.css,
      // Use integer backing dimensions so `@xterm/addon-image`'s `rescaleCanvas()`
      // equality check against `HTMLCanvasElement.{width,height}` never thrashes.
      canvas: {
        width: Math.ceil(deviceCanvas.width),
        height: Math.ceil(deviceCanvas.height),
      },
      cell: {
        width: deviceCell.width,
        height: deviceCell.height,
      },
    },
  }
}

function syncCanvasCssLayout(
  renderer: ImageRendererLike,
  raw: XtermRenderDimensions | undefined,
): void {
  const canvas = renderer.canvas
  const cssCanvas = raw?.css?.canvas
  if (!canvas || !isPositiveFinite(cssCanvas?.width) || !isPositiveFinite(cssCanvas?.height))
    return
  const nextWidth = `${cssCanvas.width}px`
  const nextHeight = `${cssCanvas.height}px`
  if (canvas.style.width !== nextWidth)
    canvas.style.width = nextWidth
  if (canvas.style.height !== nextHeight)
    canvas.style.height = nextHeight
}

/**
 * Adapts `@xterm/addon-image` to render at native device-pixel density on HiDPI /
 * Retina displays and report physical pixel sizes to `CSI 14 t` / `CSI 16 t`.
 */
export function configureHiDpiImageAddon(
  terminal: XtermTerminal,
  imageAddon: ImageAddon,
  options: HiDpiImageAddonOptions = {},
): IDisposable {
  const internalTerminal = terminal as InternalXtermTerminal
  const internalAddon = imageAddon as InternalImageAddon
  const renderer = internalAddon._renderer
  const disposables: IDisposable[] = []
  let restored = false

  let hadOwnDimensions = false
  let prevDimensionsDescriptor: PropertyDescriptor | undefined
  let hadOwnInsert = false
  let prevInsert: (() => void) | undefined
  let hadOwnRescale = false
  let prevRescale: (() => void) | undefined

  if (renderer) {
    hadOwnDimensions = Object.prototype.hasOwnProperty.call(renderer, 'dimensions')
    prevDimensionsDescriptor = Object.getOwnPropertyDescriptor(renderer, 'dimensions')
    Object.defineProperty(renderer, 'dimensions', {
      configurable: true,
      get: () => projectDeviceDimensions(resolveRawDimensions(renderer, internalTerminal)),
    })

    if (typeof renderer.insertLayerToDom === 'function') {
      hadOwnInsert = Object.prototype.hasOwnProperty.call(renderer, 'insertLayerToDom')
      prevInsert = renderer.insertLayerToDom
      const originalInsert = prevInsert
      renderer.insertLayerToDom = () => {
        originalInsert.call(renderer)
        syncCanvasCssLayout(renderer, resolveRawDimensions(renderer, internalTerminal))
      }
    }

    if (typeof renderer.rescaleCanvas === 'function') {
      hadOwnRescale = Object.prototype.hasOwnProperty.call(renderer, 'rescaleCanvas')
      prevRescale = renderer.rescaleCanvas
      const originalRescale = prevRescale
      renderer.rescaleCanvas = () => {
        originalRescale.call(renderer)
        syncCanvasCssLayout(renderer, resolveRawDimensions(renderer, internalTerminal))
      }
    }

    syncCanvasCssLayout(renderer, resolveRawDimensions(renderer, internalTerminal))
  }

  const triggerDataEvent = (data: string): boolean => {
    const trigger = internalTerminal._core?.coreService?.triggerDataEvent
    if (typeof trigger !== 'function')
      return false
    trigger.call(internalTerminal._core!.coreService, data)
    return true
  }

  if (typeof terminal.parser?.registerCsiHandler === 'function') {
    // Report floor-rounded physical pixels on CSI 14 t (window size) and CSI 16 t
    // (cell size) so TUI previewers encode at native Retina resolution without
    // spilling past the right or bottom pane boundary on fractional device cells.
    disposables.push(
      terminal.parser.registerCsiHandler({ final: 't' }, (params) => {
        const first = params[0]
        const second = params[1]
        if (typeof first !== 'number')
          return false
        const windowOptions = terminal.options?.windowOptions
        const raw = resolveRawDimensions(renderer, internalTerminal)
        if (first === 14 && second !== 2 && windowOptions?.getWinSizePixels) {
          const width = raw?.device?.canvas?.width
          const height = raw?.device?.canvas?.height
          if (isPositiveFinite(width) && isPositiveFinite(height)) {
            const reportWidth = Math.floor(width)
            const reportHeight = Math.floor(height)
            if (reportWidth > 0 && reportHeight > 0)
              return triggerDataEvent(`\u001B[4;${reportHeight};${reportWidth}t`)
          }
        }
        if (first === 16 && windowOptions?.getCellSizePixels) {
          const width = raw?.device?.cell?.width
          const height = raw?.device?.cell?.height
          if (isPositiveFinite(width) && isPositiveFinite(height)) {
            const reportWidth = Math.floor(width)
            const reportHeight = Math.floor(height)
            if (reportWidth > 0 && reportHeight > 0)
              return triggerDataEvent(`\u001B[6;${reportHeight};${reportWidth}t`)
          }
        }
        return false
      }),
    )

    if (options.advertiseIip) {
      disposables.push(
        terminal.parser.registerCsiHandler({ prefix: '>', final: 'q' }, (params) => {
          if (params.length > 1)
            return false
          if (params.length === 1 && params[0] !== 0)
            return false
          return triggerDataEvent(`\u001BP>|${XTVERSION_IIP_IDENTITY}\u001B\\`)
        }),
      )
    }
  }

  return {
    dispose() {
      if (restored)
        return
      restored = true
      for (const disposable of disposables.splice(0))
        disposable.dispose()
      if (!renderer)
        return
      if (hadOwnDimensions && prevDimensionsDescriptor)
        Object.defineProperty(renderer, 'dimensions', prevDimensionsDescriptor)
      else
        delete renderer.dimensions
      if (prevInsert) {
        if (hadOwnInsert)
          renderer.insertLayerToDom = prevInsert
        else
          delete renderer.insertLayerToDom
      }
      if (prevRescale) {
        if (hadOwnRescale)
          renderer.rescaleCanvas = prevRescale
        else
          delete renderer.rescaleCanvas
      }
    },
  }
}
