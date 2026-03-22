import type { H3Event } from 'h3'
import type { PilotChannelAdapter, PilotChannelTransport } from './pilot-channel'
import type { PilotToolRiskLevel } from './pilot-tool-approvals'
import type { PilotWebsearchNormalizedDocument, PilotWebsearchSearchHit } from './pilot-websearch-connector'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'
import {
  getPilotWebsearchDatasourceConfig,
  resolveWebsearchProviderApiKey,
} from './pilot-admin-datasource-config'
import { savePilotRuntimeMediaCache } from './pilot-runtime-media-cache'
import {
  createPilotToolApprovalTicket,
  findLatestPilotToolApprovalByRequestHash,
  updatePilotToolApprovalTicketResult,
} from './pilot-tool-approvals'
import {
  createGatewayWebsearchConnector,
  createWebsearchProviderConnector,
  dedupeNormalizedDocuments,
  isAllowlistedDomain,
} from './pilot-websearch-connector'

export type PilotToolAuditType = 'tool.call.started' | 'tool.call.approval_required' | 'tool.call.approved' | 'tool.call.rejected' | 'tool.call.completed' | 'tool.call.failed'

export interface PilotToolSource {
  id: string
  url: string
  title: string
  snippet: string
  domain: string
  sourceType?: string
  sourceRuleId?: string
}

export interface PilotToolAuditPayload {
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  status: string
  inputPreview: string
  outputPreview: string
  durationMs: number
  ticketId: string
  sources: PilotToolSource[]
  errorCode: string
  errorMessage: string
  connectorSource?: 'gateway' | 'responses_builtin' | 'none'
  connectorReason?: string
  providerChain?: string[]
  providerUsed?: string[]
  fallbackUsed?: boolean
  dedupeCount?: number
}

export class PilotToolApprovalRequiredError extends Error {
  readonly code = 'TOOL_APPROVAL_REQUIRED'

  constructor(
    readonly ticketId: string,
    readonly callId: string,
    readonly toolName: string,
    readonly riskLevel: PilotToolRiskLevel,
    message = 'Tool call approval required',
  ) {
    super(message)
    this.name = 'PilotToolApprovalRequiredError'
  }
}

export class PilotToolApprovalRejectedError extends Error {
  readonly code = 'TOOL_APPROVAL_REJECTED'

  constructor(
    readonly ticketId: string,
    readonly callId: string,
    readonly toolName: string,
    readonly riskLevel: PilotToolRiskLevel,
    message = 'Tool call rejected',
  ) {
    super(message)
    this.name = 'PilotToolApprovalRejectedError'
  }
}

export interface ExecutePilotWebsearchToolInput {
  event: H3Event
  userId: string
  sessionId: string
  requestId: string
  query: string
  channel?: {
    baseUrl: string
    apiKey: string
    model: string
    adapter: PilotChannelAdapter
    transport: PilotChannelTransport
    timeoutMs?: number
  }
  emitAudit?: (payload: { auditType: PilotToolAuditType } & PilotToolAuditPayload) => Promise<void> | void
}

export interface ExecutePilotWebsearchToolResult {
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  ticketId?: string
  sources: PilotToolSource[]
  contextText: string
  connectorSource: 'gateway' | 'responses_builtin'
  connectorReason: string
  providerChain: string[]
  providerUsed: string[]
  fallbackUsed: boolean
  dedupeCount: number
}

export interface ExecutePilotImageGenerateToolInput {
  event: H3Event
  userId: string
  sessionId: string
  requestId: string
  prompt: string
  size?: string
  count?: number
  output?: PilotMediaOutputOptions
  channel: {
    baseUrl: string
    apiKey: string
    model: string
    adapter: PilotChannelAdapter
    transport: PilotChannelTransport
    timeoutMs?: number
  }
  emitAudit?: (payload: { auditType: PilotToolAuditType } & PilotToolAuditPayload) => Promise<void> | void
}

export interface PilotGeneratedImage {
  url: string
  revisedPrompt?: string
  base64?: string
}

export interface ExecutePilotImageGenerateToolResult {
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  sources: PilotToolSource[]
  images: PilotGeneratedImage[]
}

export interface PilotMediaOutputOptions {
  includeBase64?: boolean
}

export interface ExecutePilotImageEditToolInput {
  event: H3Event
  userId: string
  sessionId: string
  requestId: string
  prompt: string
  image: {
    base64: string
    mimeType?: string
    filename?: string
  }
  mask?: {
    base64: string
    mimeType?: string
    filename?: string
  }
  size?: string
  count?: number
  output?: PilotMediaOutputOptions
  channel: {
    baseUrl: string
    apiKey: string
    model: string
    adapter: PilotChannelAdapter
    transport: PilotChannelTransport
    timeoutMs?: number
  }
  emitAudit?: (payload: { auditType: PilotToolAuditType } & PilotToolAuditPayload) => Promise<void> | void
}

export interface ExecutePilotImageEditToolResult {
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  sources: PilotToolSource[]
  images: PilotGeneratedImage[]
}

export interface PilotGeneratedAudio {
  url: string
  mimeType: string
  base64?: string
}

export interface ExecutePilotAudioTtsToolInput {
  event: H3Event
  userId: string
  sessionId: string
  requestId: string
  text: string
  voice?: string
  format?: 'mp3' | 'wav' | 'opus' | 'flac' | 'aac' | 'pcm'
  output?: PilotMediaOutputOptions
  channel: {
    baseUrl: string
    apiKey: string
    model: string
    adapter: PilotChannelAdapter
    transport: PilotChannelTransport
    timeoutMs?: number
  }
  emitAudit?: (payload: { auditType: PilotToolAuditType } & PilotToolAuditPayload) => Promise<void> | void
}

export interface ExecutePilotAudioTtsToolResult {
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  sources: PilotToolSource[]
  audio: PilotGeneratedAudio
}

export interface ExecutePilotAudioTranscribeToolInput {
  event: H3Event
  userId: string
  sessionId: string
  requestId: string
  audio: {
    base64: string
    mimeType?: string
    filename?: string
  }
  language?: string
  prompt?: string
  temperature?: number
  channel: {
    baseUrl: string
    apiKey: string
    model: string
    adapter: PilotChannelAdapter
    transport: PilotChannelTransport
    timeoutMs?: number
  }
  emitAudit?: (payload: { auditType: PilotToolAuditType } & PilotToolAuditPayload) => Promise<void> | void
}

export interface ExecutePilotAudioTranscribeToolResult {
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  sources: PilotToolSource[]
  text: string
  language?: string
  durationSeconds?: number
}

const TOOL_NAME = 'websearch'
const TOOL_ID = 'tool.websearch'
const IMAGE_TOOL_NAME = 'image.generate'
const IMAGE_TOOL_ID = 'tool.image.generate'
const IMAGE_EDIT_TOOL_NAME = 'image.edit'
const IMAGE_EDIT_TOOL_ID = 'tool.image.edit'
const AUDIO_TTS_TOOL_NAME = 'audio.tts'
const AUDIO_TTS_TOOL_ID = 'tool.audio.tts'
const AUDIO_STT_TOOL_NAME = 'audio.stt'
const AUDIO_STT_TOOL_ID = 'tool.audio.stt'
const AUDIO_TRANSCRIBE_TOOL_NAME = 'audio.transcribe'
const AUDIO_TRANSCRIBE_TOOL_ID = 'tool.audio.transcribe'
export const PILOT_MEDIA_UNSUPPORTED_CODE = 'PILOT_MEDIA_UNSUPPORTED'
export const PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED_CODE = 'PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED'
const IMAGE_TOOL_TIMEOUT_MS = 90_000
const IMAGE_TOOL_DEFAULT_SIZE = '1024x1024'
const IMAGE_TOOL_DEFAULT_COUNT = 1
const IMAGE_TOOL_MAX_COUNT = 4
const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function clipText(value: unknown, maxLength: number): string {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value ?? null)
  }
  catch {
    return ''
  }
}

function toSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function randomCallId(): string {
  return `tool_call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function toInputPreview(query: string): string {
  return clipText(query, 600)
}

function toOutputPreview(sources: PilotToolSource[]): string {
  if (sources.length <= 0) {
    return 'No websearch sources found.'
  }
  return clipText(
    sources
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.title} (${item.domain})`)
      .join('\n'),
    1_200,
  )
}

function toOutputPreviewWithSummary(sources: PilotToolSource[], summaryText: string): string {
  if (sources.length > 0) {
    return toOutputPreview(sources)
  }
  const summary = clipText(summaryText, 1_200)
  return summary || 'No websearch sources found.'
}

function buildRequestHash(query: string, domains: string[], crawlEnabled: boolean, providerChain: string[]): string {
  const normalizedDomains = domains
    .map(item => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .sort()
  return toSha256(JSON.stringify({
    query: normalizeText(query).toLowerCase(),
    domains: normalizedDomains,
    crawlEnabled: Boolean(crawlEnabled),
    providerChain: providerChain
      .map(item => normalizeText(item).toLowerCase())
      .filter(Boolean),
    tool: TOOL_NAME,
  }))
}

function buildDocDedupeKey(
  doc: Pick<PilotWebsearchNormalizedDocument, 'urlHash' | 'contentHash'>,
  mode: 'url' | 'url+content',
): string {
  if (mode === 'url+content') {
    return `${doc.urlHash}:${doc.contentHash}`
  }
  return doc.urlHash
}

function evaluateRiskLevel(input: {
  crawlEnabled: boolean
  domains: string[]
  allowlistDomains: string[]
}): PilotToolRiskLevel {
  const domains = Array.from(new Set(input.domains.map(item => normalizeText(item).toLowerCase()).filter(Boolean)))
  if (domains.length <= 0) {
    return 'low'
  }

  const outsideAllowlist = domains.some(domain => !isAllowlistedDomain(domain, input.allowlistDomains))
  if (!input.crawlEnabled) {
    return outsideAllowlist ? 'medium' : 'low'
  }
  if (outsideAllowlist) {
    return 'high'
  }
  return 'medium'
}

function mapDocumentsToSources(docs: PilotWebsearchNormalizedDocument[]): PilotToolSource[] {
  return docs.map((item, index) => ({
    id: `${item.urlHash.slice(0, 8)}_${index}`,
    url: item.url,
    title: item.title || item.url,
    snippet: item.snippet || clipText(item.content, 220),
    domain: item.domain,
    sourceType: item.sourceType,
    sourceRuleId: item.sourceRuleId,
  }))
}

function buildContextText(query: string, sources: PilotToolSource[], summaryText = ''): string {
  if (sources.length <= 0 && !summaryText) {
    return ''
  }

  const lines: string[] = []
  if (sources.length > 0) {
    lines.push('Websearch references:')
  }
  for (const [index, item] of sources.entries()) {
    const title = clipText(item.title || item.url, 160)
    const snippet = clipText(item.snippet, 300)
    lines.push(`[${index + 1}] ${title}`)
    if (snippet) {
      lines.push(`- ${snippet}`)
    }
    lines.push(`- ${item.url}`)
  }
  if (summaryText) {
    lines.push('Websearch summary:')
    lines.push(clipText(summaryText, 2_400))
  }
  lines.push(`User query: ${clipText(query, 300)}`)
  return clipText(lines.join('\n'), 6_000)
}

function resolveResponsesEndpoint(baseUrl: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/v1')
    ? `${normalized}/responses`
    : `${normalized}/v1/responses`
}

function canUseResponsesBuiltinFallback(
  channel: ExecutePilotWebsearchToolInput['channel'],
): channel is NonNullable<ExecutePilotWebsearchToolInput['channel']> {
  if (!channel) {
    return false
  }
  if (channel.adapter !== 'openai' || channel.transport !== 'responses') {
    return false
  }
  return Boolean(resolveResponsesEndpoint(channel.baseUrl))
}

function parseResponsesOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  const output = Array.isArray(payload.output) ? payload.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const content = Array.isArray(row.content) ? row.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        continue
      }
      const partRow = part as Record<string, unknown>
      const text = normalizeText(partRow.text || partRow.output_text)
      if (text) {
        chunks.push(text)
      }
    }
  }
  return chunks.join('\n').trim()
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function pushParsedSource(
  row: Record<string, unknown>,
  output: Array<{ url: string, title: string, snippet: string, sourceType: string }>,
): void {
  const url = normalizeText(row.url || row.link || row.href)
  if (!url || !isHttpUrl(url)) {
    return
  }
  output.push({
    url,
    title: clipText(row.title || row.name || url, 240),
    snippet: clipText(row.snippet || row.summary || row.description || row.text || '', 600),
    sourceType: normalizeText(row.type || row.sourceType || 'responses_builtin') || 'responses_builtin',
  })
}

function collectSourcesFromUnknown(
  value: unknown,
  output: Array<{ url: string, title: string, snippet: string, sourceType: string }>,
  depth = 0,
): void {
  if (depth > 8 || value === null || value === undefined) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSourcesFromUnknown(item, output, depth + 1)
    }
    return
  }
  if (typeof value !== 'object') {
    return
  }
  const row = value as Record<string, unknown>
  pushParsedSource(row, output)
  for (const item of Object.values(row)) {
    if (item && (typeof item === 'object' || Array.isArray(item))) {
      collectSourcesFromUnknown(item, output, depth + 1)
    }
  }
}

function resolveDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return ''
  }
}

function parseTextUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s)>\]}]+/gi) || []
  const list = matches
    .map(item => normalizeText(item).replace(/[.,;]+$/g, ''))
    .filter(isHttpUrl)
  return Array.from(new Set(list))
}

function normalizeResponsesBuiltinDocs(input: {
  payload: Record<string, unknown>
  query: string
  maxResults: number
}): {
  docs: PilotWebsearchNormalizedDocument[]
  summaryText: string
} {
  const summaryText = parseResponsesOutputText(input.payload)
  const collected: Array<{ url: string, title: string, snippet: string, sourceType: string }> = []
  collectSourcesFromUnknown(input.payload, collected)

  if (summaryText) {
    const urlsInText = parseTextUrls(summaryText)
    for (const url of urlsInText) {
      collected.push({
        url,
        title: url,
        snippet: '',
        sourceType: 'responses_builtin',
      })
    }
  }

  const dedupedByUrl = Array.from(
    new Map(
      collected
        .filter(item => isHttpUrl(item.url))
        .map(item => [item.url, item]),
    ).values(),
  ).slice(0, Math.max(1, input.maxResults))

  const docs = dedupedByUrl.map((item) => {
    const url = item.url
    const content = clipText(summaryText || item.snippet || input.query, 8_000)
    return {
      url,
      title: clipText(item.title || url, 240),
      snippet: clipText(item.snippet || summaryText || '', 600),
      content,
      domain: resolveDomainFromUrl(url),
      urlHash: toSha256(url),
      contentHash: toSha256(content || ''),
      sourceType: item.sourceType || 'responses_builtin',
      sourceRuleId: 'responses_builtin',
    } satisfies PilotWebsearchNormalizedDocument
  })

  return {
    docs,
    summaryText,
  }
}

async function executeResponsesBuiltinWebsearch(input: {
  query: string
  channel: NonNullable<ExecutePilotWebsearchToolInput['channel']>
  maxResults: number
}): Promise<{
  docs: PilotWebsearchNormalizedDocument[]
  summaryText: string
  connectorSource: 'responses_builtin'
  connectorReason: string
}> {
  if (input.channel.adapter !== 'openai' || input.channel.transport !== 'responses') {
    const unsupportedError = new Error('responses_builtin_requires_openai_responses_channel')
    ;(unsupportedError as Error & { code?: string }).code = 'WEBSEARCH_FALLBACK_UNSUPPORTED_CHANNEL'
    throw unsupportedError
  }

  const endpoint = resolveResponsesEndpoint(input.channel.baseUrl)
  if (!endpoint) {
    const endpointError = new Error('responses_builtin_endpoint_missing')
    ;(endpointError as Error & { code?: string }).code = 'WEBSEARCH_FALLBACK_ENDPOINT_MISSING'
    throw endpointError
  }

  const timeoutMs = normalizeToolTimeoutMs(input.channel.timeoutMs || 12_000)
  const toolTypes = ['web_search', 'web_search_preview']
  let lastErrorText = ''

  for (const toolType of toolTypes) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const response = await networkClient.request<unknown>({
        method: 'POST',
        url: endpoint,
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${input.channel.apiKey}`,
        },
        body: JSON.stringify({
          model: normalizeText(input.channel.model) || 'gpt-5.2',
          input: `请联网检索并回答以下问题，优先返回最新可信来源。\n用户问题：${input.query}\n请尽量附上来源链接。`,
          tools: [
            {
              type: toolType,
            },
          ],
          temperature: 0,
        }),
        signal: controller.signal,
        validateStatus: ALL_HTTP_STATUS,
      })

      if (response.status < 200 || response.status >= 300) {
        const failedText = typeof response.data === 'string'
          ? response.data
          : safeJsonString(response.data)
        lastErrorText = `${response.status} ${failedText}`.trim()
        continue
      }

      const payload = response.data
      const normalized = normalizeResponsesBuiltinDocs({
        payload: payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload as Record<string, unknown>
          : {},
        query: input.query,
        maxResults: input.maxResults,
      })

      return {
        docs: normalized.docs,
        summaryText: normalized.summaryText,
        connectorSource: 'responses_builtin',
        connectorReason: `provider_pool_fallback:${toolType}`,
      }
    }
    finally {
      clearTimeout(timeout)
    }
  }

  const requestError = new Error(lastErrorText || 'responses_builtin_websearch_failed')
  ;(requestError as Error & { code?: string }).code = 'WEBSEARCH_FALLBACK_EXECUTION_FAILED'
  throw requestError
}

async function emitToolAudit(
  emitAudit:
    | ExecutePilotWebsearchToolInput['emitAudit']
    | ExecutePilotImageGenerateToolInput['emitAudit']
    | ExecutePilotImageEditToolInput['emitAudit']
    | ExecutePilotAudioTtsToolInput['emitAudit']
    | ExecutePilotAudioTranscribeToolInput['emitAudit'],
  payload: { auditType: PilotToolAuditType } & PilotToolAuditPayload,
): Promise<void> {
  if (!emitAudit) {
    return
  }
  await emitAudit(payload)
}

function resolveImageEndpoint(baseUrl: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/v1')
    ? `${normalized}/images/generations`
    : `${normalized}/v1/images/generations`
}

function resolveImageEditEndpoint(baseUrl: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/v1')
    ? `${normalized}/images/edits`
    : `${normalized}/v1/images/edits`
}

function resolveAudioSpeechEndpoint(baseUrl: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/v1')
    ? `${normalized}/audio/speech`
    : `${normalized}/v1/audio/speech`
}

function resolveAudioTranscriptionsEndpoint(baseUrl: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/v1')
    ? `${normalized}/audio/transcriptions`
    : `${normalized}/v1/audio/transcriptions`
}

function resolveToolDomain(url: string): string {
  const value = normalizeText(url)
  if (!value) {
    return ''
  }
  if (value.startsWith('data:')) {
    return 'generated.local'
  }
  try {
    return new URL(value).hostname
  }
  catch {
    return ''
  }
}

function normalizeToolTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return IMAGE_TOOL_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.floor(parsed), 3_000), 10 * 60 * 1000)
}

function normalizeImageSize(value: unknown): string {
  const raw = normalizeText(value)
  if (!raw) {
    return IMAGE_TOOL_DEFAULT_SIZE
  }
  return /^\d{2,4}x\d{2,4}$/i.test(raw)
    ? raw
    : IMAGE_TOOL_DEFAULT_SIZE
}

function normalizeImageCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return IMAGE_TOOL_DEFAULT_COUNT
  }
  return Math.min(Math.max(Math.floor(parsed), 1), IMAGE_TOOL_MAX_COUNT)
}

function normalizeIncludeBase64(value: unknown): boolean {
  return value === true
}

function createMediaUnsupportedError(capability: string, reason: string): Error {
  const error = new Error(reason)
  ;(error as Error & { code?: string, capability?: string }).code = PILOT_MEDIA_UNSUPPORTED_CODE
  ;(error as Error & { code?: string, capability?: string }).capability = capability
  return error
}

export function createPilotVideoGenerateNotImplementedError(): Error {
  const error = new Error('video.generate 已完成配置接入，运行时暂未实现。')
  ;(error as Error & { code?: string }).code = PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED_CODE
  return error
}

function normalizeBase64(value: unknown): string {
  return String(value || '').trim().replace(/^data:[^;]+;base64,/i, '')
}

function normalizeBase64Payload(value: unknown): string {
  const compact = normalizeBase64(value).replace(/\s+/g, '')
  if (!compact) {
    return ''
  }
  const normalized = compact
  if (!/^[a-z0-9+/]+={0,2}$/i.test(normalized)) {
    return ''
  }
  const remainder = normalized.length % 4
  if (remainder === 1) {
    return ''
  }
  if (remainder === 0) {
    return normalized
  }
  return normalized.padEnd(normalized.length + (4 - remainder), '=')
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const raw = Buffer.from(value, 'base64')
  return Uint8Array.from(raw) as Uint8Array<ArrayBuffer>
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function normalizeMimeType(value: unknown, fallback = 'application/octet-stream'): string {
  const text = normalizeText(value).toLowerCase()
  return text || fallback
}

function normalizeImageFilename(value: unknown, fallback = 'image.png'): string {
  const text = normalizeText(value)
  return text || fallback
}

function normalizeAudioFilename(value: unknown, fallback = 'audio.wav'): string {
  const text = normalizeText(value)
  return text || fallback
}

function appendFormFile(form: FormData, field: string, input: {
  base64: string
  mimeType?: string
  filename?: string
}, fallbackName: string): void {
  const b64 = normalizeBase64Payload(input.base64)
  if (!b64) {
    return
  }
  const mimeType = normalizeMimeType(input.mimeType, 'application/octet-stream')
  const filename = normalizeText(input.filename) || fallbackName
  const bytes = decodeBase64(b64)
  form.append(field, new Blob([bytes], { type: mimeType }), filename)
}

function parseImageDataUrl(value: string): { mimeType: string, payload: string } | null {
  const matched = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!matched) {
    return null
  }
  const payload = normalizeBase64Payload(matched[2] || '')
  if (!payload) {
    return null
  }
  return {
    mimeType: normalizeMimeType(matched[1], 'image/png'),
    payload,
  }
}

function resolveImageBinaryFromUrlField(value: string): { bytes: Uint8Array<ArrayBuffer>, mimeType: string } | null {
  const raw = normalizeText(value)
  if (!raw) {
    return null
  }

  const parsedDataUrl = parseImageDataUrl(raw)
  if (parsedDataUrl) {
    const bytes = decodeBase64(parsedDataUrl.payload)
    if (bytes.byteLength <= 0) {
      return null
    }
    return {
      bytes,
      mimeType: parsedDataUrl.mimeType,
    }
  }

  if (
    raw.startsWith('/')
    || /^https?:\/\//i.test(raw)
    || raw.includes('://')
    || raw.startsWith('file:')
    || raw.startsWith('blob:')
  ) {
    return null
  }

  if (raw.length < 16) {
    return null
  }

  const payload = normalizeBase64Payload(raw)
  if (!payload) {
    return null
  }
  const bytes = decodeBase64(payload)
  if (bytes.byteLength <= 0) {
    return null
  }
  return {
    bytes,
    mimeType: 'image/png',
  }
}

function resolveAudioMimeTypeByFormat(format: string): string {
  const normalized = normalizeText(format).toLowerCase()
  if (normalized === 'wav') {
    return 'audio/wav'
  }
  if (normalized === 'opus') {
    return 'audio/opus'
  }
  if (normalized === 'flac') {
    return 'audio/flac'
  }
  if (normalized === 'aac') {
    return 'audio/aac'
  }
  if (normalized === 'pcm') {
    return 'audio/pcm'
  }
  return 'audio/mpeg'
}

function toMediaUrlAndBase64(input: {
  bytes: Uint8Array
  mimeType: string
  output?: PilotMediaOutputOptions
}): {
  url: string
  base64?: string
} {
  const saved = savePilotRuntimeMediaCache({
    bytes: input.bytes,
    mimeType: input.mimeType,
  })
  if (!normalizeIncludeBase64(input.output?.includeBase64)) {
    return { url: saved.url }
  }
  return {
    url: saved.url,
    base64: encodeBase64(input.bytes),
  }
}

function toImageOutputPreview(images: PilotGeneratedImage[]): string {
  if (images.length <= 0) {
    return 'No image output.'
  }
  return clipText(images.slice(0, 2).map((item, index) => `${index + 1}. ${item.url}`).join('\n'), 1_200)
}

function mapImagesToSources(images: PilotGeneratedImage[]): PilotToolSource[] {
  return images.map((item, index) => ({
    id: `image_${index + 1}`,
    url: item.url,
    title: `Generated Image ${index + 1}`,
    snippet: item.revisedPrompt || 'Generated by image model',
    domain: resolveToolDomain(item.url),
    sourceType: 'generated-image',
  }))
}

export async function executePilotWebsearchTool(
  input: ExecutePilotWebsearchToolInput,
): Promise<ExecutePilotWebsearchToolResult | null> {
  const query = normalizeText(input.query)
  if (!query) {
    return null
  }

  const callId = randomCallId()
  const toolBase = {
    callId,
    toolId: TOOL_ID,
    toolName: TOOL_NAME,
  }
  const startedAt = Date.now()
  const dataSource = await getPilotWebsearchDatasourceConfig(input.event)

  let currentRisk: PilotToolRiskLevel = 'low'
  let ticketId = ''
  let connectorSource: 'gateway' | 'responses_builtin' | 'none' = 'none'
  let connectorReason = 'pending'
  let summaryText = ''
  const domainCandidates: string[] = []
  const providerChain = dataSource.providers
    .filter(item => item.enabled !== false)
    .sort((a, b) => a.priority - b.priority)
    .map(item => item.id)
  const providerUsed: string[] = []
  let fallbackUsed = false
  let dedupeCount = 0
  const inputPreview = toInputPreview(query)
  const sources: PilotToolSource[] = []
  const requestHash = buildRequestHash(query, dataSource.allowlistDomains, dataSource.crawl.enabled, providerChain)

  await emitToolAudit(input.emitAudit, {
    auditType: 'tool.call.started',
    ...toolBase,
    riskLevel: currentRisk,
    status: 'started',
    inputPreview,
    outputPreview: '',
    durationMs: 0,
    ticketId: '',
    sources: [],
    errorCode: '',
    errorMessage: '',
    connectorSource,
    connectorReason,
    providerChain,
    providerUsed,
    fallbackUsed,
    dedupeCount,
  })

  try {
    const targetResults = Math.max(1, Number(dataSource.aggregation.targetResults || dataSource.maxResults || 6))
    const minPerProvider = Math.max(1, Number(dataSource.aggregation.minPerProvider || 1))
    const dedupeMode = dataSource.aggregation.dedupeKey
    const docMap = new Map<string, PilotWebsearchNormalizedDocument>()
    const enabledProviders = dataSource.providers
      .filter(item => item.enabled !== false)
      .sort((a, b) => a.priority - b.priority)

    for (const provider of enabledProviders) {
      const providerApiKey = resolveWebsearchProviderApiKey(provider, dataSource.apiKeyRef)
      const connector = provider.id === 'legacy-gateway'
        ? createGatewayWebsearchConnector({
            gatewayBaseUrl: provider.baseUrl,
            apiKey: providerApiKey,
          })
        : createWebsearchProviderConnector({
            providerType: provider.type,
            baseUrl: provider.baseUrl,
            apiKey: providerApiKey,
          })

      const providerMaxResults = Math.min(
        Math.max(provider.maxResults, minPerProvider),
        targetResults,
      )
      const providerContext = {
        query,
        timeoutMs: provider.timeoutMs,
        maxResults: providerMaxResults,
        crawlEnabled: dataSource.crawl.enabled,
        maxContentChars: dataSource.crawl.maxContentChars,
        allowlistDomains: dataSource.allowlistDomains,
        builtinSources: dataSource.builtinSources,
      }

      let hits: PilotWebsearchSearchHit[] = []
      try {
        hits = await connector.search(query, providerContext)
      }
      catch {
        continue
      }

      domainCandidates.push(...hits.map(item => normalizeText(item.domain).toLowerCase()).filter(Boolean))
      const beforeCount = docMap.size

      for (const hit of hits.slice(0, providerContext.maxResults)) {
        try {
          const raw = await connector.fetch(hit, providerContext)
          if (!raw) {
            continue
          }
          const extracted = await connector.extract(raw, providerContext)
          if (!extracted) {
            continue
          }
          const dedupeKey = buildDocDedupeKey(extracted, dedupeMode)
          if (docMap.has(dedupeKey)) {
            dedupeCount += 1
            continue
          }
          docMap.set(dedupeKey, extracted)
        }
        catch {
          continue
        }
      }

      if (docMap.size > beforeCount) {
        providerUsed.push(provider.id)
      }

      if (dataSource.aggregation.mode === 'sequential' && docMap.size > 0) {
        break
      }
      if (dataSource.aggregation.stopWhenEnough && docMap.size >= targetResults) {
        break
      }
    }

    if (docMap.size < targetResults && canUseResponsesBuiltinFallback(input.channel)) {
      try {
        const fallback = await executeResponsesBuiltinWebsearch({
          query,
          channel: input.channel,
          maxResults: targetResults,
        })
        fallbackUsed = true
        connectorSource = 'responses_builtin'
        connectorReason = fallback.connectorReason
        summaryText = fallback.summaryText
        domainCandidates.push(...fallback.docs.map(item => normalizeText(item.domain).toLowerCase()).filter(Boolean))
        for (const doc of fallback.docs) {
          const dedupeKey = buildDocDedupeKey(doc, dedupeMode)
          if (docMap.has(dedupeKey)) {
            dedupeCount += 1
            continue
          }
          docMap.set(dedupeKey, doc)
          if (docMap.size >= targetResults) {
            break
          }
        }
      }
      catch (fallbackError) {
        if (docMap.size <= 0) {
          throw fallbackError
        }
      }
    }

    if (docMap.size <= 0) {
      connectorSource = 'none'
      connectorReason = 'provider_pool_empty_and_fallback_unavailable'
      const missingError = new Error(connectorReason)
      ;(missingError as Error & { code?: string }).code = 'WEBSEARCH_DATASOURCE_UNAVAILABLE'
      throw missingError
    }

    if (!fallbackUsed) {
      connectorSource = 'gateway'
      connectorReason = providerUsed.length > 0
        ? `provider_pool_executed:${providerUsed.join(',')}`
        : 'provider_pool_executed:no_result_provider'
    }

    currentRisk = evaluateRiskLevel({
      crawlEnabled: dataSource.crawl.enabled,
      domains: domainCandidates,
      allowlistDomains: dataSource.allowlistDomains,
    })

    let docs = Array.from(docMap.values())
    docs = dedupeNormalizedDocuments(docs).slice(0, targetResults)

    if (currentRisk === 'high' || currentRisk === 'critical') {
      const existingTicket = await findLatestPilotToolApprovalByRequestHash(input.event, {
        sessionId: input.sessionId,
        userId: input.userId,
        requestHash,
      })

      if (existingTicket?.status === 'approved') {
        ticketId = existingTicket.ticketId
        await emitToolAudit(input.emitAudit, {
          auditType: 'tool.call.approved',
          ...toolBase,
          riskLevel: currentRisk,
          status: 'approved',
          inputPreview,
          outputPreview: '',
          durationMs: Math.max(0, Date.now() - startedAt),
          ticketId,
          sources: [],
          errorCode: '',
          errorMessage: '',
          connectorSource,
          connectorReason,
          providerChain,
          providerUsed,
          fallbackUsed,
          dedupeCount,
        })
      }
      else if (existingTicket?.status === 'rejected') {
        ticketId = existingTicket.ticketId
        const reason = normalizeText(existingTicket.decisionReason || existingTicket.reason || '')
        await emitToolAudit(input.emitAudit, {
          auditType: 'tool.call.rejected',
          ...toolBase,
          riskLevel: currentRisk,
          status: 'rejected',
          inputPreview,
          outputPreview: '',
          durationMs: Math.max(0, Date.now() - startedAt),
          ticketId,
          sources: [],
          errorCode: 'TOOL_APPROVAL_REJECTED',
          errorMessage: reason || 'Tool call rejected by approval policy.',
          connectorSource,
          connectorReason,
          providerChain,
          providerUsed,
          fallbackUsed,
          dedupeCount,
        })
        throw new PilotToolApprovalRejectedError(
          ticketId,
          callId,
          TOOL_NAME,
          currentRisk,
          reason || 'Tool call rejected by approval policy.',
        )
      }
      else {
        const pendingTicket = existingTicket && existingTicket.status === 'pending'
          ? existingTicket
          : await createPilotToolApprovalTicket(input.event, {
              sessionId: input.sessionId,
              userId: input.userId,
              requestId: input.requestId,
              requestHash,
              callId,
              toolId: TOOL_ID,
              toolName: TOOL_NAME,
              riskLevel: currentRisk,
              reason: 'High-risk domain requires approval.',
              inputPreview,
              metadata: {
                query,
                domains: domainCandidates,
              },
            })
        ticketId = pendingTicket.ticketId
        await emitToolAudit(input.emitAudit, {
          auditType: 'tool.call.approval_required',
          ...toolBase,
          riskLevel: currentRisk,
          status: 'approval_required',
          inputPreview,
          outputPreview: '',
          durationMs: Math.max(0, Date.now() - startedAt),
          ticketId,
          sources: [],
          errorCode: '',
          errorMessage: '',
          connectorSource,
          connectorReason,
          providerChain,
          providerUsed,
          fallbackUsed,
          dedupeCount,
        })
        throw new PilotToolApprovalRequiredError(
          ticketId,
          callId,
          TOOL_NAME,
          currentRisk,
          'High-risk websearch requires approval.',
        )
      }
    }

    const dedupedDocs = dedupeNormalizedDocuments(docs)
    const normalizedSources = mapDocumentsToSources(dedupedDocs)
    for (const source of normalizedSources) {
      sources.push(source)
    }
    const contextText = buildContextText(query, normalizedSources, summaryText)
    const outputPreview = toOutputPreviewWithSummary(normalizedSources, summaryText)
    const durationMs = Math.max(0, Date.now() - startedAt)

    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.completed',
      ...toolBase,
      riskLevel: currentRisk,
      status: 'completed',
      inputPreview,
      outputPreview,
      durationMs,
      ticketId,
      sources,
      errorCode: '',
      errorMessage: '',
      connectorSource,
      connectorReason,
      providerChain,
      providerUsed,
      fallbackUsed,
      dedupeCount,
    })

    if (ticketId) {
      await updatePilotToolApprovalTicketResult(input.event, {
        sessionId: input.sessionId,
        userId: input.userId,
        ticketId,
        outputPreview,
        sources: sources.map(item => ({
          id: item.id,
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          domain: item.domain,
          sourceType: item.sourceType,
          sourceRuleId: item.sourceRuleId,
        })),
      })
    }

    return {
      callId,
      toolId: TOOL_ID,
      toolName: TOOL_NAME,
      riskLevel: currentRisk,
      ticketId: ticketId || undefined,
      sources: normalizedSources,
      contextText,
      connectorSource: connectorSource === 'responses_builtin' ? 'responses_builtin' : 'gateway',
      connectorReason,
      providerChain,
      providerUsed,
      fallbackUsed,
      dedupeCount,
    }
  }
  catch (error) {
    if (error instanceof PilotToolApprovalRequiredError || error instanceof PilotToolApprovalRejectedError) {
      throw error
    }

    const durationMs = Math.max(0, Date.now() - startedAt)
    const message = error instanceof Error ? error.message : normalizeText(error)
    const code = normalizeText((error as Record<string, unknown>)?.code).toUpperCase() || 'WEBSEARCH_TOOL_FAILED'
    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.failed',
      ...toolBase,
      riskLevel: currentRisk,
      status: 'failed',
      inputPreview,
      outputPreview: '',
      durationMs,
      ticketId,
      sources: [],
      errorCode: code,
      errorMessage: message || 'Websearch tool failed',
      connectorSource,
      connectorReason,
      providerChain,
      providerUsed,
      fallbackUsed,
      dedupeCount,
    })

    if (ticketId) {
      await updatePilotToolApprovalTicketResult(input.event, {
        sessionId: input.sessionId,
        userId: input.userId,
        ticketId,
        errorCode: code,
        errorMessage: message,
      })
    }

    return null
  }
}

export async function executePilotImageGenerateTool(
  input: ExecutePilotImageGenerateToolInput,
): Promise<ExecutePilotImageGenerateToolResult | null> {
  const prompt = normalizeText(input.prompt)
  if (!prompt) {
    return null
  }
  const size = normalizeImageSize(input.size)
  const count = normalizeImageCount(input.count)

  const callId = randomCallId()
  const startedAt = Date.now()
  const toolBase = {
    callId,
    toolId: IMAGE_TOOL_ID,
    toolName: IMAGE_TOOL_NAME,
  }
  const inputPreview = toInputPreview(prompt)
  const riskLevel: PilotToolRiskLevel = 'low'

  await emitToolAudit(input.emitAudit, {
    auditType: 'tool.call.started',
    ...toolBase,
    riskLevel,
    status: 'started',
    inputPreview,
    outputPreview: '',
    durationMs: 0,
    ticketId: '',
    sources: [],
    errorCode: '',
    errorMessage: '',
  })

  try {
    if (input.channel.adapter !== 'openai') {
      throw createMediaUnsupportedError('image.generate', `Adapter ${input.channel.adapter} does not support image generation`)
    }

    const endpoint = resolveImageEndpoint(input.channel.baseUrl)
    if (!endpoint) {
      const endpointError = new Error('Image generation endpoint is not configured')
      ;(endpointError as Error & { code?: string }).code = 'IMAGE_TOOL_ENDPOINT_MISSING'
      throw endpointError
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), normalizeToolTimeoutMs(input.channel.timeoutMs))
    let response: Awaited<ReturnType<typeof networkClient.request<Record<string, unknown>>>>
    try {
      response = await networkClient.request<Record<string, unknown>>({
        method: 'POST',
        url: endpoint,
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${input.channel.apiKey}`,
        },
        body: JSON.stringify({
          model: normalizeText(input.channel.model),
          prompt,
          size,
          n: count,
          response_format: 'url',
        }),
        signal: controller.signal,
        validateStatus: ALL_HTTP_STATUS,
      })
    }
    finally {
      clearTimeout(timeout)
    }

    if (response.status < 200 || response.status >= 300) {
      const text = typeof response.data === 'string'
        ? response.data
        : safeJsonString(response.data)
      const message = `Image generation failed: ${response.status} ${text}`
      const requestError = new Error(message)
      ;(requestError as Error & { code?: string }).code = 'IMAGE_TOOL_UPSTREAM_FAILED'
      throw requestError
    }

    const payload = response.data
    const data = (payload as Record<string, unknown>).data
    const rows: unknown[] = Array.isArray(data)
      ? data
      : []
    const images: PilotGeneratedImage[] = []
    for (const item of rows) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue
      }
      const row = item as Record<string, unknown>
      const url = normalizeText(row.url)
      const b64 = normalizeText(row.b64_json)
      const revisedPrompt = normalizeText(row.revised_prompt) || undefined

      const imageFromUrl = resolveImageBinaryFromUrlField(url)
      if (imageFromUrl) {
        const media = toMediaUrlAndBase64({
          bytes: imageFromUrl.bytes,
          mimeType: imageFromUrl.mimeType,
          output: input.output,
        })
        images.push({
          url: media.url,
          revisedPrompt,
          base64: media.base64,
        })
        continue
      }

      if (url) {
        images.push({
          url,
          revisedPrompt,
        })
        continue
      }

      if (b64) {
        const b64Payload = normalizeBase64Payload(b64)
        if (!b64Payload) {
          continue
        }
        const bytes = decodeBase64(b64Payload)
        const media = toMediaUrlAndBase64({
          bytes,
          mimeType: 'image/png',
          output: input.output,
        })
        images.push({
          url: media.url,
          revisedPrompt,
          base64: media.base64,
        })
      }
    }

    if (images.length <= 0) {
      const emptyError = new Error('Image generation returned empty result')
      ;(emptyError as Error & { code?: string }).code = 'IMAGE_TOOL_EMPTY_RESULT'
      throw emptyError
    }

    const sources = mapImagesToSources(images)
    const outputPreview = toImageOutputPreview(images)
    const durationMs = Math.max(0, Date.now() - startedAt)

    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.completed',
      ...toolBase,
      riskLevel,
      status: 'completed',
      inputPreview,
      outputPreview,
      durationMs,
      ticketId: '',
      sources,
      errorCode: '',
      errorMessage: '',
    })

    return {
      ...toolBase,
      riskLevel,
      sources,
      images,
    }
  }
  catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt)
    const message = error instanceof Error ? error.message : normalizeText(error)
    const code = normalizeText((error as Record<string, unknown>)?.code).toUpperCase() || 'IMAGE_TOOL_FAILED'

    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.failed',
      ...toolBase,
      riskLevel,
      status: 'failed',
      inputPreview,
      outputPreview: '',
      durationMs,
      ticketId: '',
      sources: [],
      errorCode: code,
      errorMessage: message || 'Image generation tool failed',
    })

    throw error
  }
}

export async function executePilotImageEditTool(
  input: ExecutePilotImageEditToolInput,
): Promise<ExecutePilotImageEditToolResult | null> {
  const prompt = normalizeText(input.prompt)
  if (!prompt) {
    return null
  }

  const callId = randomCallId()
  const startedAt = Date.now()
  const riskLevel: PilotToolRiskLevel = 'low'
  const toolBase = {
    callId,
    toolId: IMAGE_EDIT_TOOL_ID,
    toolName: IMAGE_EDIT_TOOL_NAME,
  }
  const inputPreview = toInputPreview(prompt)

  await emitToolAudit(input.emitAudit, {
    auditType: 'tool.call.started',
    ...toolBase,
    riskLevel,
    status: 'started',
    inputPreview,
    outputPreview: '',
    durationMs: 0,
    ticketId: '',
    sources: [],
    errorCode: '',
    errorMessage: '',
  })

  try {
    if (input.channel.adapter !== 'openai') {
      throw createMediaUnsupportedError('image.edit', `Adapter ${input.channel.adapter} does not support image.edit`)
    }

    const endpoint = resolveImageEditEndpoint(input.channel.baseUrl)
    if (!endpoint) {
      const endpointError = new Error('Image edit endpoint is not configured')
      ;(endpointError as Error & { code?: string }).code = 'IMAGE_EDIT_TOOL_ENDPOINT_MISSING'
      throw endpointError
    }

    const form = new FormData()
    form.append('model', normalizeText(input.channel.model))
    form.append('prompt', prompt)
    form.append('size', normalizeImageSize(input.size))
    form.append('n', String(normalizeImageCount(input.count)))
    form.append('response_format', 'b64_json')
    appendFormFile(form, 'image', input.image, normalizeImageFilename(input.image.filename))
    if (input.mask?.base64) {
      appendFormFile(form, 'mask', input.mask, normalizeImageFilename(input.mask.filename, 'mask.png'))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), normalizeToolTimeoutMs(input.channel.timeoutMs))
    let response: Awaited<ReturnType<typeof networkClient.request<Record<string, unknown>>>>
    try {
      response = await networkClient.request<Record<string, unknown>>({
        method: 'POST',
        url: endpoint,
        headers: {
          authorization: `Bearer ${input.channel.apiKey}`,
        },
        body: form,
        signal: controller.signal,
        validateStatus: ALL_HTTP_STATUS,
      })
    }
    finally {
      clearTimeout(timeout)
    }

    if (response.status < 200 || response.status >= 300) {
      const text = typeof response.data === 'string'
        ? response.data
        : safeJsonString(response.data)
      const upstreamError = new Error(`Image edit failed: ${response.status} ${text}`)
      ;(upstreamError as Error & { code?: string }).code = 'IMAGE_EDIT_TOOL_UPSTREAM_FAILED'
      throw upstreamError
    }

    const payload = response.data
    const rows = Array.isArray((payload as Record<string, unknown>).data)
      ? (payload as Record<string, unknown>).data as unknown[]
      : []
    const images: PilotGeneratedImage[] = []
    for (const item of rows) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue
      }
      const row = item as Record<string, unknown>
      const url = normalizeText(row.url)
      const b64 = normalizeText(row.b64_json)
      const revisedPrompt = normalizeText(row.revised_prompt) || undefined
      if (url) {
        images.push({
          url,
          revisedPrompt,
        })
        continue
      }
      if (!b64) {
        continue
      }
      const bytes = decodeBase64(b64)
      const media = toMediaUrlAndBase64({
        bytes,
        mimeType: 'image/png',
        output: input.output,
      })
      images.push({
        url: media.url,
        revisedPrompt,
        base64: media.base64,
      })
    }

    if (images.length <= 0) {
      const emptyError = new Error('Image edit returned empty result')
      ;(emptyError as Error & { code?: string }).code = 'IMAGE_EDIT_TOOL_EMPTY_RESULT'
      throw emptyError
    }

    const sources = mapImagesToSources(images)
    const outputPreview = toImageOutputPreview(images)
    const durationMs = Math.max(0, Date.now() - startedAt)

    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.completed',
      ...toolBase,
      riskLevel,
      status: 'completed',
      inputPreview,
      outputPreview,
      durationMs,
      ticketId: '',
      sources,
      errorCode: '',
      errorMessage: '',
    })

    return {
      ...toolBase,
      riskLevel,
      sources,
      images,
    }
  }
  catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt)
    const message = error instanceof Error ? error.message : normalizeText(error)
    const code = normalizeText((error as Record<string, unknown>)?.code).toUpperCase() || 'IMAGE_EDIT_TOOL_FAILED'
    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.failed',
      ...toolBase,
      riskLevel,
      status: 'failed',
      inputPreview,
      outputPreview: '',
      durationMs,
      ticketId: '',
      sources: [],
      errorCode: code,
      errorMessage: message || 'Image edit tool failed',
    })
    throw error
  }
}

export async function executePilotAudioTtsTool(
  input: ExecutePilotAudioTtsToolInput,
): Promise<ExecutePilotAudioTtsToolResult | null> {
  const text = normalizeText(input.text)
  if (!text) {
    return null
  }

  const callId = randomCallId()
  const startedAt = Date.now()
  const riskLevel: PilotToolRiskLevel = 'low'
  const toolBase = {
    callId,
    toolId: AUDIO_TTS_TOOL_ID,
    toolName: AUDIO_TTS_TOOL_NAME,
  }
  const inputPreview = toInputPreview(text)

  await emitToolAudit(input.emitAudit, {
    auditType: 'tool.call.started',
    ...toolBase,
    riskLevel,
    status: 'started',
    inputPreview,
    outputPreview: '',
    durationMs: 0,
    ticketId: '',
    sources: [],
    errorCode: '',
    errorMessage: '',
  })

  try {
    if (input.channel.adapter !== 'openai') {
      throw createMediaUnsupportedError('audio.tts', `Adapter ${input.channel.adapter} does not support audio.tts`)
    }

    const endpoint = resolveAudioSpeechEndpoint(input.channel.baseUrl)
    if (!endpoint) {
      const endpointError = new Error('Audio speech endpoint is not configured')
      ;(endpointError as Error & { code?: string }).code = 'AUDIO_TTS_ENDPOINT_MISSING'
      throw endpointError
    }

    const format = normalizeText(input.format).toLowerCase() || 'mp3'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), normalizeToolTimeoutMs(input.channel.timeoutMs))
    let response: Awaited<ReturnType<typeof networkClient.request<ArrayBuffer | Record<string, unknown>>>>
    try {
      response = await networkClient.request<ArrayBuffer | Record<string, unknown>>({
        method: 'POST',
        url: endpoint,
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${input.channel.apiKey}`,
        },
        body: {
          model: normalizeText(input.channel.model),
          input: text,
          voice: normalizeText(input.voice) || 'alloy',
          response_format: format,
        },
        signal: controller.signal,
        validateStatus: ALL_HTTP_STATUS,
        responseType: 'arrayBuffer',
      })
    }
    finally {
      clearTimeout(timeout)
    }

    if (response.status < 200 || response.status >= 300) {
      const failed = response.data instanceof ArrayBuffer
        ? Buffer.from(response.data).toString('utf-8')
        : safeJsonString(response.data)
      const upstreamError = new Error(`Audio tts failed: ${response.status} ${failed}`)
      ;(upstreamError as Error & { code?: string }).code = 'AUDIO_TTS_UPSTREAM_FAILED'
      throw upstreamError
    }

    const rawBytes = response.data instanceof ArrayBuffer
      ? new Uint8Array(response.data)
      : new Uint8Array()
    if (rawBytes.byteLength <= 0) {
      const emptyError = new Error('Audio tts returned empty result')
      ;(emptyError as Error & { code?: string }).code = 'AUDIO_TTS_EMPTY_RESULT'
      throw emptyError
    }
    const mimeType = resolveAudioMimeTypeByFormat(format)
    const media = toMediaUrlAndBase64({
      bytes: rawBytes,
      mimeType,
      output: input.output,
    })
    const audio: PilotGeneratedAudio = {
      url: media.url,
      mimeType,
      base64: media.base64,
    }

    const sources: PilotToolSource[] = [
      {
        id: 'audio_1',
        url: audio.url,
        title: 'Generated Audio',
        snippet: 'Generated by audio.tts model',
        domain: resolveToolDomain(audio.url),
        sourceType: 'generated-audio',
      },
    ]
    const outputPreview = clipText(audio.url, 300)
    const durationMs = Math.max(0, Date.now() - startedAt)

    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.completed',
      ...toolBase,
      riskLevel,
      status: 'completed',
      inputPreview,
      outputPreview,
      durationMs,
      ticketId: '',
      sources,
      errorCode: '',
      errorMessage: '',
    })

    return {
      ...toolBase,
      riskLevel,
      sources,
      audio,
    }
  }
  catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt)
    const message = error instanceof Error ? error.message : normalizeText(error)
    const code = normalizeText((error as Record<string, unknown>)?.code).toUpperCase() || 'AUDIO_TTS_FAILED'
    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.failed',
      ...toolBase,
      riskLevel,
      status: 'failed',
      inputPreview,
      outputPreview: '',
      durationMs,
      ticketId: '',
      sources: [],
      errorCode: code,
      errorMessage: message || 'Audio tts tool failed',
    })
    throw error
  }
}

async function executePilotAudioTranscribeInternal(
  input: ExecutePilotAudioTranscribeToolInput,
  capability: 'audio.stt' | 'audio.transcribe',
): Promise<ExecutePilotAudioTranscribeToolResult | null> {
  const b64 = normalizeBase64(input.audio.base64)
  if (!b64) {
    return null
  }

  const callId = randomCallId()
  const startedAt = Date.now()
  const riskLevel: PilotToolRiskLevel = 'low'
  const toolBase = {
    callId,
    toolId: capability === 'audio.stt' ? AUDIO_STT_TOOL_ID : AUDIO_TRANSCRIBE_TOOL_ID,
    toolName: capability === 'audio.stt' ? AUDIO_STT_TOOL_NAME : AUDIO_TRANSCRIBE_TOOL_NAME,
  }
  const inputPreview = toInputPreview(`bytes:${b64.length}`)

  await emitToolAudit(input.emitAudit, {
    auditType: 'tool.call.started',
    ...toolBase,
    riskLevel,
    status: 'started',
    inputPreview,
    outputPreview: '',
    durationMs: 0,
    ticketId: '',
    sources: [],
    errorCode: '',
    errorMessage: '',
  })

  try {
    if (input.channel.adapter !== 'openai') {
      throw createMediaUnsupportedError(capability, `Adapter ${input.channel.adapter} does not support ${capability}`)
    }

    const endpoint = resolveAudioTranscriptionsEndpoint(input.channel.baseUrl)
    if (!endpoint) {
      const endpointError = new Error('Audio transcriptions endpoint is not configured')
      ;(endpointError as Error & { code?: string }).code = 'AUDIO_TRANSCRIBE_ENDPOINT_MISSING'
      throw endpointError
    }

    const form = new FormData()
    form.append('model', normalizeText(input.channel.model))
    appendFormFile(form, 'file', input.audio, normalizeAudioFilename(input.audio.filename))
    const language = normalizeText(input.language)
    const prompt = normalizeText(input.prompt)
    if (language) {
      form.append('language', language)
    }
    if (prompt) {
      form.append('prompt', prompt)
    }
    if (Number.isFinite(Number(input.temperature))) {
      form.append('temperature', String(input.temperature))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), normalizeToolTimeoutMs(input.channel.timeoutMs))
    let response: Awaited<ReturnType<typeof networkClient.request<Record<string, unknown>>>>
    try {
      response = await networkClient.request<Record<string, unknown>>({
        method: 'POST',
        url: endpoint,
        headers: {
          authorization: `Bearer ${input.channel.apiKey}`,
        },
        body: form,
        signal: controller.signal,
        validateStatus: ALL_HTTP_STATUS,
      })
    }
    finally {
      clearTimeout(timeout)
    }

    if (response.status < 200 || response.status >= 300) {
      const text = typeof response.data === 'string'
        ? response.data
        : safeJsonString(response.data)
      const upstreamError = new Error(`Audio transcription failed: ${response.status} ${text}`)
      ;(upstreamError as Error & { code?: string }).code = 'AUDIO_TRANSCRIBE_UPSTREAM_FAILED'
      throw upstreamError
    }

    const payload = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data as Record<string, unknown>
      : {}
    const text = normalizeText(payload.text)
    if (!text) {
      const emptyError = new Error('Audio transcription returned empty text')
      ;(emptyError as Error & { code?: string }).code = 'AUDIO_TRANSCRIBE_EMPTY_RESULT'
      throw emptyError
    }
    const result: ExecutePilotAudioTranscribeToolResult = {
      ...toolBase,
      riskLevel,
      sources: [],
      text,
      language: normalizeText(payload.language) || undefined,
      durationSeconds: Number.isFinite(Number(payload.duration))
        ? Number(payload.duration)
        : undefined,
    }
    const durationMs = Math.max(0, Date.now() - startedAt)
    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.completed',
      ...toolBase,
      riskLevel,
      status: 'completed',
      inputPreview,
      outputPreview: clipText(text, 300),
      durationMs,
      ticketId: '',
      sources: [],
      errorCode: '',
      errorMessage: '',
    })
    return result
  }
  catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt)
    const message = error instanceof Error ? error.message : normalizeText(error)
    const code = normalizeText((error as Record<string, unknown>)?.code).toUpperCase() || 'AUDIO_TRANSCRIBE_FAILED'
    await emitToolAudit(input.emitAudit, {
      auditType: 'tool.call.failed',
      ...toolBase,
      riskLevel,
      status: 'failed',
      inputPreview,
      outputPreview: '',
      durationMs,
      ticketId: '',
      sources: [],
      errorCode: code,
      errorMessage: message || 'Audio transcribe tool failed',
    })
    throw error
  }
}

export async function executePilotAudioSttTool(
  input: ExecutePilotAudioTranscribeToolInput,
): Promise<ExecutePilotAudioTranscribeToolResult | null> {
  return await executePilotAudioTranscribeInternal(input, 'audio.stt')
}

export async function executePilotAudioTranscribeTool(
  input: ExecutePilotAudioTranscribeToolInput,
): Promise<ExecutePilotAudioTranscribeToolResult | null> {
  return await executePilotAudioTranscribeInternal(input, 'audio.transcribe')
}

export function mergeWebsearchContextIntoMessage(message: string, contextText: string): string {
  const question = normalizeText(message)
  const context = normalizeText(contextText)
  if (!question || !context) {
    return question
  }
  return `${question}\n\n[External Sources]\n${context}\n\nPlease prioritize factual consistency with the references above and cite source indices when useful.`
}
