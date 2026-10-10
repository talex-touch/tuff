import type { AiAttachment, AiMessagePart } from '@talex-touch/tuffex/ai-elements'
import type { MessageUpdateEvent } from '@talex-touch/pi-desktop-reuse/message-stream'
import type { UiMessage } from '@talex-touch/pi-desktop-reuse/types/message-stream'
import type {
  WorkspaceAttachmentRef,
  WorkspaceHostMessage
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type {
  ConversationMessage,
  ConversationMessageStatus,
  ConversationTurnMeta
} from './useHomeConversation'
import { applyMessageUpdate } from '@talex-touch/pi-desktop-reuse/message-stream'

/**
 * The narrow projection between Tuff's Home message and PI-Desktop's streaming row.
 *
 * Main streams a running reply as upstream `message_update` frames (`toWireMessageUpdate` +
 * `mergeMessageUpdates` on its side): a snapshot carries the whole Tuff message in `message.host`,
 * a delta only the text or reasoning appended since. This module is the renderer's half — it hands
 * the live row to upstream `applyMessageUpdate` as a `UiMessage` and reads the result back into the
 * Tuff shape. The one thing upstream has no notion of is Tuff's interleaved `parts`, so an appended
 * delta is mirrored into the trailing text or open reasoning part here; everything structural (a tool
 * call, a rollback to the last commit, the end of the turn) arrives as a snapshot instead.
 */

const STATUS_TO_UPSTREAM: Record<ConversationMessageStatus, NonNullable<UiMessage['status']>> = {
  complete: 'complete',
  streaming: 'streaming',
  failed: 'error'
}

function fromUpstreamStatus(
  status: UiMessage['status'] | undefined
): ConversationMessageStatus | undefined {
  if (status === 'streaming' || status === 'complete') return status
  if (status === 'error' || status === 'aborted') return 'failed'
  return undefined
}

/**
 * An attachment Main holds for this conversation, as the bubble shows it. Only a URL Main issued
 * for its own copy can draw an image; without one the row still names the file, so nothing
 * pretends to be a preview it cannot load.
 */
export function toDisplayAttachment(ref: WorkspaceAttachmentRef): AiAttachment {
  if (ref.kind === 'image' && ref.previewUrl) {
    return { kind: 'image', id: ref.id, url: ref.previewUrl, name: ref.name }
  }
  return {
    kind: 'file',
    id: ref.id,
    name: ref.name ?? ref.id,
    size: ref.size,
    mime: ref.mimeType
  }
}

/**
 * A stored or streamed Main message in the shape the Home stream renders. Turn metadata stays the
 * flat record the side panel and the top bar read; parts are taken as Main persisted them.
 */
export function fromHostMessage(host: WorkspaceHostMessage): ConversationMessage {
  const message: ConversationMessage = {
    id: host.id,
    role: host.role,
    content: host.content,
    status: host.status
  }
  if (host.error) message.error = host.error
  if (host.meta && Object.keys(host.meta).length > 0) {
    message.meta = host.meta as ConversationTurnMeta
  }
  if (Array.isArray(host.parts) && host.parts.length > 0) {
    message.parts = host.parts as AiMessagePart[]
  }
  // Main persists only what it carried to the model, so every ref here reached it; the bubble's
  // "stayed local" hint is decided at send time instead (HomePage `submit`). A voice message's
  // recording is the exception — never carried, shown as the voice it was — and so not a tray item.
  const audio = host.attachments?.find((ref) => ref.kind === 'audio' && ref.previewUrl)
  if (audio?.previewUrl) {
    message.voice = {
      url: audio.previewUrl,
      ...(audio.durationMs === undefined ? {} : { durationMs: audio.durationMs })
    }
  }
  const shown = host.attachments?.filter((ref) => ref.kind !== 'audio') ?? []
  if (shown.length) message.attachments = shown.map(toDisplayAttachment)
  return message
}

function toUiMessage(message: ConversationMessage): UiMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: '',
    status: STATUS_TO_UPSTREAM[message.status],
    ...(message.meta?.provider ? { providerId: message.meta.provider } : {}),
    ...(message.meta?.model ? { modelId: message.meta.model } : {}),
    host: message
  }
}

function isHostMessage(value: unknown): value is WorkspaceHostMessage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WorkspaceHostMessage>
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string' &&
    (candidate.status === 'complete' ||
      candidate.status === 'streaming' ||
      candidate.status === 'failed')
  )
}

/** Appends streamed text to the trailing text part, or opens one after a tool or reasoning span. */
function appendText(parts: AiMessagePart[], delta: string, reset: boolean): void {
  const last = parts[parts.length - 1]
  if (last?.type === 'text') {
    last.text = reset ? delta : last.text + delta
    return
  }
  if (delta) parts.push({ type: 'text', text: delta })
}

function appendReasoning(parts: AiMessagePart[], delta: string, reset: boolean): void {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part?.type === 'reasoning' && !part.done) {
      part.text = reset ? delta : part.text + delta
      return
    }
  }
  if (delta) parts.push({ type: 'reasoning', text: delta, done: false })
}

/**
 * Applies one frame to the row it names; `undefined` when the frame cannot be applied — a delta
 * for a row this window has not received yet waits for the state that introduces it, and a snapshot
 * that does not carry a Tuff message is ignored rather than rendered half-known.
 */
export function applyWorkspaceUpdate(
  previous: ConversationMessage | undefined,
  update: MessageUpdateEvent
): ConversationMessage | undefined {
  if (update.stream !== 'delta') {
    const next = applyMessageUpdate(previous ? toUiMessage(previous) : undefined, update)
    return isHostMessage(next.host) ? fromHostMessage(next.host) : undefined
  }
  if (!previous || previous.id !== update.message.id) return undefined
  const next = applyMessageUpdate(toUiMessage(previous), update)
  const patched: ConversationMessage = {
    ...previous,
    content: next.content,
    status: fromUpstreamStatus(next.status) ?? previous.status
  }
  if (previous.parts && (update.deltaText !== undefined || update.resetText)) {
    patched.parts = previous.parts.map((part) => ({ ...part }))
    appendText(patched.parts, update.deltaText ?? '', update.resetText === true)
  }
  if (update.deltaThinking !== undefined || update.resetThinking) {
    // Reasoning only exists as parts in Tuff, so a reply that starts thinking enters parts mode
    // with whatever text it had already streamed as its leading part.
    const parts =
      patched.parts ??
      (previous.parts
        ? previous.parts.map((part) => ({ ...part }))
        : previous.content
          ? [{ type: 'text' as const, text: previous.content }]
          : [])
    appendReasoning(parts, update.deltaThinking ?? '', update.resetThinking === true)
    patched.parts = parts
  }
  return patched
}
