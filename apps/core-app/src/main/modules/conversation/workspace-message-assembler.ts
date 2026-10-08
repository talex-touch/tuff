import type {
  AiMessagePart,
  AiReasoningPart,
  AiToolCallPart
} from '@talex-touch/tuffex/ai-elements'
import type {
  IntelligencePartEvent,
  IntelligenceStreamEvent,
  IntelligenceUsageInfo
} from '@talex-touch/utils/types/intelligence'
import type { StoredConversationMessage } from './conversation-store'
import { normalizeReasoningEffortDecision } from '@talex-touch/utils/intelligence/reasoning-effort'
import { sanitizeToolOutputForRuntime } from '../ai/pi-agent-runtime-host'

const PART_TEXT_LIMIT = 8 * 1024
const TRUNCATION_NOTICE = '\n[truncated]'

function boundedPartText(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= PART_TEXT_LIMIT) return value
  const budget = PART_TEXT_LIMIT - Buffer.byteLength(TRUNCATION_NOTICE, 'utf8')
  let end = 0
  let bytes = 0
  while (end < value.length) {
    const point = value.codePointAt(end)!
    const width = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
    if (bytes + width > budget) break
    bytes += width
    end += point > 0xffff ? 2 : 1
  }
  return value.slice(0, end) + TRUNCATION_NOTICE
}

function printableToolInput(value: unknown): string {
  const safe = sanitizeToolOutputForRuntime(value)
  return boundedPartText(typeof safe === 'string' ? safe : JSON.stringify(safe ?? null, null, 2))
}

/** Main's canonical turn projection. Commit/reset follows the existing Home contract. */
export class WorkspaceMessageAssembler {
  private parts: AiMessagePart[] | undefined
  private readonly tools = new Map<string, AiToolCallPart>()
  private openReasoning: AiReasoningPart | undefined
  private reasoningStartedAt: number | undefined
  private committed = { contentLength: 0, partsLength: 0, textLength: 0 }
  private readonly startedAt = Date.now()
  private content = ''
  private meta: Record<string, unknown>
  private status: StoredConversationMessage['status'] = 'streaming'
  private compacting = false
  private providerActivity = false

  constructor(
    private readonly initial: StoredConversationMessage,
    turnId: string
  ) {
    this.meta = { ...initial.meta, turnId }
  }

  get hasProviderActivity(): boolean {
    return this.providerActivity
  }

  get isCompacting(): boolean {
    return this.compacting
  }

  get text(): string {
    return this.content
  }

  delta(delta: string): void {
    if (!delta) return
    this.providerActivity = true
    this.content += delta
    if (this.parts) {
      const tail = this.parts[this.parts.length - 1]
      if (tail?.type === 'text') tail.text += delta
      else this.parts.push({ type: 'text', text: delta })
    }
  }

  recordUsage(usage: IntelligenceUsageInfo): void {
    for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
      const value = usage[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) this.meta[key] = value
    }
    this.meta.usageSource = 'provider'
    this.providerActivity = true
  }

  applyStream(event: IntelligenceStreamEvent<string>): void {
    if (event.provider) this.meta.provider = event.provider
    if (event.model) this.meta.model = event.model
    if (event.traceId) this.meta.traceId = event.traceId
    const reasoning = normalizeReasoningEffortDecision(event.reasoningEffort)
    if (reasoning) {
      this.meta.reasoningRequested = reasoning.requested
      this.meta.reasoningStatus = reasoning.status
      if (reasoning.applied) this.meta.reasoningApplied = reasoning.applied
      else delete this.meta.reasoningApplied
    }
    // Only `usage` is emitted at the raw-provider report boundary. `end` can contain
    // the SDK's empty fallback counters and is not evidence that a provider reported them.
    if (event.type === 'usage' && event.usage) this.recordUsage(event.usage)
    if (event.type === 'delta' && event.delta) this.delta(event.delta)
    if (event.type === 'part' && event.partEvent) this.part(event.partEvent)
  }

  private ensureParts(): AiMessagePart[] {
    if (!this.parts) {
      this.parts = this.content ? [{ type: 'text', text: this.content }] : []
      this.committed.partsLength = this.committed.contentLength > 0 ? 1 : 0
      this.committed.textLength = this.committed.contentLength
    }
    return this.parts
  }

  private commit(): void {
    const tail = this.parts?.[this.parts.length - 1]
    this.committed = {
      contentLength: this.content.length,
      partsLength: this.parts?.length ?? 0,
      textLength: tail?.type === 'text' ? tail.text.length : 0
    }
  }

  private resetToCommit(): void {
    this.content = this.content.slice(0, this.committed.contentLength)
    if (this.parts) {
      this.parts.length = this.committed.partsLength
      const tail = this.parts[this.parts.length - 1]
      if (tail?.type === 'text') tail.text = tail.text.slice(0, this.committed.textLength)
      this.tools.clear()
      for (const part of this.parts) if (part.type === 'tool-call') this.tools.set(part.id, part)
    }
    this.openReasoning = undefined
    this.reasoningStartedAt = undefined
  }

  part(event: IntelligencePartEvent): void {
    if (event.kind === 'message-commit') {
      this.commit()
      return
    }
    if (event.kind === 'text-reset') {
      this.resetToCommit()
      return
    }
    if (event.kind === 'compaction-start') {
      this.compacting = true
      this.meta.compactions =
        (typeof this.meta.compactions === 'number' ? this.meta.compactions : 0) + 1
      return
    }
    if (event.kind === 'compaction-end') {
      this.compacting = false
      return
    }
    this.providerActivity = true
    switch (event.kind) {
      case 'reasoning-start': {
        if (this.openReasoning && !this.openReasoning.done) return
        this.reasoningStartedAt = Date.now()
        this.openReasoning = { type: 'reasoning', text: '', done: false }
        this.ensureParts().push(this.openReasoning)
        return
      }
      case 'reasoning-delta':
        if (this.openReasoning) this.openReasoning.text += event.delta
        return
      case 'reasoning-end':
        if (this.openReasoning) {
          this.openReasoning.done = true
          this.openReasoning.durationMs =
            event.durationMs ??
            (this.reasoningStartedAt === undefined
              ? undefined
              : Date.now() - this.reasoningStartedAt)
        }
        this.openReasoning = undefined
        this.reasoningStartedAt = undefined
        return
      case 'tool-start': {
        // A replayed start names the same call; it does not create another card or
        // downgrade a result already observed for that identity.
        if (this.tools.has(event.callId)) return
        const tool: AiToolCallPart = {
          type: 'tool-call',
          id: event.callId,
          name: event.name,
          status: 'running'
        }
        this.tools.set(event.callId, tool)
        this.ensureParts().push(tool)
        return
      }
      case 'tool-input-delta': {
        const tool = this.tools.get(event.callId)
        if (tool && tool.status === 'running')
          tool.logs = boundedPartText((tool.logs ?? '') + event.delta)
        return
      }
      case 'tool-input-end': {
        const tool = this.tools.get(event.callId)
        if (tool) {
          tool.input = printableToolInput(event.input)
          tool.logs = undefined
        }
        return
      }
      case 'tool-result': {
        let tool = this.tools.get(event.callId)
        if (!tool) {
          tool = { type: 'tool-call', id: event.callId, name: event.name, status: 'pending' }
          this.tools.set(event.callId, tool)
          this.ensureParts().push(tool)
        }
        tool.status = event.isError ? 'error' : 'done'
        const output = sanitizeToolOutputForRuntime(event.output)
        const text = boundedPartText(
          typeof output === 'string' ? output : JSON.stringify(output ?? null)
        )
        if (event.isError) {
          tool.error = text
          tool.output = undefined
        } else {
          tool.output = text
          tool.error = undefined
        }
        return
      }
    }
  }

  complete(text?: string): void {
    if (typeof text === 'string' && text !== this.content) {
      // Invocation fallback can supply the whole answer, whereas streams already
      // assembled it. Do not append an entire final answer to its own deltas.
      if (!this.content) this.delta(text)
      else if (text.startsWith(this.content)) this.delta(text.slice(this.content.length))
      else {
        const committedPrefix = this.content.slice(0, this.committed.contentLength)
        if (text.startsWith(committedPrefix)) {
          // A whole final answer replaces provisional text, not completed tools.
          this.content = committedPrefix
          if (this.parts) {
            const tail = this.parts[this.committed.partsLength - 1]
            this.parts = this.parts.filter(
              (part, index) => index < this.committed.partsLength || part.type !== 'text'
            )
            if (tail?.type === 'text') tail.text = tail.text.slice(0, this.committed.textLength)
          }
          this.delta(text.slice(committedPrefix.length))
        } else {
          this.content = text
          if (this.parts) {
            this.parts = this.parts.filter((part) => part.type !== 'text')
            this.parts.push({ type: 'text', text })
          }
        }
      }
    }
    if (!this.content.trim()) {
      this.fail('CONVERSATION_EMPTY_RESPONSE')
      return
    }
    this.status = 'complete'
    this.meta.outcome = 'completed'
    this.closeOpenParts()
  }

  fail(code: string, outcome: 'failed' | 'cancelled' | 'interrupted' = 'failed'): void {
    this.status = 'failed'
    this.meta.errorCode = code
    this.meta.outcome = outcome
    this.closeOpenParts()
  }

  private closeOpenParts(): void {
    this.compacting = false
    this.meta.latencyMs = Date.now() - this.startedAt
    if (this.openReasoning) this.openReasoning.done = true
    this.openReasoning = undefined
    for (const tool of this.tools.values()) {
      if (tool.status === 'running' || tool.status === 'pending') {
        tool.status = 'error'
        tool.error = 'TOOL_EXECUTION_INTERRUPTED'
      }
    }
  }

  snapshot(): StoredConversationMessage {
    const parts = this.parts?.map((part) =>
      part.type === 'text'
        ? { ...part }
        : part.type === 'reasoning'
          ? { ...part, text: boundedPartText(part.text) }
          : part.type === 'tool-call' && part.logs !== undefined
            ? { ...part, logs: printableToolInput(part.logs) }
            : { ...part }
    )
    return {
      ...this.initial,
      content: this.content,
      status: this.status,
      meta: { ...this.meta, ...(parts ? { parts } : {}) }
    }
  }
}
