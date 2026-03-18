export type PilotConversationRole = 'user' | 'assistant' | 'system'

export interface PilotConversationContentBlock {
  type: string
  value: string
  name?: string
  data?: string
}

export interface PilotConversationMessage {
  id?: string
  role: PilotConversationRole
  content: PilotConversationContentBlock[]
}

export interface PilotConversationAttachment {
  type: 'image' | 'file'
  value: string
  name?: string
  data?: string
}

export interface PilotConversationUserTurn {
  text: string
  attachments: PilotConversationAttachment[]
}

export interface SerializePilotExecutorMessagesOptions {
  assistantAvailableStatus?: number
  skipUnavailableAssistant?: boolean
  keepNonTextWithoutValue?: boolean
}

export interface BuildPilotConversationSnapshotInput {
  chatId: string
  messages: unknown
  assistantReply: string
  topicHint?: string
  previousValue?: string
}

export interface ShouldExecutePilotWebsearchInput {
  message: string
  intentType?: string
  internetEnabled?: boolean
  builtinTools?: string[]
  intentWebsearchRequired?: boolean
}

export interface PilotWebsearchExecutionDecision {
  enabled: boolean
  reason: string
}

const DEFAULT_ASSISTANT_AVAILABLE_STATUS = 0

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeRole(value: unknown): PilotConversationRole {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'assistant') {
    return 'assistant'
  }
  if (normalized === 'system') {
    return 'system'
  }
  return 'user'
}

function normalizeBlockType(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || 'text'
}

function shouldKeepBlockWithoutValue(
  type: string,
  row: Record<string, unknown>,
  keepNonTextWithoutValue: boolean,
): boolean {
  if (!keepNonTextWithoutValue) {
    return false
  }

  if (type === 'text' || type === 'markdown' || type === 'image' || type === 'file') {
    return false
  }

  return Boolean(
    String(row.name || '').trim()
    || String(row.data || '').trim()
    || (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra)),
  )
}

function normalizeTextBlocksFromArray(
  content: unknown[],
  keepNonTextWithoutValue: boolean,
): PilotConversationContentBlock[] {
  const list: PilotConversationContentBlock[] = []

  for (const item of content) {
    if (typeof item === 'string') {
      if (item) {
        list.push({
          type: 'text',
          value: item,
        })
      }
      continue
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }

    const row = item as Record<string, unknown>
    if (Array.isArray(row.value)) {
      list.push(...normalizeTextBlocksFromArray(row.value, keepNonTextWithoutValue))
      continue
    }

    const blockType = normalizeBlockType(row.type)
    const blockValue = typeof row.value === 'string' ? row.value : ''
    if (!blockValue && !shouldKeepBlockWithoutValue(blockType, row, keepNonTextWithoutValue)) {
      continue
    }

    list.push({
      type: blockType,
      value: blockValue,
      name: typeof row.name === 'string' ? row.name : undefined,
      data: typeof row.data === 'string' ? row.data : undefined,
    })
  }

  return list
}

export function normalizePilotConversationBlocks(
  content: unknown,
  options: { keepNonTextWithoutValue?: boolean } = {},
): PilotConversationContentBlock[] {
  const keepNonTextWithoutValue = options.keepNonTextWithoutValue !== false
  if (typeof content === 'string') {
    return content
      ? [{
          type: 'text',
          value: content,
        }]
      : []
  }

  if (Array.isArray(content)) {
    return normalizeTextBlocksFromArray(content, keepNonTextWithoutValue)
  }

  const row = toRecord(content)
  if (typeof row.content === 'string' && row.content) {
    return [{
      type: 'text',
      value: row.content,
    }]
  }

  return []
}

function resolveActiveInnerItem(message: Record<string, unknown>): Record<string, unknown> | null {
  const content = Array.isArray(message.content) ? message.content : []
  if (content.length <= 0) {
    return null
  }

  const pageRaw = Number(message.page)
  const page = Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 0
  const byPage = content.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    const row = item as Record<string, unknown>
    return Number(row.page) === page && Array.isArray(row.value)
  })
  if (byPage && typeof byPage === 'object' && !Array.isArray(byPage)) {
    return byPage as Record<string, unknown>
  }

  const byIndex = content[page]
  if (byIndex && typeof byIndex === 'object' && !Array.isArray(byIndex)) {
    const row = byIndex as Record<string, unknown>
    if (Array.isArray(row.value)) {
      return row
    }
  }

  const firstInner = content.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    const row = item as Record<string, unknown>
    return Array.isArray(row.value)
  })
  if (firstInner && typeof firstInner === 'object' && !Array.isArray(firstInner)) {
    return firstInner as Record<string, unknown>
  }

  return null
}

export function serializePilotExecutorMessages(
  messages: unknown,
  options: SerializePilotExecutorMessagesOptions = {},
): PilotConversationMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  const assistantAvailableStatus = Number.isFinite(Number(options.assistantAvailableStatus))
    ? Math.floor(Number(options.assistantAvailableStatus))
    : DEFAULT_ASSISTANT_AVAILABLE_STATUS
  const skipUnavailableAssistant = options.skipUnavailableAssistant !== false
  const keepNonTextWithoutValue = options.keepNonTextWithoutValue !== false
  const result: PilotConversationMessage[] = []

  for (const item of messages) {
    const row = toRecord(item)
    const role = normalizeRole(row.role)
    const inner = resolveActiveInnerItem(row)
    if (skipUnavailableAssistant && role === 'assistant' && inner) {
      const status = Number(inner.status)
      if (Number.isFinite(status) && status !== assistantAvailableStatus) {
        continue
      }
    }

    const blocks = inner
      ? normalizePilotConversationBlocks(inner.value, {
          keepNonTextWithoutValue,
        })
      : normalizePilotConversationBlocks(row.content, {
          keepNonTextWithoutValue,
        })

    if (blocks.length <= 0) {
      continue
    }

    const id = String(row.id || '').trim()
    result.push({
      id: id || undefined,
      role,
      content: blocks,
    })
  }

  return result
}

function isAttachmentType(type: string): boolean {
  return type === 'image' || type === 'file'
}

function isTextualType(type: string): boolean {
  return type !== 'card' && !isAttachmentType(type)
}

function extractTextFromBlocks(blocks: PilotConversationContentBlock[]): string {
  const chunks: string[] = []
  for (const block of blocks) {
    const type = normalizeBlockType(block.type)
    const value = String(block.value || '').trim()
    if (!value || !isTextualType(type)) {
      continue
    }
    chunks.push(value)
  }
  return chunks.join('\n').trim()
}

export function extractLatestPilotUserTurn(messages: unknown): PilotConversationUserTurn {
  const normalized = serializePilotExecutorMessages(messages, {
    skipUnavailableAssistant: false,
    keepNonTextWithoutValue: true,
  })

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index]
    if (message.role !== 'user') {
      continue
    }

    const attachments: PilotConversationAttachment[] = []
    for (const block of message.content) {
      const type = normalizeBlockType(block.type)
      const value = String(block.value || '').trim()
      if (!value || !isAttachmentType(type)) {
        continue
      }
      attachments.push({
        type: type as PilotConversationAttachment['type'],
        value,
        name: block.name,
        data: block.data,
      })
    }

    const text = extractTextFromBlocks(message.content)
    if (text || attachments.length > 0) {
      return {
        text,
        attachments,
      }
    }
  }

  return {
    text: '',
    attachments: [],
  }
}

export function extractLatestPilotUserMessage(messages: unknown): string {
  const turn = extractLatestPilotUserTurn(messages)
  if (turn.text) {
    return turn.text
  }
  return turn.attachments.map(item => item.value).filter(Boolean).join('\n').trim()
}

export function buildPilotTitleMessages(
  messages: unknown,
  assistantReply = '',
): Array<{ role: 'user' | 'assistant', content: string }> {
  const normalized = serializePilotExecutorMessages(messages, {
    skipUnavailableAssistant: false,
    keepNonTextWithoutValue: true,
  })
  const list: Array<{ role: 'user' | 'assistant', content: string }> = []

  for (const item of normalized) {
    if (item.role !== 'user' && item.role !== 'assistant') {
      continue
    }
    const content = extractTextFromBlocks(item.content)
    if (!content) {
      continue
    }
    list.push({
      role: item.role,
      content,
    })
  }

  const answer = String(assistantReply || '').trim()
  if (answer) {
    const last = list[list.length - 1]
    if (!last || last.role !== 'assistant' || last.content !== answer) {
      list.push({
        role: 'assistant',
        content: answer,
      })
    }
  }

  return list
}

function parseConversationObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  const raw = String(value || '').trim()
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  }
  catch {
    // noop
  }
  return {}
}

function randomMessageId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
}

function guessTopic(messages: PilotConversationMessage[], fallback = '新的聊天'): string {
  const firstUser = messages.find(item => item.role === 'user')
  if (!firstUser) {
    return fallback
  }
  const text = extractTextFromBlocks(firstUser.content).replace(/\s+/g, ' ').trim()
  if (!text) {
    return fallback
  }
  return text.slice(0, 20)
}

function toSnapshotMessages(messages: PilotConversationMessage[]): Array<Record<string, unknown>> {
  const now = Date.now()
  return messages.map((message, index) => {
    return {
      id: message.id || randomMessageId('Item'),
      page: 0,
      role: message.role,
      content: [
        {
          page: 0,
          model: 'this-normal',
          status: 0,
          timestamp: now + index,
          value: message.content.map((block) => {
            return {
              type: normalizeBlockType(block.type),
              value: String(block.value || ''),
              name: typeof block.name === 'string' ? block.name : undefined,
              data: typeof block.data === 'string' ? block.data : undefined,
            }
          }),
          meta: {},
        },
      ],
    }
  })
}

export function buildPilotConversationSnapshot(input: BuildPilotConversationSnapshotInput): {
  topic: string
  value: string
  payload: Record<string, unknown>
} {
  const previous = parseConversationObject(input.previousValue)
  const chatId = String(input.chatId || '').trim()
  const normalized = serializePilotExecutorMessages(input.messages, {
    skipUnavailableAssistant: false,
    keepNonTextWithoutValue: true,
  })

  const assistantReply = String(input.assistantReply || '').trim()
  if (assistantReply) {
    const last = normalized[normalized.length - 1]
    const lastText = last?.role === 'assistant' ? extractTextFromBlocks(last.content) : ''
    if (!last || last.role !== 'assistant' || lastText !== assistantReply) {
      normalized.push({
        role: 'assistant',
        content: [{
          type: 'markdown',
          value: assistantReply,
        }],
      })
    }
  }

  const topicHint = String(input.topicHint || '').trim()
  const topic = topicHint || String(previous.topic || '').trim() || guessTopic(normalized)
  const payload: Record<string, unknown> = {
    ...previous,
    id: chatId,
    topic: topic || '新的聊天',
    sync: 'success',
    lastUpdate: Date.now(),
    messages: toSnapshotMessages(normalized),
  }

  return {
    topic: String(payload.topic || '').trim() || '新的聊天',
    value: JSON.stringify(payload),
    payload,
  }
}

function hasWebsearchTool(builtinTools: string[] | undefined): boolean {
  if (!Array.isArray(builtinTools) || builtinTools.length <= 0) {
    return false
  }
  return builtinTools.some(item => String(item || '').trim().toLowerCase() === 'websearch')
}

function messageLooksLikeWebsearchNeeded(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) {
    return false
  }

  const lower = text.toLowerCase()
  if (/https?:\/\//i.test(text)) {
    return true
  }

  const disablePatterns = [
    /(不要|无需|不用|别).{0,6}(联网|搜索|查(网|询)?)/i,
    /\b(no|without)\s+(web\s*search|internet|search)\b/i,
  ]
  if (disablePatterns.some(pattern => pattern.test(text))) {
    return false
  }

  const triggerPatterns = [
    /(最新|今天|今日|近期|实时|新闻|股价|汇率|天气|赛程|比分|官网|来源|引用|链接|查一下|搜一下|检索)/i,
    /\b(latest|today|current|recent|real[-\s]?time|news|price|weather|score|schedule|source|citation|search)\b/i,
  ]
  if (triggerPatterns.some(pattern => pattern.test(text))) {
    return true
  }

  if (lower.includes('what happened') || lower.includes('release note') || lower.includes('breaking')) {
    return true
  }

  return false
}

export function shouldExecutePilotWebsearch(
  input: ShouldExecutePilotWebsearchInput,
): PilotWebsearchExecutionDecision {
  const message = String(input.message || '').trim()
  if (!message) {
    return {
      enabled: false,
      reason: 'empty_message',
    }
  }

  if (!input.internetEnabled) {
    return {
      enabled: false,
      reason: 'internet_disabled',
    }
  }

  if (!hasWebsearchTool(input.builtinTools)) {
    return {
      enabled: false,
      reason: 'tool_unavailable',
    }
  }

  const intentType = String(input.intentType || '').trim().toLowerCase()
  if (intentType === 'image_generate' || intentType === 'image-generate') {
    return {
      enabled: false,
      reason: 'image_intent',
    }
  }

  if (input.intentWebsearchRequired === true) {
    return {
      enabled: true,
      reason: 'intent_required',
    }
  }

  if (input.intentWebsearchRequired === false) {
    return {
      enabled: false,
      reason: 'intent_not_required',
    }
  }

  if (messageLooksLikeWebsearchNeeded(message)) {
    return {
      enabled: true,
      reason: 'heuristic_required',
    }
  }

  return {
    enabled: false,
    reason: 'heuristic_not_required',
  }
}
