import type { UserMessageAttachment } from '@talex-touch/tuff-intelligence/pilot-server'
import { Buffer } from 'node:buffer'

export type PilotAttachmentDeliverySource = 'id' | 'url' | 'base64'

export type PilotAttachmentDeliveryErrorCode
  = | 'ATTACHMENT_UNREACHABLE'
    | 'ATTACHMENT_TOO_LARGE_FOR_INLINE'
    | 'ATTACHMENT_LOAD_FAILED'

export interface PilotAttachmentObjectLike {
  bytes: Uint8Array
  mimeType?: string
  size?: number
}

export interface PilotAttachmentDeliveryInput {
  id: string
  type: 'image' | 'file'
  ref: string
  name?: string
  mimeType?: string
  size?: number
  previewUrl?: string
  modelUrl?: string
  providerFileId?: string
  dataUrl?: string
  loadObject?: () => Promise<PilotAttachmentObjectLike | null> | PilotAttachmentObjectLike | null
}

export interface PilotAttachmentDeliveryOptions {
  concurrency?: number
  inlineImageMaxBytes?: number
  inlineImageTotalMaxBytes?: number
  inlineFileMaxBytes?: number
  inlineFileTotalMaxBytes?: number
}

export interface PilotAttachmentDeliveryFailure {
  id: string
  type: 'image' | 'file'
  code: PilotAttachmentDeliveryErrorCode
  message: string
  name?: string
  mimeType?: string
}

export interface PilotAttachmentDeliverySummary {
  total: number
  resolved: number
  unresolved: number
  idCount: number
  urlCount: number
  base64Count: number
  loadedObjectCount: number
  inlinedImageBytes: number
  inlinedFileBytes: number
}

export interface ResolvePilotAttachmentDeliveryResult {
  attachments: UserMessageAttachment[]
  failures: PilotAttachmentDeliveryFailure[]
  summary: PilotAttachmentDeliverySummary
}

interface NormalizedDeliveryOptions {
  concurrency: number
  inlineImageMaxBytes: number
  inlineImageTotalMaxBytes: number
  inlineFileMaxBytes: number
  inlineFileTotalMaxBytes: number
}

interface DeliveryCandidate {
  index: number
  base: UserMessageAttachment
  providerFileId: string
  modelUrl: string
  inlineDataUrl: string
  inlineMimeType: string
  inlineBytes: number
  inlineFromLoad: boolean
  loadFailed: boolean
}

const DEFAULT_INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_INLINE_IMAGE_TOTAL_MAX_BYTES = 12 * 1024 * 1024
const DEFAULT_INLINE_FILE_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_INLINE_FILE_TOTAL_MAX_BYTES = 16 * 1024 * 1024

function normalizePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function normalizeOptions(options?: PilotAttachmentDeliveryOptions): NormalizedDeliveryOptions {
  return {
    concurrency: normalizePositiveInt(options?.concurrency, 3, 1, 8),
    inlineImageMaxBytes: normalizePositiveInt(options?.inlineImageMaxBytes, DEFAULT_INLINE_IMAGE_MAX_BYTES, 64 * 1024, 20 * 1024 * 1024),
    inlineImageTotalMaxBytes: normalizePositiveInt(options?.inlineImageTotalMaxBytes, DEFAULT_INLINE_IMAGE_TOTAL_MAX_BYTES, 128 * 1024, 64 * 1024 * 1024),
    inlineFileMaxBytes: normalizePositiveInt(options?.inlineFileMaxBytes, DEFAULT_INLINE_FILE_MAX_BYTES, 64 * 1024, 20 * 1024 * 1024),
    inlineFileTotalMaxBytes: normalizePositiveInt(options?.inlineFileTotalMaxBytes, DEFAULT_INLINE_FILE_TOTAL_MAX_BYTES, 128 * 1024, 64 * 1024 * 1024),
  }
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMimeType(value: unknown, fallback: string): string {
  const normalized = normalizeText(value).slice(0, 160)
  return normalized || fallback
}

function estimateDataUrlBytes(dataUrl: string): number {
  const match = String(dataUrl || '').match(/^data:[^;]+;base64,([A-Z0-9+/=\s]+)$/i)
  if (!match) {
    return 0
  }
  const base64 = String(match[1] || '').replace(/\s+/g, '')
  if (!base64) {
    return 0
  }
  const padding = (base64.match(/=+$/)?.[0].length) || 0
  const size = Math.floor(base64.length * 3 / 4) - padding
  return Number.isFinite(size) && size > 0 ? size : 0
}

function toBase64DataUrl(bytes: Uint8Array, mimeType: string): string {
  if (!bytes.byteLength) {
    return ''
  }
  const encoded = Buffer.from(bytes).toString('base64')
  if (!encoded) {
    return ''
  }
  return `data:${mimeType};base64,${encoded}`
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized) {
    return true
  }

  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.endsWith('.local')
  ) {
    return true
  }

  if (normalized.startsWith('127.') || normalized.startsWith('10.') || normalized.startsWith('192.168.')) {
    return true
  }

  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)) {
    return true
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
    return true
  }

  return false
}

function normalizePublicHttpsUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') {
      return ''
    }
    if (isPrivateHostname(url.hostname)) {
      return ''
    }
    return url.toString()
  }
  catch {
    return ''
  }
}

function resolveProviderFileId(input: PilotAttachmentDeliveryInput): string {
  const direct = normalizeText(input.providerFileId)
  if (direct) {
    return direct
  }

  const ref = normalizeText(input.ref)
  if (!ref) {
    return ''
  }

  const openAiMatch = ref.match(/^(?:openai-file|file-id|provider-file):\/\/(.+)$/i)
  if (openAiMatch) {
    return normalizeText(openAiMatch[1])
  }

  if (/^file-[\w-]+$/.test(ref)) {
    return ref
  }

  return ''
}

function resolveModelUrl(input: PilotAttachmentDeliveryInput): string {
  const candidates = [
    normalizeText(input.modelUrl),
    normalizeText(input.previewUrl),
    normalizeText(input.ref),
  ]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    const normalized = normalizePublicHttpsUrl(candidate)
    if (normalized) {
      return normalized
    }
  }
  return ''
}

function getInlineLimitByType(type: 'image' | 'file', options: NormalizedDeliveryOptions): {
  perFileLimit: number
  totalLimit: number
} {
  if (type === 'image') {
    return {
      perFileLimit: options.inlineImageMaxBytes,
      totalLimit: options.inlineImageTotalMaxBytes,
    }
  }
  return {
    perFileLimit: options.inlineFileMaxBytes,
    totalLimit: options.inlineFileTotalMaxBytes,
  }
}

function createInlineTooLargeFailure(base: UserMessageAttachment): PilotAttachmentDeliveryFailure {
  return {
    id: base.id,
    type: base.type,
    code: 'ATTACHMENT_TOO_LARGE_FOR_INLINE',
    message: `附件 ${base.name || base.id} 过大，无法走 base64 兜底，请使用可访问 URL 或 provider file id。`,
    name: base.name,
    mimeType: base.mimeType,
  }
}

function createUnreachableFailure(base: UserMessageAttachment): PilotAttachmentDeliveryFailure {
  return {
    id: base.id,
    type: base.type,
    code: 'ATTACHMENT_UNREACHABLE',
    message: `附件 ${base.name || base.id} 无可用投递来源（id/url/base64）。请检查附件存储公网可访问配置。`,
    name: base.name,
    mimeType: base.mimeType,
  }
}

function createLoadFailedFailure(base: UserMessageAttachment): PilotAttachmentDeliveryFailure {
  return {
    id: base.id,
    type: base.type,
    code: 'ATTACHMENT_LOAD_FAILED',
    message: `附件 ${base.name || base.id} 读取失败，请稍后重试。`,
    name: base.name,
    mimeType: base.mimeType,
  }
}

function toDeliveryErrorMessage(failures: PilotAttachmentDeliveryFailure[]): string {
  const first = failures[0]
  if (!first) {
    return '附件处理失败'
  }
  return `[${first.code}] ${first.message}`
}

export class PilotAttachmentDeliveryError extends Error {
  code: PilotAttachmentDeliveryErrorCode
  failures: PilotAttachmentDeliveryFailure[]
  summary: PilotAttachmentDeliverySummary

  constructor(
    failures: PilotAttachmentDeliveryFailure[],
    summary: PilotAttachmentDeliverySummary,
  ) {
    const first = failures[0]
    super(toDeliveryErrorMessage(failures))
    this.name = 'PilotAttachmentDeliveryError'
    this.code = first?.code || 'ATTACHMENT_UNREACHABLE'
    this.failures = failures
    this.summary = summary
  }
}

async function mapLimit<T, R>(
  list: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (list.length <= 0) {
    return []
  }

  const max = Math.max(1, Math.min(limit, list.length))
  const results: R[] = new Array(list.length)
  let cursor = 0

  const runWorker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= list.length) {
        return
      }
      results[index] = await worker(list[index], index)
    }
  }

  await Promise.all(Array.from({ length: max }, () => runWorker()))
  return results
}

async function buildDeliveryCandidate(
  input: PilotAttachmentDeliveryInput,
  index: number,
): Promise<DeliveryCandidate> {
  const fallbackMimeType = input.type === 'image' ? 'image/*' : 'application/octet-stream'
  const base: UserMessageAttachment = {
    id: input.id,
    type: input.type,
    ref: normalizeText(input.ref),
    name: normalizeText(input.name) || undefined,
    mimeType: normalizeMimeType(input.mimeType, fallbackMimeType),
    size: Number.isFinite(input.size) ? Number(input.size) : undefined,
    previewUrl: normalizeText(input.previewUrl) || undefined,
  }

  const providerFileId = resolveProviderFileId(input)
  const modelUrl = resolveModelUrl(input)
  const dataUrl = normalizeText(input.dataUrl)
  if (dataUrl) {
    const inlineBytes = estimateDataUrlBytes(dataUrl)
    if (inlineBytes > 0) {
      return {
        index,
        base,
        providerFileId,
        modelUrl,
        inlineDataUrl: dataUrl,
        inlineMimeType: base.mimeType || fallbackMimeType,
        inlineBytes,
        inlineFromLoad: false,
        loadFailed: false,
      }
    }
  }

  if (providerFileId || modelUrl || !input.loadObject) {
    return {
      index,
      base,
      providerFileId,
      modelUrl,
      inlineDataUrl: '',
      inlineMimeType: base.mimeType || fallbackMimeType,
      inlineBytes: 0,
      inlineFromLoad: false,
      loadFailed: false,
    }
  }

  try {
    const loaded = await input.loadObject()
    if (!loaded) {
      return {
        index,
        base,
        providerFileId,
        modelUrl,
        inlineDataUrl: '',
        inlineMimeType: base.mimeType || fallbackMimeType,
        inlineBytes: 0,
        inlineFromLoad: true,
        loadFailed: true,
      }
    }

    const bytes = loaded.bytes || new Uint8Array()
    const inlineBytes = Number.isFinite(loaded.size)
      ? Number(loaded.size)
      : Number(bytes.byteLength || 0)
    const inlineMimeType = normalizeMimeType(loaded.mimeType, base.mimeType || fallbackMimeType)
    const inlineDataUrl = toBase64DataUrl(bytes, inlineMimeType)

    return {
      index,
      base: {
        ...base,
        mimeType: inlineMimeType,
        size: inlineBytes || base.size,
      },
      providerFileId,
      modelUrl,
      inlineDataUrl,
      inlineMimeType,
      inlineBytes,
      inlineFromLoad: true,
      loadFailed: false,
    }
  }
  catch {
    return {
      index,
      base,
      providerFileId,
      modelUrl,
      inlineDataUrl: '',
      inlineMimeType: base.mimeType || fallbackMimeType,
      inlineBytes: 0,
      inlineFromLoad: true,
      loadFailed: true,
    }
  }
}

export async function resolvePilotAttachmentDeliveries(
  inputAttachments: PilotAttachmentDeliveryInput[],
  options?: PilotAttachmentDeliveryOptions,
): Promise<ResolvePilotAttachmentDeliveryResult> {
  if (!Array.isArray(inputAttachments) || inputAttachments.length <= 0) {
    return {
      attachments: [],
      failures: [],
      summary: {
        total: 0,
        resolved: 0,
        unresolved: 0,
        idCount: 0,
        urlCount: 0,
        base64Count: 0,
        loadedObjectCount: 0,
        inlinedImageBytes: 0,
        inlinedFileBytes: 0,
      },
    }
  }

  const normalizedOptions = normalizeOptions(options)
  const candidates = await mapLimit(inputAttachments, normalizedOptions.concurrency, buildDeliveryCandidate)
  candidates.sort((left, right) => left.index - right.index)

  const attachments: UserMessageAttachment[] = []
  const failures: PilotAttachmentDeliveryFailure[] = []
  let idCount = 0
  let urlCount = 0
  let base64Count = 0
  let loadedObjectCount = 0
  let inlinedImageBytes = 0
  let inlinedFileBytes = 0

  for (const candidate of candidates) {
    const base: UserMessageAttachment = {
      ...candidate.base,
    }

    if (candidate.providerFileId) {
      base.providerFileId = candidate.providerFileId
      base.deliverySource = 'id'
      if (candidate.modelUrl) {
        base.modelUrl = candidate.modelUrl
      }
      idCount += 1
      attachments.push(base)
      continue
    }

    if (candidate.modelUrl) {
      base.modelUrl = candidate.modelUrl
      base.deliverySource = 'url'
      urlCount += 1
      attachments.push(base)
      continue
    }

    if (candidate.loadFailed) {
      failures.push(createLoadFailedFailure(base))
      continue
    }

    if (!candidate.inlineDataUrl || candidate.inlineBytes <= 0) {
      failures.push(createUnreachableFailure(base))
      continue
    }

    const limit = getInlineLimitByType(base.type, normalizedOptions)
    if (candidate.inlineBytes > limit.perFileLimit) {
      failures.push(createInlineTooLargeFailure(base))
      continue
    }

    if (base.type === 'image') {
      if ((inlinedImageBytes + candidate.inlineBytes) > limit.totalLimit) {
        failures.push(createInlineTooLargeFailure(base))
        continue
      }
      inlinedImageBytes += candidate.inlineBytes
    }
    else {
      if ((inlinedFileBytes + candidate.inlineBytes) > limit.totalLimit) {
        failures.push(createInlineTooLargeFailure(base))
        continue
      }
      inlinedFileBytes += candidate.inlineBytes
    }

    if (candidate.inlineFromLoad) {
      loadedObjectCount += 1
    }
    base.dataUrl = candidate.inlineDataUrl
    base.deliverySource = 'base64'
    base64Count += 1
    attachments.push(base)
  }

  const summary: PilotAttachmentDeliverySummary = {
    total: inputAttachments.length,
    resolved: attachments.length,
    unresolved: failures.length,
    idCount,
    urlCount,
    base64Count,
    loadedObjectCount,
    inlinedImageBytes,
    inlinedFileBytes,
  }

  return {
    attachments,
    failures,
    summary,
  }
}

export async function resolvePilotAttachmentDeliveriesOrThrow(
  inputAttachments: PilotAttachmentDeliveryInput[],
  options?: PilotAttachmentDeliveryOptions,
): Promise<ResolvePilotAttachmentDeliveryResult> {
  const result = await resolvePilotAttachmentDeliveries(inputAttachments, options)
  if (result.failures.length > 0) {
    throw new PilotAttachmentDeliveryError(result.failures, result.summary)
  }
  return result
}
