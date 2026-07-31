import type {
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport
} from '@talex-touch/utils/transport/events/types'
import type { NativeCapabilityDescriptor } from '@talex-touch/tuff-native/protocol-contract'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { resolveLocalFilePath, toTfileUrl } from '@talex-touch/utils/network'
import { BrowserWindow, clipboard, nativeImage, screen } from 'electron'
import { tempFileService } from '../../service/temp-file.service'
import {
  PRIVACY_RETENTION_DAY_MS,
  PRIVACY_SCREENSHOT_TEMP_NAMESPACE
} from '../privacy/retention-policy'
import { createLogger } from '../../utils/logger'
import type {
  NativeResult,
  NativeStream,
  NativeTransport,
  NativeTransportSnapshot
} from './native-transport'
import {
  parseScreenshotAxisScale,
  parseScreenshotGlobalDipPoint,
  parseScreenshotGlobalDipRect,
  parseScreenshotPixelSize,
  parseScreenshotRotation,
  type ScreenshotAxisScale,
  type ScreenshotGlobalDipPoint,
  type ScreenshotGlobalDipRect
} from './screenshot-protocol'

const SCREENSHOT_CAPABILITY = 'screenshot.capture'
const SCREENSHOT_NAMESPACE = PRIVACY_SCREENSHOT_TEMP_NAMESPACE
const SCREENSHOT_RETENTION_MS = PRIVACY_RETENTION_DAY_MS
const DEFAULT_FRAME_BYTES = 64 * 1024 * 1024
const MAX_COMPOSE_ATTACHMENT_BYTES = 32 * 1024 * 1024
const MAX_COMPOSE_PACKET_BYTES = 64 * 1024 * 1024
const MAX_SELF_WINDOW_IDS = 128
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/
const MEDIA_SOURCE_WINDOW_PATTERN = /^window:([1-9][0-9]*)(?::|$)/
const screenshotLog = createLogger('NativeScreenshot')

type CodedError = Error & { code?: string }
type PermissionStatus = 'granted' | 'denied' | 'restricted' | 'unknown' | 'unsupported'
type AccessibilityStatus = PermissionStatus | 'timeout'

type ProtocolCaptureTarget =
  | { kind: 'display'; generation: string; displayId: string }
  | { kind: 'window'; generation: string; windowId: string }
  | { kind: 'region'; generation: string; rect: ScreenshotGlobalDipRect }
  | { kind: 'ui-element'; generation: string; elementId: string }

interface ProtocolProbe {
  platform: string
  engine: string
  screenRecording: PermissionStatus
  accessibility: AccessibilityStatus
  features: string[]
}

interface ProtocolDisplay {
  id: string
  nativeId: string
  name: string
  globalFrame: ScreenshotGlobalDipRect
  pixelSize: { width: number; height: number }
  scale: ScreenshotAxisScale
  rotation: 0 | 90 | 180 | 270
  isPrimary: boolean
}

interface ProtocolContentSnapshot {
  generation: string
  coordinateSpace: 'global-dip-v1'
  capturedAtUnixMs: number
  displays: ProtocolDisplay[]
  windows: unknown[]
  accessibility: AccessibilityStatus
}

interface ProtocolHitTestResult {
  generation: string
  point: ScreenshotGlobalDipPoint
  candidates: unknown[]
  accessibilityFallback?: string
}

interface AttachmentPart {
  attachmentId: string
  offset: number
  byteLength: number
}

interface ScreenshotSelfContext {
  processIds: number[]
  bundleIds: string[]
  nativeWindowIds: string[]
}

function parseMediaSourceWindowId(sourceId: string): string | null {
  const match = MEDIA_SOURCE_WINDOW_PATTERN.exec(sourceId)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffffffff) return null
  return String(value)
}

function collectScreenshotSelfContext(): ScreenshotSelfContext {
  const bundleId = process.env.__CFBundleIdentifier?.trim()
  const bundleIds = bundleId && BUNDLE_ID_PATTERN.test(bundleId) ? [bundleId] : []
  const nativeWindowIds = new Set<string>()

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (nativeWindowIds.size >= MAX_SELF_WINDOW_IDS) break
    try {
      if (browserWindow.isDestroyed()) continue
      const nativeWindowId = parseMediaSourceWindowId(browserWindow.getMediaSourceId())
      if (nativeWindowId) nativeWindowIds.add(nativeWindowId)
    } catch {
      // A window may be destroyed between enumeration and source-id lookup.
    }
  }

  return {
    processIds: [process.pid],
    bundleIds,
    nativeWindowIds: [...nativeWindowIds]
  }
}

interface ProtocolCaptureOutput {
  generation: string
  targetKind: 'display' | 'window' | 'region' | 'ui-element'
  mimeType: 'image/png'
  width: number
  height: number
  outputScale: ScreenshotAxisScale
  globalRect: ScreenshotGlobalDipRect
  byteLength: number
  imageParts: AttachmentPart[]
}

export interface ScreenshotFrozenSource {
  display: NativeScreenshotDisplay
  resource: NativeScreenshotCaptureResult
}

export interface ScreenshotComposeEffects {
  border?: boolean
  shadow?: boolean
  cornerRadius?: number
}

export interface ScreenshotNativeSelectionCandidate {
  kind: 'window' | 'ui-element'
  bounds: ScreenshotGlobalDipRect
  generation: string
  targetId: string
}

export interface ScreenshotFramesRequest {
  target: ProtocolCaptureTarget
  cursor?: 'hidden' | 'system'
  framesPerSecond?: number
  maxFrameBytes?: number
  initialWindow?: number
  signal?: AbortSignal
}

export interface ScreenshotFrameOutput {
  width: number
  height: number
  stride: number
  pixelFormat: 'bgra8-premultiplied'
  globalRect: ScreenshotGlobalDipRect
  timestampUnixMs: number
  droppedSourceFrames: number
  frameParts: AttachmentPart[]
}

function createCodedError(message: string, code: string): CodedError {
  const error = new Error(message) as CodedError
  error.code = code
  return error
}

function toCodedError(error: unknown, fallbackCode: string): CodedError {
  if (error instanceof Error) {
    const coded = error as CodedError
    if (!coded.code) coded.code = fallbackCode
    return coded
  }
  return createCodedError('Native screenshot operation failed', fallbackCode)
}

function protocolError(): CodedError {
  return createCodedError(
    'Native screenshot protocol response is invalid',
    'ERR_NATIVE_SCREENSHOT_PROTOCOL'
  )
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw protocolError()
  return value as Record<string, unknown>
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw protocolError()
  return value
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw protocolError()
  return value
}

function requireSafeInteger(value: unknown, allowZero = true): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw protocolError()
  }
  return value
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw protocolError()
  return value
}

function parseWithGeometry<T>(parse: () => T): T {
  try {
    return parse()
  } catch {
    throw protocolError()
  }
}

function parsePermission(value: unknown): PermissionStatus {
  if (
    value === 'granted' ||
    value === 'denied' ||
    value === 'restricted' ||
    value === 'unknown' ||
    value === 'unsupported'
  ) {
    return value
  }
  throw protocolError()
}

function parseAccessibility(value: unknown): AccessibilityStatus {
  if (value === 'timeout') return value
  return parsePermission(value)
}

function parseProbe(value: unknown): ProtocolProbe {
  const record = requireRecord(value)
  return {
    platform: requireString(record.platform),
    engine: requireString(record.engine),
    screenRecording: parsePermission(record.screenRecording),
    accessibility: parseAccessibility(record.accessibility),
    features: requireArray(record.features).map(requireString)
  }
}

function parseDisplay(value: unknown): ProtocolDisplay {
  const record = requireRecord(value)
  return {
    id: requireString(record.id),
    nativeId: requireString(record.nativeId),
    name: requireString(record.name),
    globalFrame: parseWithGeometry(() => parseScreenshotGlobalDipRect(record.globalFrame)),
    pixelSize: parseWithGeometry(() => parseScreenshotPixelSize(record.pixelSize)),
    scale: parseWithGeometry(() => parseScreenshotAxisScale(record.scale)),
    rotation: parseWithGeometry(() => parseScreenshotRotation(record.rotation)),
    isPrimary: requireBoolean(record.isPrimary)
  }
}

function parseContentSnapshot(value: unknown): ProtocolContentSnapshot {
  const record = requireRecord(value)
  if (record.coordinateSpace !== 'global-dip-v1') throw protocolError()
  return {
    generation: requireString(record.generation),
    coordinateSpace: record.coordinateSpace,
    capturedAtUnixMs: requireSafeInteger(record.capturedAtUnixMs),
    displays: requireArray(record.displays).map(parseDisplay),
    windows: requireArray(record.windows),
    accessibility: parseAccessibility(record.accessibility)
  }
}

function parseHitTest(value: unknown): ProtocolHitTestResult {
  const record = requireRecord(value)
  return {
    generation: requireString(record.generation),
    point: parseWithGeometry(() => parseScreenshotGlobalDipPoint(record.point)),
    candidates: requireArray(record.candidates),
    ...(record.accessibilityFallback === undefined
      ? {}
      : { accessibilityFallback: requireString(record.accessibilityFallback) })
  }
}

function parseAttachmentPart(value: unknown): AttachmentPart {
  const record = requireRecord(value)
  return {
    attachmentId: requireString(record.attachmentId),
    offset: requireSafeInteger(record.offset),
    byteLength: requireSafeInteger(record.byteLength, false)
  }
}

function parseCaptureOutput(value: unknown): ProtocolCaptureOutput {
  const record = requireRecord(value)
  if (
    record.targetKind !== 'display' &&
    record.targetKind !== 'window' &&
    record.targetKind !== 'region' &&
    record.targetKind !== 'ui-element'
  ) {
    throw protocolError()
  }
  if (record.mimeType !== 'image/png') throw protocolError()
  return {
    generation: requireString(record.generation),
    targetKind: record.targetKind,
    mimeType: record.mimeType,
    width: requireSafeInteger(record.width, false),
    height: requireSafeInteger(record.height, false),
    outputScale: parseWithGeometry(() => parseScreenshotAxisScale(record.outputScale)),
    globalRect: parseWithGeometry(() => parseScreenshotGlobalDipRect(record.globalRect)),
    byteLength: requireSafeInteger(record.byteLength, false),
    imageParts: requireArray(record.imageParts).map(parseAttachmentPart)
  }
}

function findCapability(snapshot: NativeTransportSnapshot): NativeCapabilityDescriptor | null {
  return snapshot.capabilities.find((capability) => capability.id === SCREENSHOT_CAPABILITY) ?? null
}

function unavailableReason(snapshot: NativeTransportSnapshot): string {
  if (snapshot.conflicts.includes(SCREENSHOT_CAPABILITY)) return 'capability-conflict'
  for (const carrier of snapshot.carriers) {
    const descriptor = carrier.snapshot?.capabilities.find(
      (item) => item.id === SCREENSHOT_CAPABILITY
    )
    if (descriptor?.reason) return descriptor.reason
  }
  return 'capability-unavailable'
}

function containsPoint(rect: ScreenshotGlobalDipRect, point: ScreenshotGlobalDipPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

function intersects(left: ScreenshotGlobalDipRect, right: ScreenshotGlobalDipRect): boolean {
  return (
    Math.max(left.x, right.x) < Math.min(left.x + left.width, right.x + right.width) &&
    Math.max(left.y, right.y) < Math.min(left.y + left.height, right.y + right.height)
  )
}

function publicDisplayId(display: ProtocolDisplay): string {
  const digest = createHash('sha256').update(display.nativeId).digest('hex').slice(0, 24)
  return `display:public:${digest}`
}

function toPublicDisplay(display: ProtocolDisplay): NativeScreenshotDisplay {
  return {
    id: publicDisplayId(display),
    name: display.name,
    friendlyName: display.name,
    x: display.globalFrame.x,
    y: display.globalFrame.y,
    width: display.globalFrame.width,
    height: display.globalFrame.height,
    scaleFactor: Math.max(display.scale.x, display.scale.y),
    rotation: display.rotation,
    isPrimary: display.isPrimary
  }
}

function assembleImage(
  output: ProtocolCaptureOutput,
  result: Pick<NativeResult<unknown>, 'attachments' | 'attachmentDescriptors'>
): Buffer {
  if (
    output.imageParts.length === 0 ||
    result.attachments.length !== result.attachmentDescriptors.length ||
    result.attachments.length !== output.imageParts.length
  ) {
    throw protocolError()
  }

  const attachments = new Map<string, Buffer>()
  for (const [position, descriptor] of result.attachmentDescriptors.entries()) {
    const buffer = result.attachments[position]
    if (
      descriptor.index !== position ||
      descriptor.byteLength !== buffer.length ||
      descriptor.mediaType !== 'image/png' ||
      descriptor.purpose !== 'screenshot-image' ||
      attachments.has(descriptor.id)
    ) {
      throw protocolError()
    }
    attachments.set(descriptor.id, buffer)
  }

  let expectedOffset = 0
  const chunks: Buffer[] = []
  for (const part of output.imageParts) {
    const chunk = attachments.get(part.attachmentId)
    if (!chunk || part.offset !== expectedOffset || part.byteLength !== chunk.length) {
      throw protocolError()
    }
    chunks.push(chunk)
    expectedOffset += chunk.length
  }
  if (expectedOffset !== output.byteLength) throw protocolError()
  return Buffer.concat(chunks, output.byteLength)
}

export class NativeScreenshotService {
  private readonly transport: NativeTransport
  private support: NativeScreenshotSupport = {
    supported: false,
    platform: process.platform,
    reason: 'protocol-not-initialized'
  }
  private descriptor: NativeCapabilityDescriptor | null = null
  private probe: ProtocolProbe | null = null
  private content: ProtocolContentSnapshot | null = null
  private tempNamespaceRegistered = false

  constructor(transport: NativeTransport) {
    this.transport = transport
  }

  async initialize(snapshot: NativeTransportSnapshot): Promise<void> {
    this.descriptor = findCapability(snapshot)
    if (!this.descriptor || snapshot.conflicts.includes(SCREENSHOT_CAPABILITY)) {
      this.support = {
        supported: false,
        platform: process.platform,
        engine: this.descriptor?.engine,
        reason: unavailableReason(snapshot)
      }
      return
    }

    try {
      const probeResult = await this.transport.invoke<Record<string, never>, unknown>(
        SCREENSHOT_CAPABILITY,
        'probe',
        {}
      )
      this.probe = parseProbe(probeResult.value)
      this.support = {
        supported: true,
        platform: this.probe.platform,
        engine: this.probe.engine,
        ...(this.probe.screenRecording === 'granted'
          ? {}
          : { reason: `screen-recording-${this.probe.screenRecording}` })
      }
      await this.refresh()
    } catch (error) {
      const coded = toCodedError(error, 'ERR_NATIVE_SCREENSHOT_INITIALIZATION_FAILED')
      this.content = null
      this.support = {
        supported: false,
        platform: process.platform,
        engine: this.descriptor.engine,
        reason: coded.code ?? 'ERR_NATIVE_SCREENSHOT_INITIALIZATION_FAILED'
      }
      screenshotLog.warn('Native screenshot protocol initialization failed', {
        meta: { platform: process.platform, errorCode: coded.code ?? null }
      })
    }
  }

  getSupport(): NativeScreenshotSupport {
    return { ...this.support }
  }

  getFeatures(): string[] {
    return [...new Set([...(this.descriptor?.features ?? []), ...(this.probe?.features ?? [])])]
  }

  listDisplays(): NativeScreenshotDisplay[] {
    return this.content?.displays.map(toPublicDisplay) ?? []
  }

  async refresh(): Promise<ProtocolContentSnapshot> {
    this.ensureAvailable()
    const result = await this.transport.invoke<
      {
        includeWindowTitles: boolean
        self: { processIds: number[]; bundleIds: string[]; nativeWindowIds: string[] }
      },
      unknown
    >(SCREENSHOT_CAPABILITY, 'refresh', {
      includeWindowTitles: false,
      self: collectScreenshotSelfContext()
    })
    this.content = parseContentSnapshot(result.value)
    return this.content
  }

  async hitTest(
    point: ScreenshotGlobalDipPoint,
    options: {
      granularity?: 'window' | 'ui-element'
      includePanels?: boolean
      maxCandidates?: number
    } = {}
  ): Promise<ProtocolHitTestResult> {
    const content = this.content ?? (await this.refresh())
    return await this.hitTestGeneration(content, point, options)
  }

  async hitTestCandidate(
    point: ScreenshotGlobalDipPoint,
    granularity: 'window' | 'ui-element'
  ): Promise<ScreenshotNativeSelectionCandidate | null> {
    const result = await this.hitTest(point, {
      granularity,
      includePanels: false,
      maxCandidates: 1
    })
    const candidate = result.candidates[0]
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
    const record = candidate as Record<string, unknown>
    const windowRecord = requireRecord(record.window)
    if (windowRecord.capturable !== true) return null
    const windowId = requireString(windowRecord.id)
    const windowBounds = parseWithGeometry(() =>
      parseScreenshotGlobalDipRect(windowRecord.globalFrame)
    )
    if (granularity === 'ui-element' && record.element !== undefined) {
      const elementRecord = requireRecord(record.element)
      return {
        kind: 'ui-element',
        bounds: parseWithGeometry(() => parseScreenshotGlobalDipRect(elementRecord.globalFrame)),
        generation: result.generation,
        targetId: requireString(elementRecord.id)
      }
    }
    return {
      kind: 'window',
      bounds: windowBounds,
      generation: result.generation,
      targetId: windowId
    }
  }

  async captureCandidate(
    candidate: ScreenshotNativeSelectionCandidate
  ): Promise<NativeScreenshotCaptureResult> {
    this.ensureAvailable()
    const content = this.content
    if (!content || content.generation !== candidate.generation) {
      throw createCodedError(
        'Screenshot selection generation is stale',
        'NATIVE_SCREENSHOT_STALE_GENERATION'
      )
    }
    const target: ProtocolCaptureTarget =
      candidate.kind === 'ui-element'
        ? {
            kind: 'ui-element',
            generation: candidate.generation,
            elementId: candidate.targetId
          }
        : {
            kind: 'window',
            generation: candidate.generation,
            windowId: candidate.targetId
          }
    const nativeResult = await this.transport.invoke<
      {
        target: ProtocolCaptureTarget
        cursor: 'hidden'
        output: { format: 'png'; scale: 'native-max' }
      },
      unknown
    >(SCREENSHOT_CAPABILITY, 'capture', {
      target,
      cursor: 'hidden',
      output: { format: 'png', scale: 'native-max' }
    })
    const output = parseCaptureOutput(nativeResult.value)
    if (output.generation !== candidate.generation) throw protocolError()
    return await this.storeCapture(
      output,
      nativeResult.meta.durationMs,
      assembleImage(output, nativeResult),
      this.displayForRect(content, output.globalRect),
      false
    )
  }

  async composeFrozenRegion(
    sources: ScreenshotFrozenSource[],
    region: ScreenshotGlobalDipRect,
    effects: ScreenshotComposeEffects = {}
  ): Promise<NativeScreenshotCaptureResult> {
    const startedAt = performance.now()
    try {
      this.ensureAvailable()
      if (!this.getFeatures().includes('frozen-compose')) {
        throw createCodedError(
          'Frozen screenshot composition is unavailable',
          'ERR_NATIVE_SCREENSHOT_COMPOSE_UNAVAILABLE'
        )
      }
      const content = this.content
      if (!content) {
        throw createCodedError(
          'Screenshot content snapshot is unavailable',
          'ERR_NATIVE_SCREENSHOT_UNAVAILABLE'
        )
      }
      const rect = parseWithGeometry(() => parseScreenshotGlobalDipRect(region))
      const relevantSources = sources.filter(({ display }) =>
        intersects(
          { x: display.x, y: display.y, width: display.width, height: display.height },
          rect
        )
      )
      if (relevantSources.length === 0 || relevantSources.length > 32) {
        throw createCodedError(
          'Frozen screenshot sources do not cover the selection',
          'ERR_NATIVE_SCREENSHOT_INVALID_REGION'
        )
      }

      const attachments: Array<{
        id: string
        data: Buffer
        mediaType: string
        purpose: string
      }> = []
      const composeSources: Array<{
        globalRect: ScreenshotGlobalDipRect
        imageParts: AttachmentPart[]
      }> = []
      let packetBytes = 0
      for (const [sourceIndex, source] of relevantSources.entries()) {
        if (
          source.resource.mimeType !== 'image/png' ||
          source.resource.displayId !== source.display.id ||
          source.resource.width <= 0 ||
          source.resource.height <= 0
        ) {
          throw createCodedError(
            'Frozen screenshot source is invalid',
            'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
          )
        }
        const bytes = await this.readCaptureResource(source.resource.tfileUrl)
        packetBytes += bytes.length
        if (packetBytes > MAX_COMPOSE_PACKET_BYTES) {
          throw createCodedError(
            'Frozen screenshot sources exceed the attachment budget',
            'ERR_NATIVE_SCREENSHOT_OUTPUT_TOO_LARGE'
          )
        }
        const imageParts: AttachmentPart[] = []
        for (let offset = 0, partIndex = 0; offset < bytes.length; partIndex += 1) {
          const end = Math.min(bytes.length, offset + MAX_COMPOSE_ATTACHMENT_BYTES)
          const id = `source:${sourceIndex}:${partIndex}`
          const data = bytes.subarray(offset, end)
          imageParts.push({ attachmentId: id, offset, byteLength: data.length })
          attachments.push({
            id,
            data,
            mediaType: 'image/png',
            purpose: 'frozen-display'
          })
          offset = end
        }
        composeSources.push({
          globalRect: {
            x: source.display.x,
            y: source.display.y,
            width: source.display.width,
            height: source.display.height
          },
          imageParts
        })
      }

      const nativeResult = await this.transport.invoke<
        {
          generation: string
          rect: ScreenshotGlobalDipRect
          sources: typeof composeSources
          effects: { border: boolean; shadow: boolean; cornerRadius: number }
        },
        unknown
      >(
        SCREENSHOT_CAPABILITY,
        'compose',
        {
          generation: content.generation,
          rect,
          sources: composeSources,
          effects: {
            border: effects.border === true,
            shadow: effects.shadow === true,
            cornerRadius:
              Number.isFinite(effects.cornerRadius) && (effects.cornerRadius ?? 0) > 0
                ? Math.min(128, effects.cornerRadius!)
                : 0
          }
        },
        { attachments }
      )
      const output = parseCaptureOutput(nativeResult.value)
      if (output.generation !== content.generation || output.targetKind !== 'region') {
        throw protocolError()
      }
      const imageBuffer = assembleImage(output, nativeResult)
      const stored = await this.storeCapture(
        output,
        nativeResult.meta.durationMs,
        imageBuffer,
        this.displayForRect(content, rect),
        false
      )
      screenshotLog.info('Native screenshot composition completed', {
        meta: {
          platform: process.platform,
          width: stored.width,
          height: stored.height,
          durationMs: Math.round(performance.now() - startedAt)
        }
      })
      return stored
    } catch (error) {
      const coded = toCodedError(error, 'ERR_NATIVE_SCREENSHOT_COMPOSE_FAILED')
      screenshotLog.warn('Native screenshot composition failed', {
        meta: {
          platform: process.platform,
          durationMs: Math.round(performance.now() - startedAt),
          errorCode: coded.code ?? null
        }
      })
      throw coded
    }
  }

  async capture(
    request: NativeScreenshotCaptureRequest = {}
  ): Promise<NativeScreenshotCaptureResult> {
    this.ensureAvailable()
    if (Object.prototype.hasOwnProperty.call(request, 'output')) {
      throw createCodedError(
        'Screenshot output selection is unavailable; captures always return a tfile resource',
        'ERR_NATIVE_SCREENSHOT_OUTPUT_UNSUPPORTED'
      )
    }

    const startedAt = performance.now()
    try {
      const content = await this.refresh()
      const resolved = await this.resolveTarget(request, content)
      const nativeResult = await this.transport.invoke<
        {
          target: ProtocolCaptureTarget
          cursor: 'hidden' | 'system'
          output: { format: 'png'; scale: 'native-max' }
        },
        unknown
      >(SCREENSHOT_CAPABILITY, 'capture', {
        target: resolved.target,
        cursor: request.cursor === 'system' ? 'system' : 'hidden',
        output: { format: 'png', scale: 'native-max' }
      })
      const output = parseCaptureOutput(nativeResult.value)
      if (output.generation !== content.generation) throw protocolError()
      const imageBuffer = assembleImage(output, nativeResult)
      const wroteClipboard =
        request.writeClipboard === true ? this.writeClipboardImage(imageBuffer) : false
      const result = await this.storeCapture(
        output,
        nativeResult.meta.durationMs,
        imageBuffer,
        resolved.display,
        wroteClipboard
      )

      screenshotLog.info('Native screenshot captured', {
        meta: {
          platform: process.platform,
          width: result.width,
          height: result.height,
          durationMs: Math.round(performance.now() - startedAt),
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

  async openFrames(request: ScreenshotFramesRequest): Promise<NativeStream<ScreenshotFrameOutput>> {
    this.ensureAvailable()
    const content = this.content
    if (!content) {
      throw createCodedError(
        'Screenshot content snapshot is unavailable',
        'ERR_NATIVE_SCREENSHOT_UNAVAILABLE'
      )
    }
    if (request.target.generation !== content.generation) {
      throw createCodedError('Screenshot generation is stale', 'NATIVE_SCREENSHOT_STALE_GENERATION')
    }
    return this.transport.openStream(
      SCREENSHOT_CAPABILITY,
      'frames',
      {
        target: request.target,
        cursor: request.cursor ?? 'hidden',
        framesPerSecond: request.framesPerSecond ?? 15,
        pixelFormat: 'bgra8-premultiplied',
        maxFrameBytes: request.maxFrameBytes ?? DEFAULT_FRAME_BYTES
      },
      {
        initialWindow: request.initialWindow,
        signal: request.signal
      }
    )
  }

  private async hitTestGeneration(
    content: ProtocolContentSnapshot,
    point: ScreenshotGlobalDipPoint,
    options: {
      granularity?: 'window' | 'ui-element'
      includePanels?: boolean
      maxCandidates?: number
    }
  ): Promise<ProtocolHitTestResult> {
    const parsedPoint = parseWithGeometry(() => parseScreenshotGlobalDipPoint(point))
    const result = await this.transport.invoke(SCREENSHOT_CAPABILITY, 'hit_test', {
      generation: content.generation,
      point: parsedPoint,
      granularity: options.granularity ?? 'window',
      includePanels: options.includePanels ?? false,
      maxCandidates: options.maxCandidates ?? 16
    })
    const hit = parseHitTest(result.value)
    if (hit.generation !== content.generation) throw protocolError()
    return hit
  }

  private async resolveTarget(
    request: NativeScreenshotCaptureRequest,
    content: ProtocolContentSnapshot
  ): Promise<{ target: ProtocolCaptureTarget; display: ProtocolDisplay | null }> {
    const target = request.target ?? 'cursor-display'
    if (target === 'region') {
      if (!request.region) {
        throw createCodedError('Capture region is required', 'ERR_NATIVE_SCREENSHOT_INVALID_REGION')
      }
      const rect = parseWithGeometry(() => parseScreenshotGlobalDipRect(request.region))
      return {
        target: { kind: 'region', generation: content.generation, rect },
        display: this.displayForRect(content, rect)
      }
    }

    if (target === 'display') {
      const display = request.displayId
        ? content.displays.find(
            (item) =>
              publicDisplayId(item) === request.displayId ||
              item.id === request.displayId ||
              item.nativeId === request.displayId
          )
        : content.displays.find((item) => item.isPrimary)
      if (!display) {
        throw createCodedError(
          'Screenshot display is unavailable',
          'ERR_NATIVE_SCREENSHOT_DISPLAY_NOT_FOUND'
        )
      }
      return {
        target: {
          kind: 'display',
          generation: content.generation,
          displayId: display.id
        },
        display
      }
    }

    const point = parseWithGeometry(() =>
      parseScreenshotGlobalDipPoint(request.cursorPoint ?? screen.getCursorScreenPoint())
    )
    await this.hitTestGeneration(content, point, {
      granularity: 'window',
      includePanels: false,
      maxCandidates: 1
    })
    const display = content.displays.find((item) => containsPoint(item.globalFrame, point))
    if (!display) {
      throw createCodedError(
        'Cursor is outside the captured display topology',
        'ERR_NATIVE_SCREENSHOT_DISPLAY_NOT_FOUND'
      )
    }
    return {
      target: {
        kind: 'display',
        generation: content.generation,
        displayId: display.id
      },
      display
    }
  }

  private displayForRect(
    content: ProtocolContentSnapshot,
    rect: ScreenshotGlobalDipRect
  ): ProtocolDisplay | null {
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    return (
      content.displays.find((display) => containsPoint(display.globalFrame, center)) ??
      content.displays.find((display) => intersects(display.globalFrame, rect)) ??
      null
    )
  }

  private async storeCapture(
    output: ProtocolCaptureOutput,
    durationMs: number,
    imageBuffer: Buffer,
    display: ProtocolDisplay | null,
    wroteClipboard: boolean
  ): Promise<NativeScreenshotCaptureResult> {
    this.ensureTempNamespace()
    const stored = await tempFileService.createFile({
      namespace: SCREENSHOT_NAMESPACE,
      ext: 'png',
      buffer: imageBuffer,
      prefix: 'screenshot'
    })
    return {
      tfileUrl: toTfileUrl(stored.path),
      mimeType: output.mimeType,
      width: output.width,
      height: output.height,
      displayId: display ? publicDisplayId(display) : '',
      displayName: display?.name ?? '',
      x: output.globalRect.x,
      y: output.globalRect.y,
      scaleFactor: Math.max(output.outputScale.x, output.outputScale.y),
      durationMs,
      sizeBytes: stored.sizeBytes,
      wroteClipboard
    }
  }

  async readCaptureResource(tfileUrl: string): Promise<Buffer> {
    return await fs.readFile(await this.resolveCaptureResourcePath(tfileUrl))
  }

  async writeCaptureResourceToClipboard(tfileUrl: string): Promise<boolean> {
    return this.writeClipboardImage(await this.readCaptureResource(tfileUrl))
  }

  async copyCaptureResource(tfileUrl: string, destinationPath: string): Promise<void> {
    await fs.copyFile(await this.resolveCaptureResourcePath(tfileUrl), destinationPath)
  }

  private async resolveCaptureResourcePath(tfileUrl: string): Promise<string> {
    if (typeof tfileUrl !== 'string' || !tfileUrl.startsWith('tfile://')) {
      throw createCodedError(
        'Screenshot resource is invalid',
        'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
      )
    }
    const sourcePath = resolveLocalFilePath(tfileUrl)
    if (!sourcePath || !tempFileService.isWithinBaseDir(sourcePath)) {
      throw createCodedError(
        'Screenshot resource is outside managed storage',
        'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
      )
    }
    const namespaceDir = tempFileService.resolveNamespaceDir(SCREENSHOT_NAMESPACE)
    let canonicalSource: string
    let canonicalNamespace: string
    let canonicalBase: string
    try {
      const canonicalPaths = await Promise.all([
        fs.realpath(sourcePath),
        fs.realpath(namespaceDir),
        fs.realpath(tempFileService.getBaseDir())
      ])
      canonicalSource = canonicalPaths[0]
      canonicalNamespace = canonicalPaths[1]
      canonicalBase = canonicalPaths[2]
    } catch {
      throw createCodedError(
        'Screenshot resource is unavailable',
        'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
      )
    }
    const namespaceFromBase = path.relative(canonicalBase, canonicalNamespace)
    if (
      !namespaceFromBase ||
      namespaceFromBase === '..' ||
      namespaceFromBase.startsWith(`..${path.sep}`) ||
      path.isAbsolute(namespaceFromBase)
    ) {
      throw createCodedError(
        'Screenshot namespace is outside managed storage',
        'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
      )
    }
    const relativePath = path.relative(canonicalNamespace, canonicalSource)
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw createCodedError(
        'Screenshot resource is outside its namespace',
        'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
      )
    }
    return canonicalSource
  }

  private writeClipboardImage(imageBuffer: Buffer): boolean {
    const image = nativeImage.createFromBuffer(imageBuffer)
    if (image.isEmpty()) return false
    clipboard.writeImage(image)
    return true
  }

  async releaseTempArtifact(tfileUrl: string): Promise<boolean> {
    this.ensureTempNamespace()
    const artifactPath = await this.resolveCaptureResourcePath(tfileUrl)
    return await tempFileService.deleteFileFromNamespaces(artifactPath, [SCREENSHOT_NAMESPACE])
  }

  private ensureTempNamespace(): void {
    if (this.tempNamespaceRegistered) return
    if (!tempFileService.getNamespaceConfig(SCREENSHOT_NAMESPACE)) {
      tempFileService.registerNamespace({
        namespace: SCREENSHOT_NAMESPACE,
        retentionMs: SCREENSHOT_RETENTION_MS,
        automaticCleanup: false
      })
    }
    tempFileService.startCleanup()
    this.tempNamespaceRegistered = true
  }

  private ensureAvailable(): void {
    if (this.descriptor && this.support.supported) return
    throw createCodedError(
      'Native screenshot capability is unavailable',
      'ERR_NATIVE_SCREENSHOT_UNAVAILABLE'
    )
  }
}

const services = new WeakMap<NativeTransport, NativeScreenshotService>()
let activeService: NativeScreenshotService | null = null

export function getNativeScreenshotService(): NativeScreenshotService
export function getNativeScreenshotService(transport: NativeTransport): NativeScreenshotService
export function getNativeScreenshotService(transport?: NativeTransport): NativeScreenshotService {
  if (!transport) {
    if (activeService) return activeService
    throw createCodedError(
      'Native screenshot service is not initialized',
      'ERR_NATIVE_SCREENSHOT_UNAVAILABLE'
    )
  }
  const current = services.get(transport)
  if (current) {
    activeService = current
    return current
  }
  const created = new NativeScreenshotService(transport)
  services.set(transport, created)
  activeService = created
  return created
}
