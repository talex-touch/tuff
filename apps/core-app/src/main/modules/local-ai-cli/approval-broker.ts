import { randomUUID } from 'node:crypto'
import type {
  LocalAiCliApprovalRequest,
  LocalAiCliProviderId
} from '@talex-touch/utils/transport/events/local-ai-cli'
import { LOCAL_AI_CLI_LIMITS } from '@talex-touch/utils/transport/events/local-ai-cli'

export type LocalAiCliApprovalResolution = 'allow-once' | 'deny'

interface ApprovalRequestInput {
  callId: string
  ownerId: number
  provider: LocalAiCliProviderId
  toolName: string
  operation: LocalAiCliApprovalRequest['operation']
  summary: string
  signal: AbortSignal
  emit: (request: LocalAiCliApprovalRequest) => void
}

interface PendingApproval {
  callId: string
  ownerId: number
  timer: NodeJS.Timeout
  abort: () => void
  resolve: (decision: LocalAiCliApprovalResolution) => void
}

const APPROVAL_TTL_MS = 60_000

export class LocalAiCliApprovalBroker {
  private readonly pending = new Map<string, PendingApproval>()

  request(input: ApprovalRequestInput): Promise<LocalAiCliApprovalResolution> {
    if (input.signal.aborted) return Promise.resolve('deny')
    const approvalId = randomUUID()
    const expiresAt = Date.now() + APPROVAL_TTL_MS
    const { promise, resolve } = Promise.withResolvers<LocalAiCliApprovalResolution>()
    const settle = (decision: LocalAiCliApprovalResolution): void => {
      const pending = this.pending.get(approvalId)
      if (!pending) return
      clearTimeout(pending.timer)
      input.signal.removeEventListener('abort', pending.abort)
      this.pending.delete(approvalId)
      resolve(decision)
    }
    const abort = (): void => settle('deny')
    const timer = setTimeout(abort, APPROVAL_TTL_MS)
    this.pending.set(approvalId, {
      callId: input.callId,
      ownerId: input.ownerId,
      timer,
      abort,
      resolve: settle
    })
    input.signal.addEventListener('abort', abort, { once: true })
    input.emit({
      approvalId,
      callId: input.callId,
      provider: input.provider,
      toolName: input.toolName.trim().slice(0, 80) || 'Local agent tool',
      operation: input.operation,
      summary: input.summary.trim().slice(0, LOCAL_AI_CLI_LIMITS.approvalSummaryChars),
      expiresAt
    })
    return promise
  }

  resolve(approvalId: string, ownerId: number, decision: LocalAiCliApprovalResolution): void {
    const pending = this.pending.get(approvalId)
    if (!pending) throw new Error('LOCAL_AI_CLI_APPROVAL_NOT_FOUND')
    if (pending.ownerId !== ownerId) throw new Error('LOCAL_AI_CLI_APPROVAL_OWNER_MISMATCH')
    pending.resolve(decision)
  }

  cancelCall(callId: string): void {
    for (const [approvalId, pending] of this.pending) {
      if (pending.callId === callId) pending.resolve('deny')
      if (!this.pending.has(approvalId)) continue
    }
  }

  destroy(): void {
    for (const pending of [...this.pending.values()]) pending.resolve('deny')
  }
}
