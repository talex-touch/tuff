import type { H3Event } from 'h3'
import type { PilotIntentType, PilotRoutingResolveResult } from './pilot-routing-resolver'
import { networkClient } from '@talex-touch/utils/network'
import { resolvePilotRoutingSelection } from './pilot-routing-resolver'

const DEFAULT_CLASSIFIER_TIMEOUT_MS = 6_000
const MIN_CLASSIFIER_TIMEOUT_MS = 1_500
const MAX_CLASSIFIER_TIMEOUT_MS = 20_000
const IMAGE_COMMAND_PREFIX = /^\/(?:image|img)\b/i
const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)
const WEBSEARCH_DISABLE_PATTERNS = [
  /(不要|无需|不用|别).{0,6}(联网|搜索|查(网|询)?)/i,
  /(只用|仅用).{0,8}(离线|本地|记忆)/i,
  /\b(no|without|don'?t)\s+(web\s*search|internet|search|browse|browsing)\b/i,
  /\boffline\s+only\b/i,
]

export interface ResolvePilotIntentInput {
  event: H3Event
  message: string
  requestChannelId?: string
  sessionChannelId?: string
  requestedModelId?: string
  routeComboId?: string
  timeoutMs?: number
}

export interface ResolvePilotIntentResult {
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>
  prompt: string
  strategy: 'command' | 'rule' | 'nano' | 'fallback'
  confidence: number
  reason: string
  websearchRequired: boolean
  websearchReason: string
  memoryDecision: PilotIntentMemoryDecision
  memoryReadDecision: PilotIntentMemoryReadDecision
  toolDecision: PilotIntentToolDecision
  classifier?: {
    channelId: string
    modelId: string
    providerModel: string
    routeComboId: string
    selectionSource: string
  }
}

interface IntentClassifierResult {
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>
  confidence: number
  reason: string
  prompt: string
  websearchRequired: boolean
  memoryDecision: PilotIntentMemoryDecision
  memoryReadDecision: PilotIntentMemoryReadDecision
  toolDecision: PilotIntentToolDecision
}

export interface PilotIntentMemoryDecision {
  shouldStore: boolean
  reason: 'eligible' | 'no_persistent_fact' | 'intent_skip' | 'policy_disabled'
}

export interface PilotIntentMemoryReadDecision {
  shouldRead: boolean
  reason: 'explicit_reference' | 'personalized_request' | 'not_needed' | 'intent_skip' | 'disabled'
}

export interface PilotIntentToolDecision {
  shouldUseTools: boolean
  reason: 'websearch_required' | 'explicit_tool_request' | 'structured_operation' | 'not_needed' | 'intent_skip' | 'disabled'
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(Math.max(value, min), max)
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CLASSIFIER_TIMEOUT_MS
  }
  return Math.floor(clamp(parsed, MIN_CLASSIFIER_TIMEOUT_MS, MAX_CLASSIFIER_TIMEOUT_MS))
}

function normalizeBooleanFlag(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function normalizeIntentType(value: unknown): IntentClassifierResult['intentType'] {
  const text = normalizeText(value).toLowerCase()
  if (
    text === 'image_generate'
    || text === 'image-generate'
    || text === 'image'
    || text === 'generate_image'
  ) {
    return 'image_generate'
  }
  return 'chat'
}

function buildPromptFromCommand(message: string): string {
  const withoutCommand = message.replace(IMAGE_COMMAND_PREFIX, '').trim()
  return withoutCommand || message
}

function isImageCommand(message: string): boolean {
  const trimmed = normalizeText(message)
  return IMAGE_COMMAND_PREFIX.test(trimmed)
}

function shouldRouteToImageByRule(message: string): boolean {
  const text = normalizeText(message)
  if (!text) {
    return false
  }

  const lower = text.toLowerCase()

  const negativePatterns = [
    /分析.*图片/,
    /识别.*图片/,
    /解释.*图片/,
    /describe.*image/i,
    /analy[sz]e.*image/i,
    /what(?:'s| is).*(?:in|inside).*(?:image|picture)/i,
  ]
  if (negativePatterns.some(pattern => pattern.test(text))) {
    return false
  }

  const positivePatterns = [
    /(生成|创建|做|画|绘制|设计).{0,12}(图(?:片|标)?|插画|海报|封面|壁纸|logo)/i,
    /(图(?:片|标)?|插画|海报|封面|壁纸|logo).{0,12}(生成|创建|做|画|绘制|设计)/i,
    /\b(text[- ]?to[- ]?image|t2i)\b/i,
    /\b(generate|create|draw|design|make)\b.{1,16}\b(image|picture|illustration|poster|cover|wallpaper|logo|icon)\b/i,
    /\b(image|picture|illustration|poster|cover|wallpaper|logo|icon)\b.{1,16}\b(generate|create|draw|design|make)\b/i,
  ]

  if (positivePatterns.some(pattern => pattern.test(text))) {
    return true
  }

  if (
    lower.startsWith('画一张')
    || lower.startsWith('画个')
    || lower.startsWith('帮我画')
    || lower.startsWith('生成一张')
    || lower.startsWith('create an image')
    || lower.startsWith('generate an image')
  ) {
    return true
  }

  return false
}

function resolveWebsearchRequiredByHeuristic(
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
): boolean {
  if (intentType !== 'chat') {
    return false
  }

  const text = normalizeText(message)
  if (!text) {
    return false
  }

  if (WEBSEARCH_DISABLE_PATTERNS.some(pattern => pattern.test(text))) {
    return false
  }

  const triggerPatterns = [
    /(最新|今天|今日|近期|实时|新闻|股价|汇率|天气|赛程|比分|官网|来源|引用|链接|查一下|搜一下|检索)/i,
    /\b(latest|today|current|recent|real[-\s]?time|news|price|weather|score|schedule|source|citation|search)\b/i,
  ]
  if (triggerPatterns.some(pattern => pattern.test(text))) {
    return true
  }

  if (/https?:\/\//i.test(text)) {
    return true
  }

  const lower = text.toLowerCase()
  return lower.includes('what happened')
    || lower.includes('release note')
    || lower.includes('breaking')
}

function resolveMemoryDecisionByHeuristic(
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
): PilotIntentMemoryDecision {
  if (intentType !== 'chat') {
    return {
      shouldStore: false,
      reason: 'intent_skip',
    }
  }

  const normalized = normalizeText(message)
  if (!normalized) {
    return {
      shouldStore: false,
      reason: 'intent_skip',
    }
  }

  const lower = normalized.toLowerCase()
  const transientPatterns = [
    /今日|今天|刚刚|最新|实时|新闻|天气|股价|汇率|热搜/,
    /today|latest|news|weather|stock|realtime|current/i,
    /搜索|查一下|帮我查|lookup|search/i,
  ]
  for (const pattern of transientPatterns) {
    if (pattern.test(lower)) {
      return {
        shouldStore: false,
        reason: 'no_persistent_fact',
      }
    }
  }

  const persistentPatterns = [
    /我叫|我是|我在|我来自|我的职业|我的工作|我的偏好|我偏好|我喜欢|我不喜欢|我常用|我长期|记住我/,
    /my name is|i am|i prefer|i like|i dislike|i usually|remember that/i,
  ]
  for (const pattern of persistentPatterns) {
    if (pattern.test(lower)) {
      return {
        shouldStore: true,
        reason: 'eligible',
      }
    }
  }

  return {
    shouldStore: false,
    reason: 'no_persistent_fact',
  }
}

function normalizeMemoryDecision(
  rawShouldStore: unknown,
  rawReason: unknown,
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
): PilotIntentMemoryDecision {
  const fallback = resolveMemoryDecisionByHeuristic(message, intentType)
  if (intentType !== 'chat') {
    return {
      shouldStore: false,
      reason: 'intent_skip',
    }
  }

  const normalizedReason = normalizeText(rawReason).toLowerCase()
  const shouldStore = normalizeBooleanFlag(rawShouldStore, false)
  if (shouldStore) {
    return {
      shouldStore: true,
      reason: 'eligible',
    }
  }

  if (
    normalizedReason === 'eligible'
    || normalizedReason === 'no_persistent_fact'
    || normalizedReason === 'intent_skip'
    || normalizedReason === 'policy_disabled'
  ) {
    return {
      shouldStore: normalizedReason === 'eligible',
      reason: normalizedReason as PilotIntentMemoryDecision['reason'],
    }
  }

  return fallback
}

function resolveMemoryReadDecisionByHeuristic(
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
): PilotIntentMemoryReadDecision {
  if (intentType !== 'chat') {
    return {
      shouldRead: false,
      reason: 'intent_skip',
    }
  }

  const normalized = normalizeText(message)
  if (!normalized) {
    return {
      shouldRead: false,
      reason: 'not_needed',
    }
  }

  const patterns: Array<{ reason: PilotIntentMemoryReadDecision['reason'], rules: RegExp[] }> = [
    {
      reason: 'explicit_reference',
      rules: [
        /记得|还记得|你知道我|你还记得|我之前说过|我上次提过|结合我之前的信息|根据你记住的/,
        /我叫什?么|我的名字(?:是|叫什么)?|怎么称呼我|该怎么叫我|你应该怎么称呼我|你知道我的名字吗|我是谁/,
        /what do you remember|remember about me|as i said before|you know me|based on what you remember/i,
        /what(?:'s| is) my name|do you know my name|how should you call me|what should you call me|who am i/i,
      ],
    },
    {
      reason: 'personalized_request',
      rules: [
        /根据我的偏好|按我的习惯|结合我的情况|适合我|按我常用的|延续我之前的风格/,
        /based on my preferences|for me based on|fit me best|my usual setup|my preference/i,
      ],
    },
  ]

  for (const item of patterns) {
    if (item.rules.some(rule => rule.test(normalized))) {
      return {
        shouldRead: true,
        reason: item.reason,
      }
    }
  }

  return {
    shouldRead: false,
    reason: 'not_needed',
  }
}

function normalizeMemoryReadDecision(
  rawShouldRead: unknown,
  rawReason: unknown,
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
): PilotIntentMemoryReadDecision {
  const fallback = resolveMemoryReadDecisionByHeuristic(message, intentType)
  if (intentType !== 'chat') {
    return {
      shouldRead: false,
      reason: 'intent_skip',
    }
  }

  const normalizedReason = normalizeText(rawReason).toLowerCase()
  if (normalizedReason === 'disabled' || normalizedReason === 'intent_skip') {
    return {
      shouldRead: false,
      reason: normalizedReason as PilotIntentMemoryReadDecision['reason'],
    }
  }

  if (normalizedReason === 'explicit_reference' || normalizedReason === 'personalized_request') {
    return {
      shouldRead: true,
      reason: normalizedReason as PilotIntentMemoryReadDecision['reason'],
    }
  }

  if (normalizedReason === 'not_needed' && fallback.shouldRead) {
    return fallback
  }

  if (normalizedReason === 'not_needed') {
    return {
      shouldRead: false,
      reason: 'not_needed',
    }
  }

  if (normalizeBooleanFlag(rawShouldRead, false)) {
    return fallback.shouldRead
      ? fallback
      : {
          shouldRead: true,
          reason: 'personalized_request',
        }
  }

  return fallback
}

function resolveToolDecisionByHeuristic(
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
  websearchRequired: boolean,
): PilotIntentToolDecision {
  if (intentType !== 'chat') {
    return {
      shouldUseTools: false,
      reason: 'intent_skip',
    }
  }

  if (websearchRequired) {
    return {
      shouldUseTools: true,
      reason: 'websearch_required',
    }
  }

  const normalized = normalizeText(message)
  if (!normalized) {
    return {
      shouldUseTools: false,
      reason: 'not_needed',
    }
  }

  if (WEBSEARCH_DISABLE_PATTERNS.some(rule => rule.test(normalized))) {
    return {
      shouldUseTools: false,
      reason: 'not_needed',
    }
  }

  const explicitToolPatterns = [
    /搜索|查一下|帮我查|联网|检索|搜一搜|看看网上|找资料|查资料|最新消息|实时/,
    /\b(search|lookup|browse|web|internet|online|latest|realtime)\b/i,
  ]
  if (explicitToolPatterns.some(rule => rule.test(normalized))) {
    return {
      shouldUseTools: true,
      reason: 'explicit_tool_request',
    }
  }

  const structuredPatterns = [
    /待办|todo|to-do|步骤|分步|清单|计划|拆解|读取文件|文件内容|附件|表格|文档/i,
    /\b(plan|checklist|step by step|read file|analyze file|summarize file|attachment|document)\b/i,
  ]
  if (structuredPatterns.some(rule => rule.test(normalized))) {
    return {
      shouldUseTools: true,
      reason: 'structured_operation',
    }
  }

  return {
    shouldUseTools: false,
    reason: 'not_needed',
  }
}

function normalizeToolDecision(
  rawShouldUseTools: unknown,
  rawReason: unknown,
  message: string,
  intentType: Extract<PilotIntentType, 'chat' | 'image_generate'>,
  websearchRequired: boolean,
): PilotIntentToolDecision {
  const fallback = resolveToolDecisionByHeuristic(message, intentType, websearchRequired)
  if (intentType !== 'chat') {
    return {
      shouldUseTools: false,
      reason: 'intent_skip',
    }
  }

  const normalizedReason = normalizeText(rawReason).toLowerCase()
  if (
    normalizedReason === 'websearch_required'
    || normalizedReason === 'explicit_tool_request'
    || normalizedReason === 'structured_operation'
  ) {
    return {
      shouldUseTools: true,
      reason: normalizedReason as PilotIntentToolDecision['reason'],
    }
  }

  if (
    normalizedReason === 'not_needed'
    || normalizedReason === 'intent_skip'
    || normalizedReason === 'disabled'
  ) {
    return {
      shouldUseTools: false,
      reason: normalizedReason as PilotIntentToolDecision['reason'],
    }
  }

  if (normalizeBooleanFlag(rawShouldUseTools, false)) {
    return fallback.shouldUseTools
      ? fallback
      : {
          shouldUseTools: true,
          reason: websearchRequired ? 'websearch_required' : 'structured_operation',
        }
  }

  return fallback
}

function buildClassifierSystemPrompt(): string {
  return [
    'You are an intent classifier for Tuff Pilot.',
    'Classify user request into one intent: "chat" or "image_generate".',
    'Return only strict JSON with fields: intent, confidence, reason, prompt, needs_websearch, should_store_memory, memory_reason, should_read_memory, memory_read_reason, should_use_tools, tool_reason.',
    'confidence must be between 0 and 1.',
    'needs_websearch must be true only when external/latest web information is required.',
    'should_store_memory is true only when user message contains durable long-term profile/preference facts.',
    'memory_reason must be one of: eligible, no_persistent_fact, intent_skip, policy_disabled.',
    'should_read_memory is true only when prior remembered user profile/history/preferences would likely improve the current answer.',
    'memory_read_reason must be one of: explicit_reference, personalized_request, not_needed, intent_skip, disabled.',
    'should_use_tools is true only when the current request likely needs builtin tools such as websearch or structured helper tools beyond direct answering.',
    'tool_reason must be one of: websearch_required, explicit_tool_request, structured_operation, not_needed, intent_skip, disabled.',
    'If user asks to create/draw/generate a new image, choose image_generate.',
    'If user asks to analyze/describe an existing image or asks normal questions, choose chat.',
    'prompt should be cleaned user request text for downstream image generation when intent=image_generate.',
    'No markdown, no extra keys.',
  ].join('\n')
}

function resolveResponseEndpoint(baseUrl: string, transport: PilotRoutingResolveResult['transport']): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  const hasVersionPrefix = normalized.endsWith('/v1')
  if (transport === 'chat.completions') {
    return hasVersionPrefix ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`
  }
  return hasVersionPrefix ? `${normalized}/responses` : `${normalized}/v1/responses`
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
      const text = normalizeText(partRow.text)
      if (text) {
        chunks.push(text)
      }
    }
  }

  return chunks.join('\n').trim()
}

function parseChatCompletionsOutputText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : []
  for (const item of choices) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const message = row.message && typeof row.message === 'object' && !Array.isArray(row.message)
      ? row.message as Record<string, unknown>
      : {}
    const content = normalizeText(message.content)
    if (content) {
      return content
    }
  }
  return ''
}

function parseClassifierJson(content: string, message: string): IntentClassifierResult {
  const normalizedMessage = normalizeText(message)
  if (!content) {
    const websearchRequired = resolveWebsearchRequiredByHeuristic(normalizedMessage, 'chat')
    const memoryDecision = resolveMemoryDecisionByHeuristic(normalizedMessage, 'chat')
    const memoryReadDecision = resolveMemoryReadDecisionByHeuristic(normalizedMessage, 'chat')
    const toolDecision = resolveToolDecisionByHeuristic(normalizedMessage, 'chat', websearchRequired)
    return {
      intentType: 'chat',
      confidence: 0,
      reason: 'empty_response',
      prompt: normalizedMessage,
      websearchRequired,
      memoryDecision,
      memoryReadDecision,
      toolDecision,
    }
  }

  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid classifier response')
    }
    const row = parsed as Record<string, unknown>
    const intentType = normalizeIntentType(row.intent)
    const websearchRequired = normalizeBooleanFlag(row.needs_websearch, false)
    const memoryDecision = normalizeMemoryDecision(
      row.should_store_memory,
      row.memory_reason,
      normalizedMessage,
      intentType,
    )
    const memoryReadDecision = normalizeMemoryReadDecision(
      row.should_read_memory,
      row.memory_read_reason,
      normalizedMessage,
      intentType,
    )
    const toolDecision = normalizeToolDecision(
      row.should_use_tools,
      row.tool_reason,
      normalizedMessage,
      intentType,
      websearchRequired,
    )
    return {
      intentType,
      confidence: clamp(Number(row.confidence), 0, 1),
      reason: normalizeText(row.reason) || 'classified',
      prompt: normalizeText(row.prompt) || normalizedMessage,
      websearchRequired,
      memoryDecision,
      memoryReadDecision,
      toolDecision,
    }
  }
  catch {
    const websearchRequired = resolveWebsearchRequiredByHeuristic(normalizedMessage, 'chat')
    const memoryDecision = resolveMemoryDecisionByHeuristic(normalizedMessage, 'chat')
    const memoryReadDecision = resolveMemoryReadDecisionByHeuristic(normalizedMessage, 'chat')
    const toolDecision = resolveToolDecisionByHeuristic(normalizedMessage, 'chat', websearchRequired)
    return {
      intentType: 'chat',
      confidence: 0,
      reason: 'json_parse_failed',
      prompt: normalizedMessage,
      websearchRequired,
      memoryDecision,
      memoryReadDecision,
      toolDecision,
    }
  }
}

function formatErrorPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value === null || typeof value === 'undefined') {
    return ''
  }
  try {
    return JSON.stringify(value)
  }
  catch {
    return ''
  }
}

async function classifyIntentByModel(input: {
  message: string
  timeoutMs: number
  route: PilotRoutingResolveResult
}): Promise<IntentClassifierResult> {
  const endpoint = resolveResponseEndpoint(input.route.channel.baseUrl, input.route.transport)
  if (!endpoint) {
    throw new Error('Classifier endpoint is not configured')
  }

  const payload: Record<string, unknown> = input.route.transport === 'chat.completions'
    ? {
        model: input.route.providerModel,
        temperature: 0,
        max_tokens: 180,
        response_format: {
          type: 'json_object',
        },
        messages: [
          { role: 'system', content: buildClassifierSystemPrompt() },
          { role: 'user', content: input.message },
        ],
      }
    : {
        model: input.route.providerModel,
        temperature: 0,
        max_output_tokens: 180,
        input: [
          { role: 'system', content: buildClassifierSystemPrompt() },
          { role: 'user', content: input.message },
        ],
      }

  const response = await networkClient.request<Record<string, unknown> | string>({
    method: 'POST',
    url: endpoint,
    timeoutMs: input.timeoutMs,
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${input.route.channel.apiKey}`,
    },
    body: payload,
    validateStatus: ALL_HTTP_STATUS,
  })

  if (response.status < 200 || response.status >= 300) {
    const details = formatErrorPayload(response.data)
    throw new Error(`Classifier request failed: ${response.status}${details ? ` ${details}` : ''}`)
  }

  const row = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : {}

  const content = input.route.transport === 'chat.completions'
    ? parseChatCompletionsOutputText(row)
    : parseResponsesOutputText(row)

  return parseClassifierJson(content, input.message)
}

export async function resolvePilotIntent(input: ResolvePilotIntentInput): Promise<ResolvePilotIntentResult> {
  const message = normalizeText(input.message)
  if (!message) {
    return {
      intentType: 'chat',
      prompt: '',
      strategy: 'fallback',
      confidence: 0,
      reason: 'empty_message',
      websearchRequired: false,
      websearchReason: 'empty_message',
      memoryDecision: {
        shouldStore: false,
        reason: 'intent_skip',
      },
      memoryReadDecision: {
        shouldRead: false,
        reason: 'not_needed',
      },
      toolDecision: {
        shouldUseTools: false,
        reason: 'not_needed',
      },
    }
  }

  if (isImageCommand(message)) {
    return {
      intentType: 'image_generate',
      prompt: buildPromptFromCommand(message),
      strategy: 'command',
      confidence: 1,
      reason: 'explicit_command',
      websearchRequired: false,
      websearchReason: 'image_command',
      memoryDecision: {
        shouldStore: false,
        reason: 'intent_skip',
      },
      memoryReadDecision: {
        shouldRead: false,
        reason: 'intent_skip',
      },
      toolDecision: {
        shouldUseTools: false,
        reason: 'intent_skip',
      },
    }
  }

  if (shouldRouteToImageByRule(message)) {
    return {
      intentType: 'image_generate',
      prompt: message,
      strategy: 'rule',
      confidence: 0.92,
      reason: 'rule_match',
      websearchRequired: false,
      websearchReason: 'image_rule',
      memoryDecision: {
        shouldStore: false,
        reason: 'intent_skip',
      },
      memoryReadDecision: {
        shouldRead: false,
        reason: 'intent_skip',
      },
      toolDecision: {
        shouldUseTools: false,
        reason: 'intent_skip',
      },
    }
  }

  const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
  try {
    const classifierRoute = await resolvePilotRoutingSelection(input.event, {
      requestChannelId: input.requestChannelId,
      sessionChannelId: input.sessionChannelId,
      requestedModelId: input.requestedModelId,
      routeComboId: input.routeComboId,
      internet: false,
      thinking: false,
      intentType: 'intent_classification',
    })

    const classification = await classifyIntentByModel({
      message,
      timeoutMs,
      route: classifierRoute,
    })

    if (classification.intentType === 'image_generate' && classification.confidence >= 0.55) {
      return {
        intentType: 'image_generate',
        prompt: classification.prompt || message,
        strategy: 'nano',
        confidence: classification.confidence,
        reason: classification.reason || 'nano_classified',
        websearchRequired: false,
        websearchReason: 'image_intent',
        memoryDecision: {
          shouldStore: false,
          reason: 'intent_skip',
        },
        memoryReadDecision: {
          shouldRead: false,
          reason: 'intent_skip',
        },
        toolDecision: {
          shouldUseTools: false,
          reason: 'intent_skip',
        },
        classifier: {
          channelId: classifierRoute.channelId,
          modelId: classifierRoute.modelId,
          providerModel: classifierRoute.providerModel,
          routeComboId: classifierRoute.routeComboId,
          selectionSource: classifierRoute.selectionSource,
        },
      }
    }

    return {
      intentType: 'chat',
      prompt: message,
      strategy: 'nano',
      confidence: classification.confidence,
      reason: classification.reason || 'nano_classified_chat',
      websearchRequired: classification.websearchRequired,
      websearchReason: classification.websearchRequired
        ? 'nano_requires_websearch'
        : 'nano_chat_no_websearch',
      memoryDecision: classification.memoryDecision,
      memoryReadDecision: classification.memoryReadDecision,
      toolDecision: classification.toolDecision,
      classifier: {
        channelId: classifierRoute.channelId,
        modelId: classifierRoute.modelId,
        providerModel: classifierRoute.providerModel,
        routeComboId: classifierRoute.routeComboId,
        selectionSource: classifierRoute.selectionSource,
      },
    }
  }
  catch {
    const websearchRequired = resolveWebsearchRequiredByHeuristic(message, 'chat')
    const memoryDecision = resolveMemoryDecisionByHeuristic(message, 'chat')
    const memoryReadDecision = resolveMemoryReadDecisionByHeuristic(message, 'chat')
    const toolDecision = resolveToolDecisionByHeuristic(message, 'chat', websearchRequired)
    return {
      intentType: 'chat',
      prompt: message,
      strategy: 'fallback',
      confidence: 0,
      reason: 'classifier_failed',
      websearchRequired,
      websearchReason: 'classifier_failed',
      memoryDecision,
      memoryReadDecision,
      toolDecision,
    }
  }
}
