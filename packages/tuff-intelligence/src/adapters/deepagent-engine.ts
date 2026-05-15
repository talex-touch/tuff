import type { SubAgent } from 'deepagents'
import type { StructuredTool } from '@langchain/core/tools'
import { networkClient } from '@talex-touch/utils/network'
import type { AgentEngineAdapter } from './engine'
import type { AgentErrorDetail } from '../protocol/error-detail'
import type { TurnState } from '../protocol/session'
import type { AnyTuffTool, TuffToolApprovalGate, TuffToolContext } from '../tools/types'
import { toAgentErrorDetail } from '../protocol/error-detail'
import { LangChainEngineAdapter } from './langchain-engine'
import { LangChainToolAdapter } from './langchain-tool-adapter'
import {
  buildDeepAgentMessages,
  buildResponsesInput,
} from './deepagent-input'

export { buildChatMessageContent, buildResponsesInput, resolveAttachmentImageUrl } from './deepagent-input'

export interface DeepAgentAuditRecord {
  type: string
  payload: Record<string, unknown>
}

export type DeepAgentErrorDetail = AgentErrorDetail

export interface DeepAgentResponsesResult {
  content: string
  provider?: string
  model?: string
}

export type DeepAgentPromptResolver =
  | string
  | ((state: TurnState) => string | Promise<string>)

export interface DeepAgentSubAgentConfig {
  name: string
  description: string
  systemPrompt?: string
  prompt?: string
  tools?: string[]
}

export interface DeepAgentEngineOptions {
  baseUrl?: string
  apiKey?: string
  model?: string
  transport?: 'auto' | 'responses' | 'chat.completions'
  timeoutMs?: number
  retryCount?: number
  temperature?: number
  maxTokens?: number
  metadata?: Record<string, unknown>
  instructions?: DeepAgentPromptResolver
  systemPrompt?: DeepAgentPromptResolver
  subagents?: DeepAgentSubAgentConfig[]
  builtinTools?: Array<'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls'>
  tools?: StructuredTool[]
  tuffTools?: AnyTuffTool[]
  toolApprovalGate?: TuffToolApprovalGate
  toolContext?: TuffToolContext
  onAudit?: (record: DeepAgentAuditRecord) => Promise<void> | void
}

const FALLBACK_MODEL = 'gpt-5.4'
const DEFAULT_BUILTIN_TOOLS: Array<'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls'> = ['write_todos']

const OPENAI_CHAT_SUFFIXES = ['/chat/completions', '/completions']
const OPENAI_RESPONSES_SUFFIXES = ['/v1/responses', '/responses']
const OPENAI_VERSION_SUFFIXES = ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']
const UNSUPPORTED_CHAT_COMPLETIONS_BASE_URLS = new Set<string>()

type LangChainOpenAiModule = typeof import('@langchain/openai')
type DeepAgentsModule = typeof import('deepagents')

let langChainOpenAiModulePromise: Promise<LangChainOpenAiModule> | null = null
let deepAgentsModulePromise: Promise<DeepAgentsModule> | null = null

export function createDeepAgentToolsFromTuff(
  tools: AnyTuffTool[],
  options: {
    approvalGate?: TuffToolApprovalGate
    context?: TuffToolContext
  } = {},
): StructuredTool[] {
  return LangChainToolAdapter.fromTuffTools(tools, {
    approvalGate: options.approvalGate,
    context: options.context,
  })
}

function resolveCustomTools(options: DeepAgentEngineOptions): StructuredTool[] {
  const directTools = Array.isArray(options.tools) ? options.tools : []
  const tuffTools = Array.isArray(options.tuffTools)
    ? createDeepAgentToolsFromTuff(options.tuffTools, {
        approvalGate: options.toolApprovalGate,
        context: options.toolContext,
      })
    : []
  return [...directTools, ...tuffTools]
}

async function getChatOpenAIConstructor(): Promise<LangChainOpenAiModule['ChatOpenAI']> {
  if (!langChainOpenAiModulePromise) {
    langChainOpenAiModulePromise = import('@langchain/openai')
  }
  const module = await langChainOpenAiModulePromise
  return module.ChatOpenAI
}

async function getCreateDeepAgent(): Promise<DeepAgentsModule['createDeepAgent']> {
  if (!deepAgentsModulePromise) {
    deepAgentsModulePromise = import('deepagents')
  }
  const module = await deepAgentsModulePromise
  return module.createDeepAgent
}

function normalizeTransport(value: unknown): 'auto' | 'responses' | 'chat.completions' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'responses') {
    return 'responses'
  }
  if (normalized === 'chat.completions' || normalized === 'chat_completions' || normalized === 'completions') {
    return 'chat.completions'
  }
  return 'auto'
}

function toBooleanFlag(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on'
}

function shouldUseDirectStream(options: DeepAgentEngineOptions): boolean {
  if (Array.isArray(options.tools) && options.tools.length > 0) {
    return false
  }
  const metadata = toRecord(options.metadata)
  if (toBooleanFlag(metadata.forceDirectStream)) {
    return true
  }
  if (toBooleanFlag(metadata.disableDirectStream)) {
    return false
  }
  return true
}

function trimSuffixSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function extractResponsesText(payload: Record<string, unknown>): string {
  const outputText = String(payload.output_text || '').trim()
  if (outputText) {
    return outputText
  }

  const nested = toRecord(payload.response)
  const nestedOutputText = String(nested.output_text || '').trim()
  if (nestedOutputText) {
    return nestedOutputText
  }

  const output = Array.isArray(payload.output) ? payload.output : []
  const texts: string[] = []
  for (const entry of output) {
    const outputItem = toRecord(entry)
    const contentList = Array.isArray(outputItem.content) ? outputItem.content : []
    for (const content of contentList) {
      const contentItem = toRecord(content)
      const text = String(contentItem.text || contentItem.output_text || '').trim()
      if (text) {
        texts.push(text)
      }
    }
  }

  if (texts.length > 0) {
    return texts.join('\n').trim()
  }

  return ''
}

interface ParsedResponsesSsePayload {
  content: string
  model?: string
}

function trimSseDataPrefix(line: string): string {
  if (!line.startsWith('data:')) {
    return line
  }
  const sliced = line.slice(5)
  return sliced.startsWith(' ') ? sliced.slice(1) : sliced
}

function tryParseResponsesSsePayload(bodyText: string): ParsedResponsesSsePayload | null {
  const raw = String(bodyText || '')
  if (!raw.includes('data:') || !raw.includes('event:')) {
    return null
  }

  const lines = raw.split(/\r?\n/)
  const dataLines: string[] = []
  let mergedDelta = ''
  let resolvedText = ''
  let resolvedModel = ''

  const flushData = () => {
    if (dataLines.length <= 0) {
      return
    }

    const payloadText = dataLines.join('\n').trim()
    dataLines.length = 0
    if (!payloadText || payloadText === '[DONE]') {
      return
    }

    let parsed: unknown = null
    try {
      parsed = JSON.parse(payloadText)
    }
    catch {
      return
    }

    const row = toRecord(parsed)
    const type = String(row.type || '').trim().toLowerCase()
    const responseRow = toRecord(row.response)
    const model = String(responseRow.model || '').trim()
    if (model) {
      resolvedModel = model
    }

    if (type === 'response.output_text.delta') {
      const delta = typeof row.delta === 'string' ? row.delta : ''
      if (delta) {
        mergedDelta += delta
      }
      return
    }

    if (type === 'response.output_text.done') {
      const doneText = typeof row.text === 'string' ? row.text.trim() : ''
      if (doneText) {
        resolvedText = doneText
      }
      return
    }

    if (type === 'response.completed') {
      const doneText = extractResponsesText(responseRow)
      if (doneText) {
        resolvedText = doneText
      }
      return
    }

    const directText = extractResponsesText(row)
    if (directText) {
      resolvedText = directText
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushData()
      continue
    }
    if (line.startsWith('event:')) {
      flushData()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(trimSseDataPrefix(line))
      continue
    }

    if (dataLines.length > 0) {
      dataLines.push(line)
    }
  }
  flushData()

  const content = (resolvedText || mergedDelta).trim()
  if (!content) {
    return null
  }

  return {
    content,
    model: resolvedModel || undefined,
  }
}

function stripKnownSuffix(value: string, suffixes: string[]): string {
  const normalized = trimSuffixSlash(value)
  const lower = normalized.toLowerCase()
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      return trimSuffixSlash(normalized.slice(0, -suffix.length))
    }
  }
  return normalized
}

function normalizeRelayBaseUrl(baseUrl: string): string {
  const trimmed = trimSuffixSlash(baseUrl)
  const withoutResponses = stripKnownSuffix(trimmed, OPENAI_RESPONSES_SUFFIXES)
  const withoutCompletions = stripKnownSuffix(withoutResponses, OPENAI_CHAT_SUFFIXES)
  const lower = withoutCompletions.toLowerCase()
  if (OPENAI_VERSION_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return withoutCompletions
  }
  return `${withoutCompletions}/v1`
}

function resolveRelayBaseUrl(options: DeepAgentEngineOptions): string {
  const baseUrl = String(options.baseUrl || '').trim()
  if (baseUrl) {
    return normalizeRelayBaseUrl(baseUrl)
  }
  return ''
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeMessageType(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '')
}

function extractTextParts(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (!content) {
    return ''
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim()
        }
        const row = toRecord(entry)
        return String(row.text || row.output_text || row.content || '').trim()
      })
      .filter(Boolean)
    if (parts.length > 0) {
      return parts.join('\n').trim()
    }
  }

  const row = toRecord(content)
  const text = String(row.text || row.output_text || row.content || '').trim()
  if (text) {
    return text
  }

  const kwargs = toRecord(row.kwargs)
  const nested = extractTextParts(kwargs.content)
  if (nested) {
    return nested
  }

  return ''
}

function extractTextPartsPreserve(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!content) {
    return ''
  }

  if (Array.isArray(content)) {
    const parts = content.map((entry) => {
      if (typeof entry === 'string') {
        return entry
      }
      const row = toRecord(entry)
      if (typeof row.text === 'string') {
        return row.text
      }
      if (typeof row.output_text === 'string') {
        return row.output_text
      }
      if (typeof row.content === 'string') {
        return row.content
      }
      const delta = toRecord(row.delta)
      if (typeof delta.text === 'string') {
        return delta.text
      }
      return ''
    })
    const merged = parts.join('')
    if (merged) {
      return merged
    }
  }

  const row = toRecord(content)
  if (typeof row.text === 'string') {
    return row.text
  }
  if (typeof row.output_text === 'string') {
    return row.output_text
  }
  if (typeof row.content === 'string') {
    return row.content
  }

  const delta = toRecord(row.delta)
  if (typeof delta.text === 'string') {
    return delta.text
  }

  const kwargs = toRecord(row.kwargs)
  const nested = extractTextPartsPreserve(kwargs.content)
  if (nested) {
    return nested
  }

  const lcKwargs = toRecord(row.lc_kwargs)
  const lcNested = extractTextPartsPreserve(lcKwargs.content)
  if (lcNested) {
    return lcNested
  }

  const additionalKwargs = toRecord(row.additional_kwargs)
  if (typeof additionalKwargs.text === 'string') {
    return additionalKwargs.text
  }
  if (typeof additionalKwargs.output_text === 'string') {
    return additionalKwargs.output_text
  }
  const additionalNested = extractTextPartsPreserve(additionalKwargs.content)
  if (additionalNested) {
    return additionalNested
  }

  return ''
}

function extractThinkingPartsPreserve(content: unknown, depth = 0): string {
  if (depth > 4 || content === null || content === undefined) {
    return ''
  }

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const parts = content.map((entry) => {
      if (typeof entry === 'string') {
        return ''
      }
      const row = toRecord(entry)
      const type = String(row.type || '').trim().toLowerCase()
      if (type.includes('reasoning') || type.includes('thinking')) {
        const direct = extractTextPartsPreserve(
          row.text
          ?? row.summary
          ?? row.reasoning
          ?? row.thinking
          ?? row.content
          ?? row.delta,
        )
        if (direct) {
          return direct
        }
      }
      return extractThinkingPartsPreserve(
        row.reasoning
        ?? row.thinking
        ?? row.analysis
        ?? row.summary
        ?? row.delta
        ?? row.payload,
        depth + 1,
      )
    }).filter(Boolean)
    return parts.join('')
  }

  const row = toRecord(content)
  const directCandidates = [
    row.reasoning_text,
    row.thinking_text,
    row.reasoning,
    row.thinking,
    row.analysis,
    row.summary,
  ]
  for (const candidate of directCandidates) {
    const direct = extractTextPartsPreserve(candidate)
    if (direct) {
      return direct
    }
  }

  const nestedCandidates = [
    row.delta,
    row.kwargs,
    row.lc_kwargs,
    row.additional_kwargs,
    row.response_metadata,
    row.payload,
    row.data,
    row.message,
    row.output,
    row.result,
  ]
  for (const candidate of nestedCandidates) {
    const nested = extractThinkingPartsPreserve(candidate, depth + 1)
    if (nested) {
      return nested
    }
  }

  return ''
}

function toIncrementalChunk(previous: string, nextChunk: string): string {
  if (!nextChunk) {
    return ''
  }
  if (!previous) {
    return nextChunk
  }
  if (nextChunk.startsWith(previous)) {
    return nextChunk.slice(previous.length)
  }
  return nextChunk
}

function resolveMessageType(message: unknown): string {
  const row = toRecord(message)
  const role = normalizeMessageType(row.role || row.type)
  if (role) {
    return role
  }
  const getType = row._getType
  if (typeof getType === 'function') {
    try {
      const value = getType()
      return normalizeMessageType(value)
    }
    catch {
      return ''
    }
  }
  const kwargs = toRecord(row.kwargs)
  return normalizeMessageType(kwargs.role || kwargs.type)
}

function isAssistantMessage(message: unknown): boolean {
  const type = resolveMessageType(message)
  return type === 'assistant'
    || type === 'ai'
    || type === 'aimessage'
    || type === 'aimessagechunk'
    || type === 'assistantmessage'
    || type === 'assistantmessagechunk'
}

function extractAssistantDeltaFromMessage(message: unknown): string {
  if (!isAssistantMessage(message)) {
    return ''
  }

  const row = toRecord(message)
  const direct = extractTextPartsPreserve(row.content)
  if (direct) {
    return direct
  }

  const kwargs = toRecord(row.kwargs)
  const nested = extractTextPartsPreserve(kwargs.content)
  if (nested) {
    return nested
  }

  const lcKwargs = toRecord(row.lc_kwargs)
  return extractTextPartsPreserve(lcKwargs.content)
}

function isLikelyLangGraphMessage(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = toRecord(value)
  return 'content' in row || 'kwargs' in row || 'lc_kwargs' in row || '_getType' in row || 'role' in row || 'type' in row
}

function isLangGraphMessageTuple(value: unknown): value is [unknown, Record<string, unknown>] {
  if (!Array.isArray(value) || value.length !== 2) {
    return false
  }
  return isLikelyLangGraphMessage(value[0]) && (typeof value[1] === 'object' || value[1] === null || value[1] === undefined)
}

function extractLangGraphMessagesTuple(
  chunk: unknown,
  depth = 0,
): [unknown, Record<string, unknown>] | null {
  if (depth > 4) {
    return null
  }

  if (Array.isArray(chunk)) {
    if (isLangGraphMessageTuple(chunk)) {
      return [chunk[0], toRecord(chunk[1])]
    }

    if (chunk.length >= 2 && chunk[0] === 'messages' && isLangGraphMessageTuple(chunk[1])) {
      return [chunk[1][0], toRecord(chunk[1][1])]
    }

    if (chunk.length >= 2 && Array.isArray(chunk[0]) && isLangGraphMessageTuple(chunk[1])) {
      return [chunk[1][0], toRecord(chunk[1][1])]
    }

    if (chunk.length >= 3 && Array.isArray(chunk[0]) && chunk[1] === 'messages' && isLangGraphMessageTuple(chunk[2])) {
      return [chunk[2][0], toRecord(chunk[2][1])]
    }

    for (const item of chunk) {
      const nested = extractLangGraphMessagesTuple(item, depth + 1)
      if (nested) {
        return nested
      }
    }
    return null
  }

  if (chunk && typeof chunk === 'object') {
    const row = toRecord(chunk)
    const candidates = [
      row.messages,
      row.data,
      row.payload,
      row.chunk,
      row.event,
      row.value,
      row.output,
      row.result,
      row.delta,
    ]
    for (const candidate of candidates) {
      const nested = extractLangGraphMessagesTuple(candidate, depth + 1)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

function extractLangGraphEventDelta(event: unknown): string {
  const row = toRecord(event)
  const eventName = String(row.event || '').trim().toLowerCase()
  if (!eventName.includes('stream')) {
    return ''
  }

  const data = toRecord(row.data)
  const chunk = data.chunk ?? data.output ?? data.message ?? data.delta ?? data.text

  if (typeof chunk === 'string') {
    return chunk
  }

  if (!chunk || typeof chunk !== 'object') {
    return ''
  }

  const chunkRow = toRecord(chunk)
  const direct = extractTextPartsPreserve(chunkRow.content)
  if (direct) {
    return direct
  }

  if (typeof chunkRow.text === 'string') {
    return chunkRow.text
  }
  if (typeof chunkRow.output_text === 'string') {
    return chunkRow.output_text
  }

  const kwargs = toRecord(chunkRow.kwargs)
  return extractTextPartsPreserve(kwargs.content)
}

function extractLangGraphEventThinkingDelta(event: unknown): string {
  const row = toRecord(event)
  const data = toRecord(row.data)
  const chunk = data.chunk ?? data.output ?? data.message ?? data.delta ?? data.text ?? data.reasoning
  return extractThinkingPartsPreserve(chunk)
}

function extractDeepAgentText(payload: Record<string, unknown>): string {
  const outputText = String(payload.output_text || payload.text || payload.result || '').trim()
  if (outputText) {
    return outputText
  }

  const messages = asArray(payload.messages)
  for (let index = messages.length - 1; index >= 0; index--) {
    const current = messages[index]
    const type = resolveMessageType(current)
    if (
      type !== 'assistant'
      && type !== 'ai'
      && type !== 'aimessage'
      && type !== 'assistantmessage'
      && type !== 'aimessagechunk'
      && type !== 'assistantmessagechunk'
    ) {
      continue
    }
    const row = toRecord(current)
    const direct = extractTextParts(row.content)
    if (direct) {
      return direct
    }
    const kwargs = toRecord(row.kwargs)
    const nested = extractTextParts(kwargs.content)
    if (nested) {
      return nested
    }
  }

  return ''
}

function getDeepAgentTodoCount(payload: Record<string, unknown>): number {
  const todos = asArray(payload.todos)
  if (todos.length > 0) {
    return todos.length
  }
  const state = toRecord(payload.state)
  return asArray(state.todos).length
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  }
  catch {
    return String(error)
  }
}

function extractStatusCode(error: unknown): number | undefined {
  const row = toRecord(error)
  const response = toRecord(row.response)
  const candidates = [
    row.statusCode,
    row.status,
    response.status,
    response.statusCode,
  ]

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return undefined
}

export function toDeepAgentErrorDetail(
  error: unknown,
  extras: Partial<DeepAgentErrorDetail> = {},
): DeepAgentErrorDetail {
  return toAgentErrorDetail(error, extras)
}

function createDeepAgentError(message: string, detail: Partial<DeepAgentErrorDetail>): Error {
  const error = new Error(message)
  Object.assign(error, detail)
  if (detail.cause) {
    error.cause = detail.cause
  }
  return error
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function resolveTimeoutMs(options: DeepAgentEngineOptions): number {
  return Math.max(3_000, Number(options.timeoutMs || 25_000))
}

interface RelayFetchResponse {
  status: number
  statusText: string
  ok: boolean
  headers: Record<string, string>
  bodyText: string
}

function toNetworkHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized = new Headers(headers || {})
  return Object.fromEntries(normalized.entries())
}

function toNetworkMethod(method: string | undefined): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' {
  const normalized = String(method || 'GET').toUpperCase()
  switch (normalized) {
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'HEAD':
    case 'OPTIONS':
      return normalized
    case 'GET':
    default:
      return 'GET'
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  detail: { endpoint: string, model?: string, phase: string },
): Promise<RelayFetchResponse> {
  try {
    const response = await networkClient.request<string>({
      url,
      method: toNetworkMethod(init.method),
      headers: toNetworkHeaders(init.headers),
      body: init.body,
      timeoutMs,
      responseType: 'text',
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    })
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: response.headers,
      bodyText: String(response.data || ''),
    }
  }
  catch (error) {
    const message = String((error as Error)?.message || '').toLowerCase()
    const name = String((error as Error)?.name || '').toLowerCase()
    if (
      name === 'aborterror'
      || message.includes('aborted')
      || message.includes('abort')
      || message.includes('timeout')
      || message.includes('timed out')
    ) {
      throw createDeepAgentError(
        `[deepagent-timeout] request timed out after ${timeoutMs}ms`,
        {
          ...detail,
          statusCode: 504,
          statusMessage: 'Gateway Timeout',
          cause: error,
        },
      )
    }
    throw error
  }
}

function isRetryableError(error: unknown): boolean {
  const statusCode = extractStatusCode(error)
  if (typeof statusCode === 'number') {
    if (statusCode >= 500) {
      return true
    }
    return false
  }

  const message = errorMessageOf(error).toLowerCase()
  return [
    'network',
    'fetch',
    'socket hang up',
    'timeout',
    'timed out',
    'aborterror',
    'aborted',
    'econnreset',
    'econnrefused',
    'service unavailable',
    'bad gateway',
  ].some(pattern => message.includes(pattern))
}

async function resolvePrompt(
  resolver: DeepAgentPromptResolver | undefined,
  state: TurnState,
): Promise<string> {
  if (!resolver) {
    return ''
  }
  if (typeof resolver === 'function') {
    return String(await resolver(state) || '').trim()
  }
  return String(resolver || '').trim()
}

async function resolveInstructions(
  state: TurnState,
  options: DeepAgentEngineOptions,
): Promise<string | undefined> {
  const [systemPrompt, instructions] = await Promise.all([
    resolvePrompt(options.systemPrompt, state),
    resolvePrompt(options.instructions, state),
  ])

  const segments = [systemPrompt, instructions].filter(Boolean)
  if (segments.length === 0) {
    return undefined
  }

  return segments.join('\n\n').trim()
}

function toSubagents(subagents: DeepAgentSubAgentConfig[] | undefined): SubAgent[] {
  if (!Array.isArray(subagents) || subagents.length === 0) {
    return []
  }

  const result: SubAgent[] = []
  for (const item of subagents) {
    const name = String(item.name || '').trim()
    const description = String(item.description || '').trim()
    const prompt = String(item.systemPrompt || item.prompt || '').trim()
    if (!name || !description || !prompt) {
      continue
    }
    result.push({
      name,
      description,
      prompt,
      tools: Array.isArray(item.tools) ? item.tools.map(tool => String(tool || '').trim()).filter(Boolean) : undefined,
    })
  }

  return result
}

async function invokeWithRetry<T>(
  invoke: (attempt: number) => Promise<T>,
  retryCount: number,
): Promise<T> {
  let attempt = 0
  let lastError: unknown
  while (attempt <= retryCount) {
    try {
      return await invoke(attempt)
    }
    catch (error) {
      lastError = error
      if (attempt >= retryCount || !isRetryableError(error)) {
        throw error
      }
      await sleep(Math.min(2_000, 250 * (attempt + 1)))
      attempt += 1
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('invoke retry failed'))
}

function shouldUseDirectResponsesFallback(error: unknown): boolean {
  const message = errorMessageOf(error).toLowerCase()
  return message.includes('unsupported legacy protocol')
    || message.includes('/v1/chat/completions is not supported')
    || (
      message.includes("cannot use 'in' operator to search for 'object'")
      && message.includes('event: response.')
    )
}

function shouldFallbackToChatCompletions(error: unknown): boolean {
  const statusCode = extractStatusCode(error)
  if (statusCode === 404 || statusCode === 405 || statusCode === 501) {
    return true
  }

  const message = errorMessageOf(error).toLowerCase()
  if (!message.includes('/responses')) {
    return false
  }

  return message.includes('not found')
    || message.includes('unsupported')
    || message.includes('legacy protocol')
}

function resolveResponsesEndpoint(
  relayBaseUrl: string,
): string {
  const trimmed = trimSuffixSlash(relayBaseUrl)
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/responses`
  }
  return `${trimmed}/v1/responses`
}

async function invokeDirectResponsesFallback(params: {
  state: TurnState
  options: DeepAgentEngineOptions
  relayBaseUrl: string
  effectiveApiKey: string
  model: string
  retryCount: number
}): Promise<DeepAgentResponsesResult> {
  const { state, options, relayBaseUrl, effectiveApiKey, model, retryCount } = params
  const endpoint = resolveResponsesEndpoint(relayBaseUrl)
  const timeoutMs = resolveTimeoutMs(options)

  await options.onAudit?.({
    type: 'upstream.direct_responses_fallback',
    payload: {
      reason: 'chat_completions_not_supported',
      endpoint,
      model,
      strategy: 'responses.direct',
    },
  })

  let lastAttempt = 0
  const response = await invokeWithRetry(async (attempt) => {
    lastAttempt = attempt
    if (attempt > 0) {
      await options.onAudit?.({
        type: 'upstream.retry',
        payload: {
          endpoint,
          attempt,
          model,
          strategy: 'responses.direct',
        },
      })
    }

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model,
        input: buildResponsesInput(state),
        stream: false,
        metadata: {
          sessionId: state.sessionId,
          ...toRecord(options.metadata),
        },
      }),
    }, timeoutMs, {
      endpoint,
      model,
      phase: 'upstream.responses.fetch',
    })

    if (response.status >= 500) {
      const retryBody = normalizeErrorBody(response.bodyText, response.status, response.statusText)
      throw createDeepAgentError(
        `[deepagent-responses-retryable] ${response.status} ${retryBody || response.statusText}`,
        {
          endpoint,
          model,
          statusCode: response.status,
          statusMessage: response.statusText,
          phase: 'upstream.responses.retry',
        },
      )
    }

    return response
  }, retryCount)

  if (!response.ok) {
    const bodyPreview = normalizeErrorBody(response.bodyText, response.status, response.statusText)
    await options.onAudit?.({
      type: 'upstream.response_error',
      payload: {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        bodyPreview,
      },
    })

    throw createDeepAgentError(
      `[deepagent-responses] ${response.status} ${bodyPreview || response.statusText}`,
      {
        endpoint,
        model,
        statusCode: response.status,
        statusMessage: response.statusText,
        phase: 'upstream.responses.response',
      },
    )
  }

  let parsedData: unknown = {}
  try {
    parsedData = JSON.parse(response.bodyText || '{}')
  }
  catch {}

  const data = toRecord(parsedData)
  let content = extractResponsesText(data)
  let resolvedModel = typeof data.model === 'string' ? data.model : model
  if (!content) {
    const parsedSse = tryParseResponsesSsePayload(response.bodyText)
    if (parsedSse) {
      content = parsedSse.content
      resolvedModel = parsedSse.model || resolvedModel
    }
  }
  if (!content) {
    throw createDeepAgentError(
      '[deepagent-responses] empty response content',
      {
        endpoint,
        model,
        phase: 'upstream.responses.response',
      },
    )
  }

  await options.onAudit?.({
    type: 'upstream.response',
    payload: {
      endpoint,
      status: response.status,
      model: resolvedModel,
      outputChars: content.length,
      retryAttempt: lastAttempt,
      strategy: 'responses.direct',
    },
  })

  return {
    content,
    provider: 'openai-responses',
    model: resolvedModel,
  }
}

async function invokeDeepAgentWithTransport(
  state: TurnState,
  options: DeepAgentEngineOptions,
  transport: 'responses' | 'chat.completions',
): Promise<DeepAgentResponsesResult> {
  const relayBaseUrl = resolveRelayBaseUrl(options)
  const model = String(options.model || FALLBACK_MODEL).trim() || FALLBACK_MODEL
  const effectiveApiKey = String(options.apiKey || '').trim()
  const timeoutMs = resolveTimeoutMs(options)
  const retryCount = Math.max(0, Math.min(3, Number(options.retryCount ?? 1)))

  if (!relayBaseUrl) {
    throw createDeepAgentError(
      '[deepagent-config] relay base url is not configured',
      {
        phase: 'upstream.config',
      },
    )
  }

  if (!effectiveApiKey) {
    throw createDeepAgentError(
      '[deepagent-config] api key is not configured',
      {
        endpoint: relayBaseUrl,
        model,
        phase: 'upstream.auth',
      },
    )
  }

  const instructions = await resolveInstructions(state, options)
  const subagents = toSubagents(options.subagents)
  const builtinTools = Array.isArray(options.builtinTools) && options.builtinTools.length > 0
    ? options.builtinTools
    : DEFAULT_BUILTIN_TOOLS
  const customTools = resolveCustomTools(options)
  const useResponsesApi = transport === 'responses'

  const invokeMessages = buildDeepAgentMessages(state, {
    includeInputFiles: useResponsesApi,
  })
  const endpoint = useResponsesApi
    ? `${trimSuffixSlash(relayBaseUrl)}/responses`
    : `${trimSuffixSlash(relayBaseUrl)}/chat/completions`

  const ChatOpenAI = await getChatOpenAIConstructor()
  const llm = new ChatOpenAI({
    apiKey: effectiveApiKey,
    model,
    useResponsesApi,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeout: timeoutMs,
    maxRetries: 0,
    configuration: {
      baseURL: relayBaseUrl,
    },
  })

  if (useResponsesApi && UNSUPPORTED_CHAT_COMPLETIONS_BASE_URLS.has(relayBaseUrl)) {
    return await invokeDirectResponsesFallback({
      state,
      options,
      relayBaseUrl,
      effectiveApiKey,
      model,
      retryCount,
    })
  }

  await options.onAudit?.({
    type: 'upstream.request',
    payload: {
      endpoint,
      method: 'POST',
      model,
      strategy: 'deepagents.createDeepAgent',
      transport: useResponsesApi ? 'responses' : 'chat.completions',
      messageCount: invokeMessages.length,
      hasInstructions: Boolean(instructions),
      subAgentCount: subagents.length,
      builtinTools,
      customToolCount: customTools.length,
      customToolNames: customTools.map(tool => tool.name),
      hasApiKey: true,
      metadata: toRecord(options.metadata),
    },
  })

  const createDeepAgent = await getCreateDeepAgent()

  let lastAttempt = 0
  let response: unknown
  try {
    response = await invokeWithRetry(async (attempt) => {
      lastAttempt = attempt
      if (attempt > 0) {
        await options.onAudit?.({
          type: 'upstream.retry',
          payload: {
            endpoint,
            attempt,
            model,
          },
        })
      }

      const agent = createDeepAgent({
        model: llm,
        instructions,
        subagents,
        builtinTools,
        tools: customTools,
      })

      const invokePayload = {
        messages: invokeMessages as unknown,
      } as Parameters<typeof agent.invoke>[0]

      return await agent.invoke(invokePayload)
    }, retryCount)
  }
  catch (error) {
    if (useResponsesApi && shouldUseDirectResponsesFallback(error)) {
      UNSUPPORTED_CHAT_COMPLETIONS_BASE_URLS.add(relayBaseUrl)
      return await invokeDirectResponsesFallback({
        state,
        options,
        relayBaseUrl,
        effectiveApiKey,
        model,
        retryCount,
      })
    }
    throw error
  }

  const data = toRecord(response)
  const content = extractDeepAgentText(data)
  if (!content) {
    throw createDeepAgentError(
      '[deepagent-runtime] empty response content',
      {
        endpoint,
        model,
        phase: 'upstream.deepagent.response',
      },
    )
  }

  await options.onAudit?.({
    type: 'upstream.response',
    payload: {
      endpoint,
      status: 200,
      model,
      outputChars: content.length,
      todoCount: getDeepAgentTodoCount(data),
      retryAttempt: lastAttempt,
    },
  })

  return {
    content,
    provider: 'langchain-deepagents',
    model,
  }
}

async function invokeDeepAgentWithRelay(
  state: TurnState,
  options: DeepAgentEngineOptions,
): Promise<DeepAgentResponsesResult> {
  const preferredTransport = normalizeTransport(options.transport)
  if (preferredTransport === 'responses' || preferredTransport === 'chat.completions') {
    return await invokeDeepAgentWithTransport(state, options, preferredTransport)
  }

  try {
    return await invokeDeepAgentWithTransport(state, options, 'responses')
  }
  catch (error) {
    if (!shouldFallbackToChatCompletions(error)) {
      throw error
    }

    await options.onAudit?.({
      type: 'upstream.transport_fallback',
      payload: {
        from: 'responses',
        to: 'chat.completions',
        reason: errorMessageOf(error),
      },
    })

    return await invokeDeepAgentWithTransport(state, options, 'chat.completions')
  }
}

function normalizeErrorBody(text: string, status: number, statusText: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return statusText || String(status)
  }
  if (/<!doctype html/i.test(trimmed) || /<html/i.test(trimmed)) {
    return `[html-error] status=${status}; statusText=${statusText || 'unknown'}`
  }
  return trimmed.slice(0, 800)
}

export async function invokeDeepAgentResponses(
  state: TurnState,
  options: DeepAgentEngineOptions,
): Promise<DeepAgentResponsesResult> {
  const relayBaseUrl = resolveRelayBaseUrl(options)

  try {
    return await invokeDeepAgentWithRelay(state, options)
  }
  catch (error) {
    const detail = toDeepAgentErrorDetail(error, {
      endpoint: relayBaseUrl || undefined,
      model: String(options.model || FALLBACK_MODEL).trim() || FALLBACK_MODEL,
      phase: 'upstream.invoke',
    })

    await options.onAudit?.({
      type: 'upstream.error',
      payload: {
        reason: errorMessageOf(error),
        detail,
      },
    })

    throw createDeepAgentError(
      `[deepagent] ${detail.message}`,
      detail,
    )
  }
}

export class DeepAgentLangChainEngineAdapter implements AgentEngineAdapter {
  readonly id = 'deepagent-langchain'
  private readonly adapter: LangChainEngineAdapter

  constructor(private readonly options: DeepAgentEngineOptions) {
    this.adapter = new LangChainEngineAdapter({
      run: async (state) => {
        const response = await invokeDeepAgentResponses(state, this.options)
        return {
          text: response.content,
          done: true,
          metadata: {
            provider: response.provider,
            model: response.model,
          },
        }
      },
    })
  }

  async run(state: TurnState): Promise<unknown> {
    return await this.adapter.run(state)
  }

  async *runStream(state: TurnState): AsyncIterable<unknown> {
    const metadata = toRecord(this.options.metadata)
    const forceNonStream = toBooleanFlag(metadata.disableStreamingPipeline)
    if (forceNonStream) {
      await this.options.onAudit?.({
        type: 'upstream.stream_pipeline_skipped',
        payload: {
          reason: 'disabled_by_metadata',
          adapter: String(metadata.channelAdapter || metadata.adapter || '').trim().toLowerCase() || null,
          metadata,
        },
      })
      yield await this.run(state)
      return
    }

    const relayBaseUrl = resolveRelayBaseUrl(this.options)
    const model = String(this.options.model || FALLBACK_MODEL).trim() || FALLBACK_MODEL
    const effectiveApiKey = String(this.options.apiKey || '').trim()
    const timeoutMs = resolveTimeoutMs(this.options)
    const transport = normalizeTransport(this.options.transport)
    const useResponsesApi = transport !== 'chat.completions'

    if (!relayBaseUrl || !effectiveApiKey) {
      yield await this.run(state)
      return
    }

    const instructions = await resolveInstructions(state, this.options)
    const subagents = toSubagents(this.options.subagents)
    const builtinTools = Array.isArray(this.options.builtinTools) && this.options.builtinTools.length > 0
      ? this.options.builtinTools
      : DEFAULT_BUILTIN_TOOLS
    const customTools = resolveCustomTools(this.options)
    const invokeMessages = buildDeepAgentMessages(state, {
      includeInputFiles: useResponsesApi,
    })
    const endpoint = useResponsesApi
      ? `${trimSuffixSlash(relayBaseUrl)}/responses`
      : `${trimSuffixSlash(relayBaseUrl)}/chat/completions`

    const ChatOpenAI = await getChatOpenAIConstructor()
    const llm = new ChatOpenAI({
      apiKey: effectiveApiKey,
      model,
      useResponsesApi,
      streaming: true,
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
      timeout: timeoutMs,
      maxRetries: 0,
      configuration: {
        baseURL: relayBaseUrl,
      },
    })

    await this.options.onAudit?.({
      type: 'upstream.request',
      payload: {
        endpoint,
        method: 'POST',
        model,
        strategy: 'deepagents.createDeepAgent.stream',
        transport: useResponsesApi ? 'responses.stream' : 'chat.completions.stream',
        messageCount: invokeMessages.length,
        hasInstructions: Boolean(instructions),
        subAgentCount: subagents.length,
        builtinTools,
        customToolCount: customTools.length,
        customToolNames: customTools.map(tool => tool.name),
        hasApiKey: true,
        metadata: toRecord(this.options.metadata),
      },
    })

    const startedAt = Date.now()
    let fullText = ''
    let fullThinking = ''
    let chunkCount = 0
    const directStreamEnabled = shouldUseDirectStream(this.options)

    if (!directStreamEnabled) {
      await this.options.onAudit?.({
        type: 'upstream.direct_stream_skipped',
        payload: {
          reason: customTools.length > 0 ? 'custom_tools_present' : 'disabled_by_metadata',
          endpoint,
          model,
          customToolNames: customTools.map(tool => tool.name),
          metadata: toRecord(this.options.metadata),
        },
      })
    }
    else {
      // Prefer direct ChatOpenAI stream for token-level output.
      // If this path fails or emits nothing, fallback to deepagents stream.
      try {
        const directMessages = buildDeepAgentMessages(state, {
          includeInputFiles: useResponsesApi,
        }).map(item => ({
          role: item.type,
          content: item.content,
        }))
        if (instructions) {
          directMessages.unshift({
            role: 'system',
            content: instructions,
          })
        }

        const directLlm = new ChatOpenAI({
          apiKey: effectiveApiKey,
          model,
          useResponsesApi,
          streaming: true,
          temperature: this.options.temperature,
          maxTokens: this.options.maxTokens,
          timeout: timeoutMs,
          maxRetries: 0,
          configuration: {
            baseURL: relayBaseUrl,
          },
        })

        const stream = await directLlm.stream(directMessages as any)
        for await (const chunk of stream as AsyncIterable<unknown>) {
          const row = toRecord(chunk)
          const rawThinking = extractThinkingPartsPreserve(
            row.reasoning
            ?? row.thinking
            ?? row.analysis
            ?? row.additional_kwargs
            ?? row.response_metadata
            ?? row.content,
          )
          const thinkingDelta = toIncrementalChunk(fullThinking, rawThinking)
          if (thinkingDelta) {
            fullThinking += thinkingDelta
            yield {
              thinking: thinkingDelta,
              thinkingDone: false,
              done: false,
              metadata: {
                provider: 'openai-responses',
                model,
              },
            }
          }

          let delta = extractTextPartsPreserve(row.content)
          if (!delta && typeof row.text === 'string') {
            delta = row.text
          }
          if (!delta && typeof row.output_text === 'string') {
            delta = row.output_text
          }
          if (!delta) {
            continue
          }

          delta = toIncrementalChunk(fullText, delta)
          if (!delta) {
            continue
          }

          fullText += delta
          chunkCount += 1
          yield {
            text: delta,
            done: false,
            metadata: {
              provider: 'openai-responses',
              model,
            },
          }
        }
      }
      catch (error) {
        await this.options.onAudit?.({
          type: 'upstream.direct_stream_error',
          payload: {
            reason: errorMessageOf(error),
            endpoint,
            model,
          },
        })
      }
    }

    if (chunkCount > 0) {
      await this.options.onAudit?.({
        type: 'upstream.response',
        payload: {
          endpoint,
          status: 200,
          model,
          outputChars: fullText.length,
          streamChunks: chunkCount,
          durationMs: Date.now() - startedAt,
          strategy: 'chatopenai.direct_stream',
        },
      })

      yield {
        text: fullText,
        thinking: fullThinking || undefined,
        thinkingDone: fullThinking ? true : undefined,
        done: true,
        metadata: {
          provider: 'openai-responses',
          model,
        },
      }
      return
    }

    try {
      const createDeepAgent = await getCreateDeepAgent()
      const agent = createDeepAgent({
        model: llm,
        instructions,
        subagents,
        builtinTools,
        tools: customTools,
      })
      const streamPayload = {
        messages: invokeMessages as unknown,
      }

      if (typeof agent.streamEvents === 'function') {
        const eventStream = agent.streamEvents(
          streamPayload as Parameters<typeof agent.streamEvents>[0],
          { version: 'v2', subgraphs: true },
        ) as AsyncIterable<unknown>

        for await (const event of eventStream) {
          const rawThinking = extractLangGraphEventThinkingDelta(event)
          const thinkingDelta = toIncrementalChunk(fullThinking, rawThinking)
          if (thinkingDelta) {
            fullThinking += thinkingDelta
            yield {
              thinking: thinkingDelta,
              thinkingDone: false,
              done: false,
              metadata: {
                provider: 'langchain-deepagents',
                model,
              },
            }
          }

          let delta = extractLangGraphEventDelta(event)
          if (!delta) {
            continue
          }

          delta = toIncrementalChunk(fullText, delta)
          if (!delta) {
            continue
          }

          fullText += delta
          chunkCount += 1
          yield {
            text: delta,
            done: false,
            metadata: {
              provider: 'langchain-deepagents',
              model,
            },
          }
        }
      }

      if (chunkCount <= 0) {
        const stream = await agent.stream(streamPayload as Parameters<typeof agent.stream>[0], {
          streamMode: 'messages',
          subgraphs: true,
        })

        for await (const chunk of stream as AsyncIterable<unknown>) {
          const messageTuple = extractLangGraphMessagesTuple(chunk)
          if (!messageTuple) {
            continue
          }

          const [message] = messageTuple
          const rawThinking = extractThinkingPartsPreserve(
            toRecord(message).reasoning
            ?? toRecord(message).thinking
            ?? toRecord(message).analysis
            ?? toRecord(message).kwargs
            ?? toRecord(message).additional_kwargs,
          )
          const thinkingDelta = toIncrementalChunk(fullThinking, rawThinking)
          if (thinkingDelta) {
            fullThinking += thinkingDelta
            yield {
              thinking: thinkingDelta,
              thinkingDone: false,
              done: false,
              metadata: {
                provider: 'langchain-deepagents',
                model,
              },
            }
          }

          let delta = extractAssistantDeltaFromMessage(message)
          if (!delta) {
            continue
          }

          delta = toIncrementalChunk(fullText, delta)
          if (!delta) {
            continue
          }

          fullText += delta
          chunkCount += 1
          yield {
            text: delta,
            done: false,
            metadata: {
              provider: 'langchain-deepagents',
              model,
            },
          }
        }
      }
    }
    catch (error) {
      if (chunkCount > 0) {
        throw error
      }
      yield await this.run(state)
      return
    }

    if (!fullText) {
      yield await this.run(state)
      return
    }

    await this.options.onAudit?.({
      type: 'upstream.response',
      payload: {
        endpoint,
        status: 200,
        model,
        outputChars: fullText.length,
        streamChunks: chunkCount,
        durationMs: Date.now() - startedAt,
        strategy: 'deepagents.createDeepAgent.stream',
      },
    })

    yield {
      text: fullText,
      thinking: fullThinking || undefined,
      thinkingDone: fullThinking ? true : undefined,
      done: true,
      metadata: {
        provider: 'langchain-deepagents',
        model,
      },
    }
  }
}
