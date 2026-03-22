import { describe, expect, it, vi } from 'vitest'
import {
  buildApprovalMonitorFailureAuditPatch,
  buildRejectedApprovalAuditPatch,
  normalizeToolApprovalTicket,
  pollToolApprovalDecision,
  resolveStreamRequestId,
} from '../../../app/composables/api/base/v1/aigc/completion/flow'

describe('pilot-completion-flow', () => {
  it('reuses existing request_id and skips createTurn', async () => {
    const createTurn = vi.fn(async () => ({
      requestId: 'request_new',
      turnId: 'turn_new',
      queuePos: 1,
    }))

    const requestId = await resolveStreamRequestId({
      existingRequestId: 'request_existing',
      createTurn,
    })

    expect(requestId).toBe('request_existing')
    expect(createTurn).not.toHaveBeenCalled()
  })

  it('creates turn when request_id is missing and emits accepted event', async () => {
    const createTurn = vi.fn(async () => ({
      requestId: 'request_created',
      turnId: 'turn_created',
      queuePos: 3,
    }))
    const accepted = vi.fn()

    const requestId = await resolveStreamRequestId({
      createTurn,
      onTurnAccepted: accepted,
    })

    expect(requestId).toBe('request_created')
    expect(createTurn).toHaveBeenCalledTimes(1)
    expect(accepted).toHaveBeenCalledWith({
      requestId: 'request_created',
      turnId: 'turn_created',
      queuePos: 3,
    })
  })

  it('polls approval until approved', async () => {
    let now = 0
    const responses = [
      { ticketId: 'ticket_1', status: 'pending' },
      { ticketId: 'ticket_1', status: 'approved' },
    ] as const
    let index = 0

    const ticket = await pollToolApprovalDecision({
      ticketId: 'ticket_1',
      timeoutMs: 1000,
      intervalMs: 10,
      now: () => now,
      sleep: async (ms) => {
        now += ms
      },
      fetchTicket: async () => {
        const response = responses[Math.min(index, responses.length - 1)]
        index += 1
        return normalizeToolApprovalTicket(response)
      },
    })

    expect(ticket.status).toBe('approved')
    expect(index).toBe(2)
  })

  it('returns rejected patch with decision reason first', () => {
    const patch = buildRejectedApprovalAuditPatch({
      fallbackMessage: 'fallback',
      ticket: {
        ticketId: 'ticket_1',
        status: 'rejected',
        reason: 'reason',
        decisionReason: 'decision',
      },
    })

    expect(patch).toEqual({
      auditType: 'tool.call.rejected',
      status: 'rejected',
      errorCode: 'TOOL_APPROVAL_REJECTED',
      errorMessage: 'decision',
    })
  })

  it('maps approval timeout to failed patch', () => {
    const patch = buildApprovalMonitorFailureAuditPatch({
      error: new Error('APPROVAL_MONITOR_TIMEOUT'),
      timeoutMs: 65000,
    })

    expect(patch).toEqual({
      auditType: 'tool.call.failed',
      status: 'failed',
      errorCode: 'TOOL_APPROVAL_TIMEOUT',
      errorMessage: '审批等待超时（>65s），请审批后手动重试。',
    })
  })

  it('poll timeout throws timeout code', async () => {
    let now = 0

    await expect(pollToolApprovalDecision({
      ticketId: 'ticket_timeout',
      timeoutMs: 20,
      intervalMs: 10,
      now: () => now,
      sleep: async (ms) => {
        now += ms
      },
      fetchTicket: async () => ({
        ticketId: 'ticket_timeout',
        status: 'pending',
      }),
    })).rejects.toThrow('APPROVAL_MONITOR_TIMEOUT')
  })
})
