import { constants, type Stats } from 'node:fs'
import fsp, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { types as utilTypes } from 'node:util'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import { hasControlCharacter } from './plugin-host-text-validation'

export type PluginImageToolsFormat = 'png' | 'webp' | 'jpeg' | 'ico'
export interface PluginImageToolsSaveRequest {
  readonly token: string
  readonly format: PluginImageToolsFormat
  readonly width?: number
  readonly height?: number
  readonly quality?: number
}
export type PluginImageToolsReason =
  | 'token-invalid'
  | 'token-expired'
  | 'source-invalid'
  | 'source-replaced'
  | 'source-too-large'
  | 'source-unsupported'
  | 'output-too-large'
  | 'source-animated'
  | 'dialog-failed'
  | 'render-failed'
  | 'write-failed'
export type PluginImageToolsSaveResult =
  | {
      readonly status: 'saved'
      readonly name: string
      readonly format: PluginImageToolsFormat
      readonly width: number
      readonly height: number
      readonly bytes: number
    }
  | { readonly status: 'cancelled' }
  | { readonly status: 'blocked' | 'failed'; readonly reason: PluginImageToolsReason }
export interface PluginImageToolsFilesystem {
  lstat(filePath: string): Promise<Stats>
  realpath(filePath: string): Promise<string>
  open(filePath: string, flags: number, mode?: number): Promise<FileHandle>
  rename(oldPath: string, newPath: string): Promise<void>
  unlink(filePath: string): Promise<void>
}
export interface PluginImageToolsNativeSaveDialog {
  save(
    request: Readonly<{ defaultName: string; format: PluginImageToolsFormat }>,
    signal: AbortSignal
  ): Promise<Readonly<{ cancelled: boolean; filePath?: string }>>
}
export interface PluginImageToolsImageMetadata {
  readonly format: string
  readonly width: number
  readonly height: number
  readonly pages?: number
  readonly animated?: boolean
}
export interface PluginImageToolsRenderRequest {
  readonly format: PluginImageToolsFormat
  readonly width?: number
  readonly height?: number
  readonly quality?: number
  readonly source: PluginImageToolsImageMetadata
}
export interface PluginImageToolsRenderedImage {
  readonly data: Buffer
  readonly width: number
  readonly height: number
}
export interface PluginImageToolsRenderer {
  inspect(source: Buffer, signal: AbortSignal): Promise<PluginImageToolsImageMetadata>
  render(
    source: Buffer,
    request: PluginImageToolsRenderRequest,
    signal: AbortSignal
  ): Promise<PluginImageToolsRenderedImage>
}
export interface PluginImageToolsCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeRead(pluginName: string): boolean
  authorizeWrite(pluginName: string): boolean
  watchReadPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchWritePermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly filesystem?: Partial<PluginImageToolsFilesystem>
  readonly nativeSaveDialog: PluginImageToolsNativeSaveDialog
  readonly imageRenderer: PluginImageToolsRenderer
  readonly now?: () => number
}
export interface PluginImageToolsCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  prepareLifecycleQuery(query: unknown, signal?: AbortSignal): Promise<unknown>
  close(): Promise<void>
}
type Source =
  | { readonly kind: 'data'; readonly data: Buffer; readonly name: string }
  | {
      readonly kind: 'path'
      readonly path: string
      readonly canonical: string
      readonly dev: string
      readonly ino: string
      readonly size: number
      readonly mtimeMs: number
      readonly name: string
    }
const MAX_BYTES = 32 * 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const MAX_PIXELS = 64_000_000
const MAX_EDGE = 8192
const TTL = 5 * 60_000
const TOKEN = /^img_[A-Za-z0-9_-]{32}$/
const FORMATS = new Set<PluginImageToolsFormat>(['png', 'webp', 'jpeg', 'ico'])
const REASONS = new Set<PluginImageToolsReason>([
  'token-invalid',
  'token-expired',
  'source-invalid',
  'source-replaced',
  'output-too-large',
  'source-too-large',
  'source-unsupported',
  'source-animated',
  'dialog-failed',
  'render-failed',
  'write-failed'
])
const fsDefault: PluginImageToolsFilesystem = Object.freeze({
  lstat: (filePath: string) => fsp.lstat(filePath),
  realpath: (filePath: string) => fsp.realpath(filePath),
  open: (filePath: string, flags: number, mode?: number) => fsp.open(filePath, flags, mode),
  rename: (oldPath: string, newPath: string) => fsp.rename(oldPath, newPath),
  unlink: (filePath: string) => fsp.unlink(filePath)
})
function bad(): never {
  throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
}
function cancelled(): PluginImageToolsSaveResult {
  return Object.freeze({ status: 'cancelled' as const })
}
function signal(s: AbortSignal): void {
  if (s.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
}
function obj(
  v: unknown,
  keys: readonly string[],
  required: readonly string[] = []
): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || utilTypes.isProxy(v)) bad()
  let d: PropertyDescriptorMap
  try {
    if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) bad()
    d = Object.getOwnPropertyDescriptors(v)
  } catch {
    bad()
  }
  const out: Record<string, unknown> = Object.create(null),
    allowed = new Set(keys)
  for (const k of Reflect.ownKeys(d)) {
    if (typeof k !== 'string' || !allowed.has(k) || !d[k]?.enumerable || !('value' in d[k]!)) bad()
    out[k] = d[k]!.value
  }
  for (const k of required) if (!Object.hasOwn(out, k)) bad()
  return out
}
function plain(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || utilTypes.isProxy(v)) bad()
  let d: PropertyDescriptorMap
  try {
    if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) bad()
    d = Object.getOwnPropertyDescriptors(v)
  } catch {
    bad()
  }
  const out: Record<string, unknown> = Object.create(null)
  for (const k of Reflect.ownKeys(d)) {
    if (typeof k !== 'string' || !d[k]?.enumerable || !('value' in d[k]!)) bad()
    out[k] = d[k]!.value
  }
  return out
}
function arr(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || utilTypes.isProxy(v)) bad()
  let d: PropertyDescriptorMap
  try {
    d = Object.getOwnPropertyDescriptors(v) as unknown as PropertyDescriptorMap
  } catch {
    bad()
  }
  const length = d.length && 'value' in d.length ? d.length.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > max) bad()
  const out: unknown[] = [],
    allowed = new Set<PropertyKey>(['length'])
  for (let i = 0; i < Number(length); i += 1) {
    const key = String(i),
      entry = d[key]
    allowed.add(key)
    if (!entry?.enumerable || !('value' in entry)) bad()
    out.push(entry.value)
  }
  if (Reflect.ownKeys(d).some((key) => !allowed.has(key))) bad()
  return out
}
function name(v: unknown, fallback: string): string {
  if (v === undefined) return fallback
  if (typeof v !== 'string' || Buffer.byteLength(v) > 4096) bad()
  const n = path.win32.basename(path.posix.basename(v.trim()))
  if (!n || n === '.' || n === '..' || Buffer.byteLength(n) > 255 || hasControlCharacter(n)) bad()
  return n
}
function dim(v: unknown): number | undefined {
  if (v === undefined) return undefined
  if (!Number.isSafeInteger(v) || Number(v) < 1 || Number(v) > MAX_EDGE) bad()
  return Number(v)
}
function request(v: unknown): PluginImageToolsSaveRequest {
  const r = obj(v, ['token', 'format', 'width', 'height', 'quality'], ['token', 'format'])
  if (
    typeof r.token !== 'string' ||
    !TOKEN.test(r.token) ||
    typeof r.format !== 'string' ||
    !FORMATS.has(r.format as PluginImageToolsFormat)
  )
    bad()
  const format = r.format as PluginImageToolsFormat
  const width = dim(r.width)
  const height = dim(r.height)
  if (
    (width === undefined) !== (height === undefined) ||
    (width !== undefined && height !== undefined && width * height > MAX_PIXELS) ||
    (format === 'ico' &&
      ((width !== undefined && width > 256) ||
        (height !== undefined && height > 256) ||
        (width !== undefined && height !== undefined && width !== height))) ||
    (r.quality !== undefined &&
      (format === 'png' ||
        format === 'ico' ||
        !Number.isSafeInteger(r.quality) ||
        Number(r.quality) < 1 ||
        Number(r.quality) > 100))
  )
    bad()
  return Object.freeze({
    token: r.token,
    format,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(r.quality === undefined ? {} : { quality: Number(r.quality) })
  })
}
function result(v: unknown): PluginImageToolsSaveResult {
  const r = obj(v, ['status', 'name', 'format', 'width', 'height', 'bytes', 'reason'], ['status'])
  if (r.status === 'cancelled' && Object.keys(r).length === 1) return cancelled()
  if (
    r.status === 'saved' &&
    Object.keys(r).length === 6 &&
    typeof r.name === 'string' &&
    name(r.name, '') === r.name &&
    typeof r.format === 'string' &&
    FORMATS.has(r.format as PluginImageToolsFormat) &&
    Number.isSafeInteger(r.width) &&
    Number(r.width) >= 1 &&
    Number(r.width) <= MAX_EDGE &&
    Number.isSafeInteger(r.height) &&
    Number(r.height) >= 1 &&
    Number(r.height) <= MAX_EDGE &&
    Number.isSafeInteger(r.bytes) &&
    Number(r.bytes) >= 1 &&
    Number(r.bytes) <= MAX_OUTPUT_BYTES
  )
    return Object.freeze({
      status: 'saved' as const,
      name: r.name,
      format: r.format as PluginImageToolsFormat,
      width: Number(r.width),
      height: Number(r.height),
      bytes: Number(r.bytes)
    })
  if (
    (r.status === 'blocked' || r.status === 'failed') &&
    Object.keys(r).length === 2 &&
    typeof r.reason === 'string' &&
    REASONS.has(r.reason as PluginImageToolsReason)
  )
    return Object.freeze({ status: r.status, reason: r.reason as PluginImageToolsReason })
  bad()
}
function active(v: unknown): PluginActivationIdentity {
  const r = obj(
    v,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  if (
    typeof r.name !== 'string' ||
    !r.name ||
    typeof r.pluginInstanceId !== 'string' ||
    !r.pluginInstanceId ||
    !Number.isSafeInteger(r.activationGeneration) ||
    Number(r.activationGeneration) < 1 ||
    typeof r.key !== 'string' ||
    !r.key
  )
    bad()
  return Object.freeze({
    name: r.name,
    pluginInstanceId: r.pluginInstanceId,
    activationGeneration: Number(r.activationGeneration),
    key: r.key
  })
}
function same(a: PluginActivationIdentity, b: PluginActivationIdentity): boolean {
  return (
    a.name === b.name &&
    a.pluginInstanceId === b.pluginInstanceId &&
    a.activationGeneration === b.activationGeneration &&
    a.key === b.key
  )
}
function code(e: unknown): unknown {
  return e && typeof e === 'object' && !utilTypes.isProxy(e)
    ? Object.getOwnPropertyDescriptor(e, 'code')?.value
    : undefined
}
function sourceReason(e: unknown): PluginImageToolsReason {
  switch (code(e)) {
    case 'source-replaced':
      return 'source-replaced'
    case 'too-large':
    case 'source-too-large':
    case 'PLUGIN_IMAGE_TOOLS_INPUT_TOO_LARGE':
    case 'PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS':
      return 'source-too-large'
    case 'PLUGIN_IMAGE_TOOLS_OUTPUT_TOO_LARGE':
      return 'output-too-large'
    case 'animated':
    case 'source-animated':
    case 'PLUGIN_IMAGE_TOOLS_ANIMATED_INPUT':
      return 'source-animated'
    case 'unsupported':
    case 'source-unsupported':
    case 'PLUGIN_IMAGE_TOOLS_UNSUPPORTED_FORMAT':
      return 'source-unsupported'
    default:
      return 'source-invalid'
  }
}
function inspect(v: unknown): PluginImageToolsImageMetadata {
  const r = obj(
    v,
    ['format', 'width', 'height', 'pages', 'animated'],
    ['format', 'width', 'height']
  )
  if (
    typeof r.format !== 'string' ||
    !Number.isSafeInteger(r.width) ||
    Number(r.width) < 1 ||
    Number(r.width) > MAX_EDGE ||
    !Number.isSafeInteger(r.height) ||
    Number(r.height) < 1 ||
    Number(r.height) > MAX_EDGE ||
    (r.pages !== undefined && (!Number.isSafeInteger(r.pages) || Number(r.pages) < 1)) ||
    (r.animated !== undefined && typeof r.animated !== 'boolean')
  )
    bad()
  const format = r.format.toLowerCase()
  if (format === 'svg' || format === 'pdf') throw Object.freeze({ code: 'unsupported' })
  if (r.animated || Number(r.pages ?? 1) > 1) throw Object.freeze({ code: 'animated' })
  if (Number(r.width) * Number(r.height) > MAX_PIXELS) throw Object.freeze({ code: 'too-large' })
  return Object.freeze({
    format,
    width: Number(r.width),
    height: Number(r.height),
    ...(r.pages === undefined ? {} : { pages: Number(r.pages) }),
    ...(r.animated === undefined ? {} : { animated: r.animated })
  })
}
function dataUrl(s: string): Buffer {
  const m =
    /^data:(image\/(?:avif|gif|heic|heif|jpeg|png|tiff|webp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(
      s
    )
  if (!m || m[2]!.length > Math.ceil(MAX_BYTES / 3) * 4 + 4) bad()
  const b = Buffer.from(m[2]!, 'base64')
  if (!b.byteLength || b.byteLength > MAX_BYTES) bad()
  return b
}

function nativeSaveResult(value: unknown): Readonly<{ cancelled: boolean; filePath?: string }> {
  const record = obj(value, ['cancelled', 'filePath'], ['cancelled'])
  if (record.cancelled === true && Object.keys(record).length === 1)
    return Object.freeze({ cancelled: true })
  if (
    record.cancelled !== false ||
    Object.keys(record).length !== 2 ||
    typeof record.filePath !== 'string' ||
    !path.isAbsolute(record.filePath) ||
    Buffer.byteLength(record.filePath) > 4096 ||
    record.filePath.includes('\0')
  )
    bad()
  return Object.freeze({ cancelled: false, filePath: record.filePath })
}
async function sourcePath(
  fs: PluginImageToolsFilesystem,
  p: string,
  s: AbortSignal
): Promise<Extract<Source, { kind: 'path' }>> {
  signal(s)
  let st: Stats, canonical: string
  try {
    st = await fs.lstat(p)
    canonical = await fs.realpath(p)
  } catch {
    throw Object.freeze({ code: 'source-invalid' })
  }
  if (st.isSymbolicLink() || !st.isFile() || !st.size || st.size > MAX_BYTES)
    throw Object.freeze({ code: st.size > MAX_BYTES ? 'too-large' : 'source-invalid' })
  return Object.freeze({
    kind: 'path',
    path: p,
    canonical,
    dev: String(st.dev),
    ino: String(st.ino),
    size: st.size,
    mtimeMs: st.mtimeMs,
    name: name(path.basename(canonical), 'image')
  })
}
async function bytes(
  fs: PluginImageToolsFilesystem,
  source: Source,
  s: AbortSignal
): Promise<Buffer> {
  if (source.kind === 'data') {
    signal(s)
    return source.data
  }
  signal(s)
  let st: Stats, canonical: string
  try {
    st = await fs.lstat(source.path)
    canonical = await fs.realpath(source.path)
  } catch {
    throw Object.freeze({ code: 'source-replaced' })
  }
  if (
    st.isSymbolicLink() ||
    !st.isFile() ||
    !st.size ||
    st.size > MAX_BYTES ||
    path.normalize(canonical) !== path.normalize(source.canonical) ||
    String(st.dev) !== source.dev ||
    String(st.ino) !== source.ino ||
    st.size !== source.size ||
    st.mtimeMs !== source.mtimeMs
  )
    throw Object.freeze({ code: st.size > MAX_BYTES ? 'too-large' : 'source-replaced' })
  let h: FileHandle | undefined
  try {
    h = await fs.open(
      source.path,
      constants.O_RDONLY | (typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0)
    )
    const opened = await h.stat()
    if (
      !opened.isFile() ||
      String(opened.dev) !== source.dev ||
      String(opened.ino) !== source.ino ||
      opened.size !== source.size ||
      opened.mtimeMs !== source.mtimeMs
    )
      throw Object.freeze({ code: 'source-replaced' })
    const b = Buffer.allocUnsafe(source.size)
    let offset = 0
    while (offset < b.byteLength) {
      signal(s)
      const { bytesRead } = await h.read(
        b,
        offset,
        Math.min(1024 * 1024, b.byteLength - offset),
        offset
      )
      if (bytesRead < 1) break
      offset += bytesRead
    }
    const after = await h.stat()
    if (
      offset !== b.byteLength ||
      String(after.dev) !== source.dev ||
      String(after.ino) !== source.ino ||
      after.size !== source.size ||
      after.mtimeMs !== source.mtimeMs
    )
      throw Object.freeze({ code: 'source-replaced' })
    signal(s)
    return b
  } finally {
    await h?.close().catch(() => undefined)
  }
}
function output(v: unknown, r: PluginImageToolsSaveRequest): PluginImageToolsRenderedImage {
  const x = obj(v, ['data', 'width', 'height'], ['data', 'width', 'height'])
  if (
    !Buffer.isBuffer(x.data) ||
    !x.data.byteLength ||
    x.data.byteLength > MAX_OUTPUT_BYTES ||
    !Number.isSafeInteger(x.width) ||
    Number(x.width) < 1 ||
    Number(x.width) > MAX_EDGE ||
    !Number.isSafeInteger(x.height) ||
    Number(x.height) < 1 ||
    Number(x.height) > MAX_EDGE ||
    Number(x.width) * Number(x.height) > MAX_PIXELS ||
    (r.width !== undefined && Number(x.width) !== r.width) ||
    (r.height !== undefined && Number(x.height) !== r.height)
  )
    bad()
  return Object.freeze({ data: x.data, width: Number(x.width), height: Number(x.height) })
}

export function createPluginImageToolsCapabilities(
  raw: PluginImageToolsCapabilityOptions
): PluginImageToolsCapabilities {
  const o = obj(raw, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeWrite',
    'watchReadPermissionRevoked',
    'watchWritePermissionRevoked',
    'filesystem',
    'nativeSaveDialog',
    'imageRenderer',
    'now'
  ]) as unknown as PluginImageToolsCapabilityOptions
  for (const k of [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeWrite',
    'watchReadPermissionRevoked',
    'watchWritePermissionRevoked'
  ] as const)
    if (typeof o[k] !== 'function' || utilTypes.isProxy(o[k])) bad()
  const expected = active(o.activation)
  if (expected.name !== 'touch-image') bad()
  const fs = Object.freeze({ ...fsDefault, ...(o.filesystem ?? {}) })
  for (const k of ['lstat', 'realpath', 'open', 'rename', 'unlink'] as const)
    if (typeof fs[k] !== 'function' || utilTypes.isProxy(fs[k])) bad()
  if (
    !o.nativeSaveDialog ||
    typeof o.nativeSaveDialog !== 'object' ||
    utilTypes.isProxy(o.nativeSaveDialog) ||
    typeof Object.getOwnPropertyDescriptor(o.nativeSaveDialog, 'save')?.value !== 'function' ||
    !o.imageRenderer ||
    typeof o.imageRenderer !== 'object' ||
    utilTypes.isProxy(o.imageRenderer) ||
    typeof Object.getOwnPropertyDescriptor(o.imageRenderer, 'inspect')?.value !== 'function' ||
    typeof Object.getOwnPropertyDescriptor(o.imageRenderer, 'render')?.value !== 'function'
  )
    bad()
  const now = o.now ?? Date.now
  if (typeof now !== 'function' || utilTypes.isProxy(now)) bad()
  let current: { token: string; source: Source; expires: number } | null = null
  let expiryTimer: NodeJS.Timeout | undefined
  let closed = false
  let available = true
  let closing: Promise<void> | null = null
  const controllers = new Set<AbortController>()
  const work = new Set<Promise<void>>()
  const disposers: Array<() => void> = []
  const clearCurrent = (): void => {
    current = null
    clearTimeout(expiryTimer)
    expiryTimer = undefined
  }
  const abort = (): void => {
    clearCurrent()
    for (const c of controllers) c.abort()
  }
  for (const watch of [o.watchReadPermissionRevoked, o.watchWritePermissionRevoked])
    try {
      const dispose = watch.call(raw, expected.name, abort)
      if (typeof dispose !== 'function' || utilTypes.isProxy(dispose)) bad()
      disposers.push(dispose)
    } catch {
      available = false
    }
  const auth = (write: boolean): void => {
    if (!available)
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    let ok: unknown
    try {
      ok = (write ? o.authorizeWrite : o.authorizeRead).call(raw, expected.name)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (typeof ok !== 'boolean')
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    if (!ok) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
  }
  const currentActivation = (): void => {
    const a = o.resolveCurrentActivation.call(raw, expected.name)
    if (!a || !same(active(a), expected))
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
  }
  const prepareLifecycleQuery = async (query: unknown, outer?: AbortSignal): Promise<unknown> => {
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    currentActivation()
    clearCurrent()
    if (query === undefined) return undefined

    const queryRecord = plain(query)
    const text = typeof queryRecord.text === 'string' ? queryRecord.text.slice(0, 256) : ''
    const sanitized = (reason?: string): Readonly<Record<string, unknown>> =>
      Object.freeze({
        text,
        inputs: Object.freeze(
          reason
            ? [
                Object.freeze({
                  type: 'image',
                  content: '',
                  metadata: Object.freeze({ reason })
                })
              ]
            : []
        )
      })
    if (queryRecord.inputs === undefined) return sanitized()

    let inputs: Record<string, unknown>[]
    try {
      inputs = arr(queryRecord.inputs, 16).map(plain)
    } catch {
      return sanitized('source-invalid')
    }
    const imageInputs = inputs.filter((input) => input.type === 'image' || input.type === 'files')
    if (imageInputs.length !== 1)
      return sanitized(imageInputs.length > 1 ? 'source-invalid' : undefined)

    try {
      auth(false)
      auth(true)
    } catch (error) {
      return sanitized(
        code(error) === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
          ? 'permission-unavailable'
          : 'permission-denied'
      )
    }

    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    outer?.addEventListener('abort', onAbort, { once: true })
    if (outer?.aborted) controller.abort()
    controllers.add(controller)
    let done!: () => void
    const pending = new Promise<void>((resolve) => {
      done = resolve
    })
    work.add(pending)
    try {
      let source: Source
      try {
        signal(controller.signal)
        const rawInput = imageInputs[0]!
        const input = obj(
          rawInput,
          ['type', 'content', 'metadata', 'rawContent', 'thumbnail', 'path'],
          ['type', 'content']
        )
        if (typeof input.content !== 'string') bad()
        const metadata = input.metadata === undefined ? Object.create(null) : plain(input.metadata)

        if (input.type === 'image' && input.content.startsWith('data:')) {
          source = Object.freeze({
            kind: 'data',
            data: dataUrl(input.content),
            name: name(metadata.name, 'image.png')
          })
        } else {
          let sourceFile = input.content
          if (input.type === 'files') {
            if (Buffer.byteLength(sourceFile) > 8192) bad()
            const paths = arr(JSON.parse(sourceFile), 1)
            if (paths.length !== 1 || typeof paths[0] !== 'string') bad()
            sourceFile = paths[0]
          } else if (input.type !== 'image') {
            bad()
          }
          if (
            !path.isAbsolute(sourceFile) ||
            Buffer.byteLength(sourceFile) > 4096 ||
            sourceFile.includes('\0')
          )
            bad()
          const found = await sourcePath(fs, sourceFile, controller.signal)
          source = Object.freeze({ ...found, name: name(metadata.name, found.name) })
        }

        const imageBytes = await bytes(fs, source, controller.signal)
        inspect(await o.imageRenderer.inspect(imageBytes, controller.signal))
      } catch (error) {
        if (controller.signal.aborted)
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        return sanitized(sourceReason(error))
      }

      signal(controller.signal)
      currentActivation()
      const timestamp = now()
      if (!Number.isFinite(timestamp))
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
      const token = `img_${randomBytes(24).toString('base64url')}`
      current = { token, source, expires: timestamp + TTL }
      const timer = setTimeout(() => {
        if (current?.token === token) current = null
        if (expiryTimer === timer) expiryTimer = undefined
      }, TTL)
      expiryTimer = timer
      timer.unref()
      return Object.freeze({
        text,
        inputs: Object.freeze([
          Object.freeze({
            type: 'image',
            content: token,
            metadata: Object.freeze({ name: source.name })
          })
        ])
      })
    } finally {
      outer?.removeEventListener('abort', onAbort)
      controllers.delete(controller)
      work.delete(pending)
      done()
    }
  }
  const save = async (
    r: PluginImageToolsSaveRequest,
    outer: AbortSignal
  ): Promise<PluginImageToolsSaveResult> => {
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    if (outer.aborted) return cancelled()
    const c = new AbortController(),
      onAbort = (): void => c.abort()
    outer.addEventListener('abort', onAbort, { once: true })
    controllers.add(c)
    let done!: () => void
    const pending = new Promise<void>((resolve) => {
      done = resolve
    })
    work.add(pending)
    try {
      const entry = current
      if (!entry || entry.token !== r.token)
        return Object.freeze({ status: 'blocked', reason: 'token-invalid' } as const)
      const t = now()
      if (!Number.isFinite(t))
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
      if (t >= entry.expires) {
        clearCurrent()
        return Object.freeze({ status: 'blocked', reason: 'token-expired' } as const)
      }
      let b: Buffer, m: PluginImageToolsImageMetadata
      try {
        b = await bytes(fs, entry.source, c.signal)
        m = inspect(await o.imageRenderer.inspect(b, c.signal))
      } catch (e) {
        return c.signal.aborted
          ? cancelled()
          : Object.freeze({ status: 'blocked', reason: sourceReason(e) } as const)
      }
      let picked: Readonly<{ cancelled: boolean; filePath?: string }>
      try {
        picked = nativeSaveResult(
          await o.nativeSaveDialog.save(
            {
              defaultName: `${path.parse(entry.source.name).name || 'image'}.${r.format === 'jpeg' ? 'jpg' : r.format}`,
              format: r.format
            },
            c.signal
          )
        )
      } catch {
        return c.signal.aborted
          ? cancelled()
          : Object.freeze({ status: 'failed', reason: 'dialog-failed' } as const)
      }
      if (picked.cancelled || !picked.filePath || c.signal.aborted) return cancelled()
      currentActivation()
      auth(false)
      auth(true)
      signal(c.signal)
      let made: PluginImageToolsRenderedImage
      try {
        made = output(
          await o.imageRenderer.render(
            b,
            {
              format: r.format,
              ...(r.width === undefined ? {} : { width: r.width }),
              ...(r.height === undefined ? {} : { height: r.height }),
              ...(r.quality === undefined ? {} : { quality: r.quality }),
              source: m
            },
            c.signal
          ),
          r
        )
      } catch (e) {
        const reason = sourceReason(e)
        return c.signal.aborted
          ? cancelled()
          : Object.freeze({
              status: 'failed',
              reason: reason === 'source-invalid' ? 'render-failed' : reason
            } as const)
      }
      currentActivation()
      auth(false)
      auth(true)
      signal(c.signal)
      if (c.signal.aborted || !path.isAbsolute(picked.filePath) || picked.filePath.includes('\0'))
        return c.signal.aborted
          ? cancelled()
          : Object.freeze({ status: 'failed', reason: 'dialog-failed' } as const)
      const tmp = path.join(
        path.dirname(picked.filePath),
        `.${path.basename(picked.filePath)}.img-${randomBytes(16).toString('hex')}.tmp`
      )
      let h: FileHandle | undefined,
        created = false,
        committed = false
      try {
        h = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
        created = true
        await h.writeFile(made.data)
        await h.sync()
        await h.close()
        h = undefined
        if (c.signal.aborted) return cancelled()
        await fs.rename(tmp, picked.filePath)
        committed = true
        return Object.freeze({
          status: 'saved',
          name: name(path.basename(picked.filePath), 'image'),
          format: r.format,
          width: made.width,
          height: made.height,
          bytes: made.data.byteLength
        } as const)
      } catch {
        return c.signal.aborted && !committed
          ? cancelled()
          : Object.freeze({ status: 'failed', reason: 'write-failed' } as const)
      } finally {
        await h?.close().catch(() => undefined)
        if (created && !committed) await fs.unlink(tmp).catch(() => undefined)
      }
    } finally {
      outer.removeEventListener('abort', onAbort)
      controllers.delete(c)
      work.delete(pending)
      done()
    }
  }
  const definition: PluginHostCapabilityDefinition<
    PluginImageToolsSaveRequest,
    PluginImageToolsSaveResult
  > = Object.freeze({
    id: 'media.image-tools',
    permission: 'fs.read',
    timeoutMs: 120_000,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest: request,
    validateResult: result,
    isCommittedResult: (v: unknown) =>
      Boolean(
        v &&
        typeof v === 'object' &&
        !utilTypes.isProxy(v) &&
        Object.getOwnPropertyDescriptor(v, 'status')?.value === 'saved'
      ),
    async invoke(context: PluginSecurityContext, r: PluginImageToolsSaveRequest, s: AbortSignal) {
      if (
        !isAuthoritativePluginContext(context) ||
        context.identity.authority !== 'plugin-host' ||
        context.identity.pluginName !== expected.name ||
        context.name !== expected.name ||
        context.identity.pluginInstanceId !== expected.pluginInstanceId ||
        context.identity.activationGeneration !== expected.activationGeneration ||
        context.uniqueKey !== expected.key ||
        o.resolveHostGeneration.call(raw, expected) !== context.identity.hostGeneration
      )
        bad()
      currentActivation()
      auth(false)
      auth(true)
      return result(await save(r, s))
    }
  })
  return Object.freeze({
    definitions: Object.freeze([definition]),
    prepareLifecycleQuery,
    close(): Promise<void> {
      if (closing) return closing
      closed = true
      abort()
      for (const d of disposers.splice(0))
        try {
          d()
        } catch {}
      closing = Promise.allSettled([...work]).then(() => undefined)
      return closing
    }
  })
}
