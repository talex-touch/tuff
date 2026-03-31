import type {
  EnterMessage,
  ObjectStringItem,
} from '@coze/api'
import type {
  AgentEngineAdapter,
  DeepAgentAuditRecord,
  TurnState,
  UserMessageAttachment,
} from '@talex-touch/tuff-intelligence/pilot'
import type { PilotCozeAuthMode, PilotProviderTargetType } from './pilot-channel'
import { Buffer } from 'node:buffer'
import { ChatEventType, CozeAPI, RoleType } from '@coze/api'
import { shouldIncludePilotMessageInModelContext } from '@talex-touch/tuff-intelligence/pilot'
import { networkClient, parseHttpStatusCode } from '@talex-touch/utils/network'
import {
  getPilotCozeAccessToken,
  invalidatePilotCozeAccessToken,
  PilotCozeAuthError,
  PilotCozeOAuthError,
} from './pilot-coze-auth'

const DEFAULT_TIMEOUT_MS = 90_000
const MIN_TIMEOUT_MS = 3_000
const MAX_TIMEOUT_MS = 10 * 60 * 1000

export const PILOT_COZE_REQUEST_FAILED_CODE = 'PILOT_COZE_REQUEST_FAILED'
export const PILOT_COZE_ATTACHMENT_FAILED_CODE = 'PILOT_COZE_ATTACHMENT_FAILED'

type PilotCozeResolvedTargetType = Extract<PilotProviderTargetType, 'coze_bot' | 'coze_workflow'>

export interface PilotCozeEngineOptions {
  channelId: string
  baseUrl: string
  providerModel: string
  providerTargetType: PilotCozeResolvedTargetType
  cozeAuthMode?: PilotCozeAuthMode
  oauthClientId: string
  oauthClientSecret: string
  oauthTokenUrl: string
  jwtAppId?: string
  jwtKeyId?: string
  jwtPrivateKey?: string
  jwtAudience?: string
  userId: string
  timeoutMs?: number
  metadata?: Record<string, unknown>
  onAudit?: (record: DeepAgentAuditRecord) => Promise<void> | void
}

interface ParsedDataUrl {
  bytes: Uint8Array
  mimeType: string
}

export class PilotCozeRequestError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly data: Record<string, unknown>

  constructor(message: string, data: Record<string, unknown>, statusCode = 502) {
    super(message)
    this.name = 'PilotCozeRequestError'
    this.code = String(data.code || PILOT_COZE_REQUEST_FAILED_CODE)
    this.statusCode = statusCode
    this.data = {
      code: this.code,
      ...data,
    }
  }
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.floor(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ''
  }
  const row = value as Record<string, unknown>
  return normalizeText(row.content || row.text || row.output_text)
}

function applyStreamChunk(previous: string, next: string): { merged: string, delta: string } {
  const candidate = String(next || '')
  if (!candidate) {
    return {
      merged: previous,
      delta: '',
    }
  }
  if (!previous) {
    return {
      merged: candidate,
      delta: candidate,
    }
  }
  if (candidate === previous) {
    return {
      merged: previous,
      delta: '',
    }
  }
  if (candidate.startsWith(previous)) {
    return {
      merged: candidate,
      delta: candidate.slice(previous.length),
    }
  }
  if (previous.endsWith(candidate)) {
    return {
      merged: previous,
      delta: '',
    }
  }
  return {
    merged: `${previous}${candidate}`,
    delta: candidate,
  }
}

function parseDataUrl(dataUrl: string, fallbackMimeType = 'application/octet-stream'): ParsedDataUrl {
  const matched = String(dataUrl || '').match(/^data:([^;]+);base64,([A-Z0-9+/=\s]+)$/i)
  if (!matched) {
    throw new PilotCozeRequestError('Coze 附件 dataUrl 非法。', {
      code: PILOT_COZE_ATTACHMENT_FAILED_CODE,
      reason: 'invalid_data_url',
    }, 422)
  }

  return {
    mimeType: normalizeText(matched[1]) || fallbackMimeType,
    bytes: Uint8Array.from(Buffer.from(String(matched[2] || '').replace(/\s+/g, ''), 'base64')),
  }
}

function resolveAttachmentFilename(attachment: UserMessageAttachment): string {
  return normalizeText(attachment.name) || `${attachment.type}-${normalizeText(attachment.id) || Date.now().toString(36)}`
}

function buildAttachmentPlaceholderText(attachments: UserMessageAttachment[]): string {
  if (attachments.length <= 0) {
    return ''
  }
  return 'Please analyze the provided attachments.'
}

function createAttachmentObjectItem(
  type: 'image' | 'file',
  input: { fileId?: string, fileUrl?: string },
): ObjectStringItem {
  if (type === 'image') {
    if (input.fileId) {
      return {
        type: 'image',
        file_id: input.fileId,
      }
    }
    return {
      type: 'image',
      file_url: String(input.fileUrl || ''),
    }
  }

  if (input.fileId) {
    return {
      type: 'file',
      file_id: input.fileId,
    }
  }
  return {
    type: 'file',
    file_url: String(input.fileUrl || ''),
  }
}

function buildSystemContextText(messages: TurnState['messages']): string {
  const chunks: string[] = []
  for (const item of toArray<Record<string, unknown>>(messages)) {
    if (!shouldIncludePilotMessageInModelContext(item)) {
      continue
    }
    const role = normalizeText(item.role).toLowerCase()
    if (role !== 'system') {
      continue
    }
    const content = normalizeText(item.content)
    if (content) {
      chunks.push(content)
    }
  }
  return chunks.join('\n\n').trim()
}

async function fetchAttachmentBytes(
  attachment: UserMessageAttachment,
  timeoutMs: number,
): Promise<ParsedDataUrl> {
  if (attachment.dataUrl) {
    return parseDataUrl(attachment.dataUrl, attachment.mimeType || undefined)
  }

  const candidateUrl = normalizeText(attachment.modelUrl || attachment.previewUrl || attachment.ref)
  if (!candidateUrl) {
    throw new PilotCozeRequestError('Coze 附件缺少可上传内容。', {
      code: PILOT_COZE_ATTACHMENT_FAILED_CODE,
      reason: 'missing_upload_source',
      attachmentId: attachment.id,
    }, 422)
  }

  const response = await networkClient.request<ArrayBuffer>({
    method: 'GET',
    url: candidateUrl,
    timeoutMs,
    responseType: 'arrayBuffer',
    headers: {
      accept: '*/*',
    },
  })

  return {
    bytes: new Uint8Array(response.data),
    mimeType: normalizeText(response.headers?.['content-type']) || attachment.mimeType || 'application/octet-stream',
  }
}

async function uploadAttachmentToCoze(
  client: CozeAPI,
  attachment: UserMessageAttachment,
  timeoutMs: number,
): Promise<string> {
  const parsed = await fetchAttachmentBytes(attachment, timeoutMs)
  const safeBytes = Uint8Array.from(parsed.bytes)
  const file = new File([safeBytes.buffer], resolveAttachmentFilename(attachment), {
    type: parsed.mimeType,
  })
  const uploaded = await client.files.upload({
    file,
  })
  return normalizeText(uploaded.id)
}

async function resolveAttachmentObjectItems(
  client: CozeAPI,
  attachments: UserMessageAttachment[],
  timeoutMs: number,
  onAudit?: PilotCozeEngineOptions['onAudit'],
): Promise<ObjectStringItem[]> {
  const list: ObjectStringItem[] = []

  for (const attachment of attachments) {
    const kind = attachment.type === 'image' ? 'image' : 'file'
    const providerFileId = normalizeText(attachment.providerFileId)
    const modelUrl = normalizeText(attachment.modelUrl || attachment.previewUrl || attachment.ref)
    if (providerFileId) {
      list.push(createAttachmentObjectItem(kind, { fileId: providerFileId }))
      continue
    }
    if (modelUrl && /^https?:\/\//i.test(modelUrl)) {
      list.push(createAttachmentObjectItem(kind, { fileUrl: modelUrl }))
      continue
    }

    const uploadedFileId = await uploadAttachmentToCoze(client, attachment, timeoutMs)
    if (!uploadedFileId) {
      throw new PilotCozeRequestError('Coze 附件上传失败。', {
        code: PILOT_COZE_ATTACHMENT_FAILED_CODE,
        reason: 'upload_empty_file_id',
        attachmentId: attachment.id,
      }, 502)
    }

    await onAudit?.({
      type: 'coze.attachment.uploaded',
      payload: {
        attachmentId: attachment.id,
        attachmentType: attachment.type,
        fileId: uploadedFileId,
        deliverySource: attachment.deliverySource,
      },
    })

    list.push(createAttachmentObjectItem(kind, { fileId: uploadedFileId }))
  }

  return list
}

async function buildCozeMessages(
  state: TurnState,
  client: CozeAPI,
  timeoutMs: number,
  onAudit?: PilotCozeEngineOptions['onAudit'],
): Promise<EnterMessage[]> {
  const systemContext = buildSystemContextText(state.messages)
  const list: EnterMessage[] = []

  for (const item of toArray<Record<string, unknown>>(state.messages)) {
    if (!shouldIncludePilotMessageInModelContext(item)) {
      continue
    }
    const role = normalizeText(item.role).toLowerCase()
    if (role === 'system') {
      continue
    }

    const content = normalizeText(item.content)
    if (!content) {
      continue
    }

    list.push({
      role: role === 'assistant' ? RoleType.Assistant : RoleType.User,
      content,
      content_type: 'text',
    })
  }

  const attachments = Array.isArray(state.attachments) ? state.attachments : []
  if (attachments.length > 0) {
    const lastUserIndex = [...list].reverse().findIndex(item => item.role === RoleType.User)
    const userIndex = lastUserIndex >= 0 ? list.length - 1 - lastUserIndex : -1
    const current = userIndex >= 0 ? list[userIndex] : undefined
    const prefixText = [systemContext, normalizeText(current?.content)].filter(Boolean).join('\n\n')
      || buildAttachmentPlaceholderText(attachments)
    const attachmentItems = await resolveAttachmentObjectItems(client, attachments, timeoutMs, onAudit)
    const contentItems: ObjectStringItem[] = []
    if (prefixText) {
      contentItems.push({
        type: 'text',
        text: prefixText,
      })
    }
    contentItems.push(...attachmentItems)

    const nextMessage: EnterMessage = {
      role: RoleType.User,
      content: contentItems,
      content_type: 'object_string',
    }

    if (userIndex >= 0) {
      list.splice(userIndex, 1, nextMessage)
    }
    else {
      list.push(nextMessage)
    }
    return list
  }

  if (systemContext) {
    const lastUserIndex = [...list].reverse().findIndex(item => item.role === RoleType.User)
    const userIndex = lastUserIndex >= 0 ? list.length - 1 - lastUserIndex : -1
    if (userIndex >= 0) {
      const current = list[userIndex]
      list.splice(userIndex, 1, {
        role: RoleType.User,
        content: [systemContext, normalizeText(current?.content)].filter(Boolean).join('\n\n'),
        content_type: 'text',
      })
    }
    else {
      list.push({
        role: RoleType.User,
        content: systemContext,
        content_type: 'text',
      })
    }
  }

  return list
}

function buildCozeError(error: unknown, fallbackMessage: string, extra?: Record<string, unknown>): PilotCozeRequestError {
  if (error instanceof PilotCozeRequestError) {
    return error
  }
  if (error instanceof PilotCozeAuthError) {
    return new PilotCozeRequestError(error.message, error.data, error.statusCode)
  }
  if (error instanceof PilotCozeOAuthError) {
    return new PilotCozeRequestError(error.message, error.data, error.statusCode)
  }

  const statusCode = parseHttpStatusCode(error) || Number((error as any)?.status || (error as any)?.statusCode || 0) || 502
  const message = error instanceof Error
    ? (error.message || fallbackMessage)
    : fallbackMessage
  return new PilotCozeRequestError(message, {
    code: PILOT_COZE_REQUEST_FAILED_CODE,
    reason: 'upstream_error',
    errorMessage: error instanceof Error ? error.message : String(error || ''),
    ...(extra || {}),
  }, statusCode >= 400 ? statusCode : 502)
}

export class PilotCozeEngineAdapter implements AgentEngineAdapter {
  readonly id = 'pilot-coze-engine'
  private readonly timeoutMs: number
  private readonly client: CozeAPI

  constructor(private readonly options: PilotCozeEngineOptions) {
    this.timeoutMs = normalizeTimeoutMs(options.timeoutMs)
    this.client = new CozeAPI({
      baseURL: options.baseUrl,
      token: async () => {
        return await getPilotCozeAccessToken({
          id: options.channelId,
          cozeAuthMode: options.cozeAuthMode,
          oauthClientId: options.oauthClientId,
          oauthClientSecret: options.oauthClientSecret,
          oauthTokenUrl: options.oauthTokenUrl,
          jwtAppId: options.jwtAppId,
          jwtKeyId: options.jwtKeyId,
          jwtPrivateKey: options.jwtPrivateKey,
          jwtAudience: options.jwtAudience,
          timeoutMs: this.timeoutMs,
        })
      },
      axiosOptions: {
        timeout: this.timeoutMs,
      },
    })
  }

  async run(state: TurnState): Promise<unknown> {
    let last: unknown = {
      done: true,
    }
    for await (const item of this.runStream(state)) {
      last = item
    }
    return last
  }

  async* runStream(state: TurnState): AsyncIterable<unknown> {
    const targetId = normalizeText(this.options.providerModel)
    if (!targetId) {
      throw new PilotCozeRequestError('Coze targetId 不能为空。', {
        code: PILOT_COZE_REQUEST_FAILED_CODE,
        reason: 'missing_target_id',
        channelId: this.options.channelId,
      }, 422)
    }

    try {
      const additionalMessages = await buildCozeMessages(
        state,
        this.client,
        this.timeoutMs,
        this.options.onAudit,
      )

      await this.options.onAudit?.({
        type: 'coze.request.started',
        payload: {
          channelId: this.options.channelId,
          providerModel: targetId,
          providerTargetType: this.options.providerTargetType,
          messageCount: additionalMessages.length,
          attachmentCount: Array.isArray(state.attachments) ? state.attachments.length : 0,
        },
      })

      const stream = this.options.providerTargetType === 'coze_workflow'
        ? await this.client.workflows.chat.stream({
            workflow_id: targetId,
            conversation_id: state.sessionId,
            additional_messages: additionalMessages,
            ext: {
              session_id: state.sessionId,
              turn_id: state.turnId,
            },
          })
        : await this.client.chat.stream({
            bot_id: targetId,
            user_id: this.options.userId,
            conversation_id: state.sessionId,
            auto_save_history: true,
            additional_messages: additionalMessages,
            meta_data: {
              session_id: state.sessionId,
              turn_id: state.turnId,
            },
          })

      let fullText = ''
      let fullThinking = ''

      for await (const part of stream) {
        if (part.event === ChatEventType.CONVERSATION_CHAT_CREATED || part.event === ChatEventType.CONVERSATION_CHAT_IN_PROGRESS) {
          const chatData = toRecord(part.data as unknown)
          await this.options.onAudit?.({
            type: 'coze.request.progress',
            payload: {
              channelId: this.options.channelId,
              providerModel: targetId,
              providerTargetType: this.options.providerTargetType,
              event: part.event,
              status: chatData.status,
            },
          })
          continue
        }

        if (part.event === ChatEventType.CONVERSATION_CHAT_FAILED) {
          const chatData = toRecord(part.data as unknown)
          const errorData = toRecord(chatData.last_error)
          throw new PilotCozeRequestError('Coze 上游执行失败。', {
            code: PILOT_COZE_REQUEST_FAILED_CODE,
            reason: 'conversation_failed',
            channelId: this.options.channelId,
            providerModel: targetId,
            providerTargetType: this.options.providerTargetType,
            upstream: {
              event: part.event,
              status: chatData.status,
              lastError: errorData,
            },
          }, 502)
        }

        if (part.event === ChatEventType.CONVERSATION_CHAT_REQUIRES_ACTION) {
          throw new PilotCozeRequestError('Coze 会话进入 requires_action，Pilot 当前版本不支持继续提交动作结果。', {
            code: PILOT_COZE_REQUEST_FAILED_CODE,
            reason: 'requires_action_unsupported',
            channelId: this.options.channelId,
            providerModel: targetId,
            providerTargetType: this.options.providerTargetType,
          }, 422)
        }

        if (part.event === ChatEventType.ERROR) {
          const errorData = toRecord(part.data)
          throw new PilotCozeRequestError('Coze 流式接口返回错误事件。', {
            code: PILOT_COZE_REQUEST_FAILED_CODE,
            reason: 'stream_error_event',
            channelId: this.options.channelId,
            providerModel: targetId,
            providerTargetType: this.options.providerTargetType,
            upstream: errorData,
          }, 502)
        }

        if (part.event === ChatEventType.DONE) {
          continue
        }

        if (
          part.event === ChatEventType.CONVERSATION_MESSAGE_DELTA
          || part.event === ChatEventType.CONVERSATION_MESSAGE_COMPLETED
        ) {
          const message = toRecord(part.data)
          const nextText = extractText(message.content)
          const nextThinking = normalizeText(message.reasoning_content)
          const textChunk = applyStreamChunk(fullText, nextText)
          const thinkingChunk = applyStreamChunk(fullThinking, nextThinking)
          fullText = textChunk.merged
          fullThinking = thinkingChunk.merged

          if (thinkingChunk.delta) {
            yield {
              thinking: thinkingChunk.delta,
              thinkingDone: false,
              done: false,
            }
          }

          if (textChunk.delta) {
            yield {
              text: textChunk.delta,
              done: false,
            }
          }
        }
      }

      await this.options.onAudit?.({
        type: 'coze.request.completed',
        payload: {
          channelId: this.options.channelId,
          providerModel: targetId,
          providerTargetType: this.options.providerTargetType,
          textLength: fullText.length,
          thinkingLength: fullThinking.length,
        },
      })

      yield {
        text: fullText || undefined,
        thinking: fullThinking || undefined,
        thinkingDone: fullThinking ? true : undefined,
        done: true,
      }
    }
    catch (error) {
      const statusCode = parseHttpStatusCode(error)
      if (statusCode === 401 || statusCode === 403) {
        invalidatePilotCozeAccessToken(this.options.channelId)
      }
      throw buildCozeError(error, 'Coze 请求失败。', {
        channelId: this.options.channelId,
        providerModel: this.options.providerModel,
        providerTargetType: this.options.providerTargetType,
      })
    }
  }
}
