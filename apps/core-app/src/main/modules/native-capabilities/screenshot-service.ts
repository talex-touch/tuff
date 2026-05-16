import type {
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport
} from '@talex-touch/utils/transport/events/types'
import type {
  NativeAddonCaptureOptions,
  NativeAddonCaptureResult,
  NativeAddonDisplay
} from './native-screenshot-addon'
import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import { toTfileUrl } from '@talex-touch/utils/network'
import { clipboard, nativeImage, screen } from 'electron'
import { tempFileService } from '../../service/temp-file.service'
import { createLogger } from '../../utils/logger'
import { nativeScreenshotAddon } from './native-screenshot-addon'

const SCREENSHOT_NAMESPACE = 'native/screenshots'
const SCREENSHOT_RETENTION_MS = 30 * 60_000
const screenshotLog = createLogger('NativeScreenshot')

interface DisplayPair {
  native: NativeAddonDisplay
  electron: Electron.Display | null
}

type CodedError = Error & { code?: string }

function toCodedError(error: unknown, fallbackCode: string): CodedError {
  if (error instanceof Error) {
    const coded = error as CodedError
    if (!coded.code) coded.code = fallbackCode
    return coded
  }
  const coded = new Error(String(error)) as CodedError
  coded.code = fallbackCode
  return coded
}

function assertPositiveRegion(region: { width: number; height: number }): void {
  if (!Number.isFinite(region.width) || !Number.isFinite(region.height)) {
    const error = new Error('Capture region width and height must be finite') as CodedError
    error.code = 'ERR_NATIVE_SCREENSHOT_INVALID_REGION'
    throw error
  }
  if (region.width <= 0 || region.height <= 0) {
    const error = new Error('Capture region width and height must be positive') as CodedError
    error.code = 'ERR_NATIVE_SCREENSHOT_INVALID_REGION'
    throw error
  }
}

function createCodedError(message: string, code: string): CodedError {
  const error = new Error(message) as CodedError
  error.code = code
  return error
}

function getElectronDisplays(): Electron.Display[] {
  try {
    return screen.getAllDisplays()
  } catch {
    return []
  }
}

function getPrimaryElectronDisplay(): Electron.Display | null {
  try {
    return screen.getPrimaryDisplay()
  } catch {
    return null
  }
}

function getDisplayScale(display: Electron.Display | null, fallback = 1): number {
  const scale = display?.scaleFactor
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : fallback
}

function getPhysicalBounds(display: Electron.Display): {
  x: number
  y: number
  width: number
  height: number
} {
  const scale = getDisplayScale(display)
  return {
    x: Math.round(display.bounds.x * scale),
    y: Math.round(display.bounds.y * scale),
    width: Math.round(display.bounds.width * scale),
    height: Math.round(display.bounds.height * scale)
  }
}

function scoreDisplayPair(
  nativeDisplay: NativeAddonDisplay,
  electronDisplay: Electron.Display,
  primaryDisplayId: number | null
): number {
  if (String(electronDisplay.id) === nativeDisplay.id) {
    return -100_000
  }

  const physical = getPhysicalBounds(electronDisplay)
  const primaryPenalty =
    primaryDisplayId !== null &&
    nativeDisplay.isPrimary === (electronDisplay.id === primaryDisplayId)
      ? 0
      : 5_000

  return (
    Math.abs(nativeDisplay.width - physical.width) +
    Math.abs(nativeDisplay.height - physical.height) +
    Math.abs(nativeDisplay.x - physical.x) +
    Math.abs(nativeDisplay.y - physical.y) +
    primaryPenalty
  )
}

function mapDisplays(nativeDisplays: NativeAddonDisplay[]): DisplayPair[] {
  const electronDisplays = getElectronDisplays()
  const primaryDisplayId = getPrimaryElectronDisplay()?.id ?? null
  const remaining = new Set(electronDisplays)

  return nativeDisplays.map((nativeDisplay) => {
    let best: Electron.Display | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const electronDisplay of remaining) {
      const score = scoreDisplayPair(nativeDisplay, electronDisplay, primaryDisplayId)
      if (score < bestScore) {
        best = electronDisplay
        bestScore = score
      }
    }

    if (best) {
      remaining.delete(best)
    }

    return { native: nativeDisplay, electron: best }
  })
}

function toDip(value: number, scale: number): number {
  return Math.round(value / scale)
}

function toTransportDisplay(pair: DisplayPair): NativeScreenshotDisplay {
  const scale = getDisplayScale(pair.electron, pair.native.scaleFactor)
  const bounds = pair.electron?.bounds

  return {
    id: pair.native.id,
    name: pair.native.friendlyName || pair.native.name,
    friendlyName: pair.native.friendlyName,
    x: bounds ? bounds.x : toDip(pair.native.x, scale),
    y: bounds ? bounds.y : toDip(pair.native.y, scale),
    width: bounds ? bounds.width : toDip(pair.native.width, scale),
    height: bounds ? bounds.height : toDip(pair.native.height, scale),
    scaleFactor: scale,
    rotation: pair.native.rotation,
    isPrimary: pair.native.isPrimary
  }
}

function toNativeLocalRegion(
  region: NonNullable<NativeScreenshotCaptureRequest['region']>,
  pair: DisplayPair
): NonNullable<NativeAddonCaptureOptions['region']> {
  const scale = getDisplayScale(pair.electron, pair.native.scaleFactor)
  const bounds = pair.electron?.bounds

  if (!bounds) {
    return {
      x: Math.max(0, Math.round(region.x * scale) - pair.native.x),
      y: Math.max(0, Math.round(region.y * scale) - pair.native.y),
      width: Math.max(1, Math.round(region.width * scale)),
      height: Math.max(1, Math.round(region.height * scale))
    }
  }

  return {
    x: Math.max(0, Math.round((region.x - bounds.x) * scale)),
    y: Math.max(0, Math.round((region.y - bounds.y) * scale)),
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale))
  }
}

function toNativePoint(
  point: { x: number; y: number },
  pair: DisplayPair | null
): {
  x: number
  y: number
} {
  if (!pair?.electron) {
    const scale = getDisplayScale(pair?.electron ?? null, pair?.native.scaleFactor ?? 1)
    return {
      x: Math.round(point.x * scale),
      y: Math.round(point.y * scale)
    }
  }

  const scale = getDisplayScale(pair.electron, pair.native.scaleFactor)
  return {
    x: pair.native.x + Math.round((point.x - pair.electron.bounds.x) * scale),
    y: pair.native.y + Math.round((point.y - pair.electron.bounds.y) * scale)
  }
}

function getRegionCenter(region: NonNullable<NativeScreenshotCaptureRequest['region']>): {
  x: number
  y: number
} {
  return {
    x: region.x + region.width / 2,
    y: region.y + region.height / 2
  }
}

export class NativeScreenshotService {
  private tempNamespaceRegistered = false

  getSupport(): NativeScreenshotSupport {
    try {
      return nativeScreenshotAddon.getNativeScreenshotSupport()
    } catch (error) {
      return {
        supported: false,
        platform: process.platform,
        reason: error instanceof Error ? error.message : String(error)
      }
    }
  }

  listDisplays(): NativeScreenshotDisplay[] {
    const support = this.getSupport()
    if (!support.supported) {
      return []
    }

    try {
      return mapDisplays(nativeScreenshotAddon.listDisplays()).map(toTransportDisplay)
    } catch (error) {
      screenshotLog.warn('Failed to list native displays', {
        meta: {
          platform: process.platform,
          errorCode: (error as CodedError | null)?.code ?? null
        }
      })
      return []
    }
  }

  async capture(
    request: NativeScreenshotCaptureRequest = {}
  ): Promise<NativeScreenshotCaptureResult> {
    const support = this.getSupport()
    if (!support.supported) {
      const error = new Error(support.reason || 'Native screenshot is unsupported') as CodedError
      error.code = 'ERR_NATIVE_SCREENSHOT_UNSUPPORTED'
      throw error
    }

    this.ensureTempNamespace()

    const startedAt = performance.now()
    const normalized = request ?? {}
    const writeClipboard = normalized.writeClipboard === true
    const output = normalized.output ?? 'tfile'

    try {
      const nativeResult = nativeScreenshotAddon.capture(this.buildNativeCaptureOptions(normalized))
      const imageBuffer = Buffer.isBuffer(nativeResult.image)
        ? nativeResult.image
        : Buffer.from(nativeResult.image)
      const wroteClipboard = writeClipboard ? this.writeClipboardImage(imageBuffer) : false
      const result = await this.buildCaptureResult(
        nativeResult,
        imageBuffer,
        output,
        wroteClipboard
      )

      screenshotLog.info('Native screenshot captured', {
        meta: {
          platform: process.platform,
          width: result.width,
          height: result.height,
          durationMs: Math.round(performance.now() - startedAt),
          output,
          wroteClipboard
        }
      })

      return result
    } catch (error) {
      const coded = toCodedError(error, 'ERR_NATIVE_SCREENSHOT_CAPTURE_FAILED')
      screenshotLog.warn('Native screenshot capture failed', {
        meta: {
          platform: process.platform,
          durationMs: Math.round(performance.now() - startedAt),
          errorCode: coded.code ?? null
        }
      })
      throw coded
    }
  }

  private ensureTempNamespace(): void {
    if (this.tempNamespaceRegistered) return
    tempFileService.registerNamespace({
      namespace: SCREENSHOT_NAMESPACE,
      retentionMs: SCREENSHOT_RETENTION_MS
    })
    tempFileService.startCleanup()
    this.tempNamespaceRegistered = true
  }

  private buildNativeCaptureOptions(
    request: NativeScreenshotCaptureRequest
  ): NativeAddonCaptureOptions {
    const target = request.target ?? 'cursor-display'
    if (target === 'region') {
      if (!request.region) {
        throw createCodedError(
          'Capture region is required for region target',
          'ERR_NATIVE_SCREENSHOT_INVALID_REGION'
        )
      }

      assertPositiveRegion(request.region)
      const pair = this.resolveDisplayForRegion(request.region, request.displayId)
      if (!pair) {
        throw createCodedError(
          'Unable to resolve display for capture region',
          'ERR_NATIVE_SCREENSHOT_DISPLAY_NOT_FOUND'
        )
      }
      return {
        displayId: pair.native.id,
        region: toNativeLocalRegion(request.region, pair)
      }
    }

    if (target === 'display') {
      return {
        displayId: request.displayId ?? this.resolveDisplayForCursor(request.cursorPoint)?.native.id
      }
    }

    const pair = this.resolveDisplayForCursor(request.cursorPoint)
    const cursorPoint = request.cursorPoint ?? this.getCursorPoint()
    const nativePoint = toNativePoint(cursorPoint, pair)

    return {
      displayId: pair?.native.id,
      cursorX: nativePoint.x,
      cursorY: nativePoint.y
    }
  }

  private async buildCaptureResult(
    nativeResult: NativeAddonCaptureResult,
    imageBuffer: Buffer,
    output: NativeScreenshotCaptureRequest['output'],
    wroteClipboard: boolean
  ): Promise<NativeScreenshotCaptureResult> {
    const displayMeta = this.getTransportDisplayMetadata(nativeResult)
    const result: NativeScreenshotCaptureResult = {
      mimeType: nativeResult.mimeType,
      width: nativeResult.width,
      height: nativeResult.height,
      displayId: nativeResult.displayId,
      displayName: nativeResult.displayName,
      x: displayMeta.x,
      y: displayMeta.y,
      scaleFactor: displayMeta.scaleFactor,
      durationMs: nativeResult.durationMs,
      sizeBytes: imageBuffer.length,
      wroteClipboard
    }

    if (output === 'data-url') {
      result.dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`
      return result
    }

    const stored = await tempFileService.createFile({
      namespace: SCREENSHOT_NAMESPACE,
      ext: 'png',
      buffer: imageBuffer,
      prefix: 'screenshot'
    })

    result.path = stored.path
    result.tfileUrl = toTfileUrl(stored.path)
    result.sizeBytes = stored.sizeBytes
    return result
  }

  private writeClipboardImage(imageBuffer: Buffer): boolean {
    const image = nativeImage.createFromBuffer(imageBuffer)
    if (image.isEmpty()) {
      return false
    }

    clipboard.writeImage(image)
    return true
  }

  private resolveDisplayForRegion(
    region: NonNullable<NativeScreenshotCaptureRequest['region']>,
    displayId?: string
  ): DisplayPair | null {
    if (displayId) {
      return this.resolveDisplayById(displayId)
    }

    return this.resolveDisplayForPoint(getRegionCenter(region))
  }

  private resolveDisplayForCursor(point?: { x: number; y: number }): DisplayPair | null {
    return this.resolveDisplayForPoint(point ?? this.getCursorPoint())
  }

  private resolveDisplayForPoint(point: { x: number; y: number }): DisplayPair | null {
    const pairs = this.getDisplayPairs()
    if (pairs.length === 0) return null

    let electronDisplay: Electron.Display | null = null
    try {
      electronDisplay = screen.getDisplayNearestPoint({
        x: Math.round(point.x),
        y: Math.round(point.y)
      })
    } catch {
      electronDisplay = null
    }

    if (electronDisplay) {
      const matched = pairs.find((pair) => pair.electron?.id === electronDisplay?.id)
      if (matched) return matched
    }

    return pairs[0] ?? null
  }

  private resolveDisplayById(displayId: string): DisplayPair | null {
    return this.getDisplayPairs().find((pair) => pair.native.id === displayId) ?? null
  }

  private getTransportDisplayMetadata(nativeResult: NativeAddonCaptureResult): {
    x: number
    y: number
    scaleFactor: number
  } {
    const pair = this.resolveDisplayById(nativeResult.displayId)
    if (pair?.electron) {
      return {
        x: pair.electron.bounds.x,
        y: pair.electron.bounds.y,
        scaleFactor: getDisplayScale(pair.electron, nativeResult.scaleFactor)
      }
    }

    const scale = getDisplayScale(null, nativeResult.scaleFactor)
    return {
      x: toDip(nativeResult.x, scale),
      y: toDip(nativeResult.y, scale),
      scaleFactor: scale
    }
  }

  private getDisplayPairs(): DisplayPair[] {
    try {
      return mapDisplays(nativeScreenshotAddon.listDisplays())
    } catch {
      return []
    }
  }

  private getCursorPoint(): { x: number; y: number } {
    try {
      return screen.getCursorScreenPoint()
    } catch {
      return { x: 0, y: 0 }
    }
  }
}

let nativeScreenshotService: NativeScreenshotService | null = null

export function getNativeScreenshotService(): NativeScreenshotService {
  if (!nativeScreenshotService) {
    nativeScreenshotService = new NativeScreenshotService()
  }
  return nativeScreenshotService
}
