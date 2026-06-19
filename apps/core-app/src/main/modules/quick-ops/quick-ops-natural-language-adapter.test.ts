import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchQuickOpsNaturalLanguageRequest,
  resolveQuickOpsNaturalLanguageRequest
} from './quick-ops-natural-language-adapter'

const { dispatchMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn()
}))

vi.mock('../flow-bus/flow-bus', () => ({
  flowBus: {
    dispatch: dispatchMock
  }
}))

describe('QuickOps natural-language adapter contract', () => {
  beforeEach(() => {
    dispatchMock.mockReset()
  })

  it('maps read-only network requests to Flow dispatch plans', () => {
    const dns = resolveQuickOpsNaturalLanguageRequest({
      text: 'DNS 查询 example.com',
      source: 'test'
    })

    expect(dns).toMatchObject({
      decision: 'ready',
      risk: 'read-only',
      targetId: 'quickops.dns-query',
      payload: {
        type: 'json',
        data: {
          hostname: 'example.com',
          deep: false
        }
      },
      dispatchOptions: {
        preferredTarget: 'quickops.dns-query',
        skipSelector: true,
        requireAck: true
      },
      trace: {
        targetId: 'quickops.dns-query',
        decision: 'ready',
        confirmation: 'not-required',
        result: 'dispatch-plan',
        payloadKeys: ['deep', 'hostname'],
        sensitivePayloadRedacted: true,
        runtimeDispatchBridge: false
      }
    })

    const port = resolveQuickOpsNaturalLanguageRequest({ text: 'check port 3000' })
    expect(port.targetId).toBe('quickops.port-status')
    expect(port.payload?.data).toEqual({ port: 3000 })
  })

  it('marks state-changing requests as confirmation-required without executing them', () => {
    const timer = resolveQuickOpsNaturalLanguageRequest({ text: '开一个 25 分钟计时器' })

    expect(timer).toMatchObject({
      decision: 'requires-confirmation',
      risk: 'confirm',
      targetId: 'quickops.start-timer',
      payload: {
        data: {
          durationMs: 25 * 60 * 1000
        }
      },
      trace: {
        confirmation: 'required',
        result: 'dispatch-plan',
        runtimeDispatchBridge: false
      }
    })
  })

  it('redacts clipboard payload values from trace output', () => {
    const plan = resolveQuickOpsNaturalLanguageRequest({
      text: '把 "secret-token-123" 复制到剪贴板'
    })

    expect(plan).toMatchObject({
      decision: 'requires-confirmation',
      targetId: 'quickops.copy-to-clipboard',
      payload: {
        data: {
          text: 'secret-token-123'
        }
      },
      trace: {
        payloadKeys: ['text'],
        sensitivePayloadRedacted: true
      }
    })
    expect(JSON.stringify(plan.trace)).not.toContain('secret-token-123')
  })

  it('blocks high-risk requests instead of producing execution dispatch plans', () => {
    const plan = resolveQuickOpsNaturalLanguageRequest({ text: 'kill port 3000 now' })

    expect(plan).toMatchObject({
      decision: 'blocked',
      risk: 'high-risk',
      reason: 'high-risk-blocked',
      targetId: undefined,
      payload: undefined,
      dispatchOptions: undefined,
      trace: {
        confirmation: 'blocked',
        result: 'blocked',
        payloadKeys: [],
        runtimeDispatchBridge: false
      }
    })
  })

  it('returns degraded or unsupported plans for incomplete requests', () => {
    const missingDnsHost = resolveQuickOpsNaturalLanguageRequest({ text: 'dns 查询一下' })
    expect(missingDnsHost).toMatchObject({
      decision: 'degraded',
      targetId: 'quickops.dns-query',
      payload: {
        data: {
          text: 'dns 查询一下'
        }
      }
    })

    const unsupported = resolveQuickOpsNaturalLanguageRequest({ text: 'make coffee' })
    expect(unsupported).toMatchObject({
      decision: 'unsupported',
      reason: 'unsupported-request',
      trace: {
        result: 'unsupported',
        runtimeDispatchBridge: false
      }
    })
  })

  it('dispatches read-only plans through FlowBus without requiring confirmation', async () => {
    dispatchMock.mockResolvedValueOnce({
      sessionId: 'session-1',
      state: 'ACKED',
      ackPayload: { ok: true }
    })

    const result = await dispatchQuickOpsNaturalLanguageRequest({ text: 'DNS 查询 example.com' })

    expect(result).toMatchObject({
      dispatched: true,
      result: {
        state: 'ACKED'
      },
      plan: {
        trace: {
          runtimeDispatchBridge: true
        }
      }
    })
    expect(dispatchMock).toHaveBeenCalledWith(
      'quickops.ai-natural-language-adapter',
      expect.objectContaining({
        type: 'json',
        data: {
          hostname: 'example.com',
          deep: false
        }
      }),
      expect.objectContaining({
        preferredTarget: 'quickops.dns-query',
        requireAck: true,
        skipSelector: true,
        confirmationToken: undefined
      })
    )
  })

  it('requires confirmation token before dispatching confirmation-required plans', async () => {
    const missingToken = await dispatchQuickOpsNaturalLanguageRequest({
      text: '开一个 25 分钟计时器'
    })

    expect(missingToken).toMatchObject({
      dispatched: false,
      reason: 'confirmation-token-required',
      plan: {
        decision: 'requires-confirmation',
        trace: {
          runtimeDispatchBridge: false
        }
      }
    })
    expect(dispatchMock).not.toHaveBeenCalled()

    dispatchMock.mockResolvedValueOnce({
      sessionId: 'session-2',
      state: 'ACKED'
    })

    const confirmed = await dispatchQuickOpsNaturalLanguageRequest({
      text: '开一个 25 分钟计时器',
      confirmationToken: 'confirm-once-token'
    })

    expect(confirmed.dispatched).toBe(true)
    expect(dispatchMock).toHaveBeenCalledWith(
      'quickops.ai-natural-language-adapter',
      expect.any(Object),
      expect.objectContaining({
        preferredTarget: 'quickops.start-timer',
        confirmationToken: 'confirm-once-token'
      })
    )
  })

  it('does not dispatch high-risk or degraded plans', async () => {
    const highRisk = await dispatchQuickOpsNaturalLanguageRequest({ text: 'kill port 3000 now' })
    expect(highRisk).toMatchObject({
      dispatched: false,
      reason: 'high-risk-blocked'
    })

    const degraded = await dispatchQuickOpsNaturalLanguageRequest({ text: 'dns 查询一下' })
    expect(degraded).toMatchObject({
      dispatched: false,
      reason: 'degraded-plan'
    })

    expect(dispatchMock).not.toHaveBeenCalled()
  })
})
