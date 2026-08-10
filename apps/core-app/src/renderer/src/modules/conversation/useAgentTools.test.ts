/**
 * `settle()` advanced the queue before awaiting `sdk.decide` and had no catch. A failed decide was
 * therefore both an unhandled rejection — HomePage binds it straight to a template handler — and an
 * unrecoverable state: the card was gone and the gateway never got an answer, so the turn hung on
 * a blocked tool call with nothing on screen (#828).
 *
 * The issue offered "await decide before advancing" as one option. That would undo the fast advance
 * the code documents ("the gateway answering slowly must not leave a dead card on screen taking
 * clicks"), so the failed request is re-queued instead — recovery without a dead card. The last
 * test pins the advance so a later reading of this file does not quietly reintroduce it.
 */
import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  decide: vi.fn(async () => undefined),
  /** The handler the composable registered for confirmRequest. */
  emitRequest: null as null | ((request: AgentToolConfirmRequest) => void)
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (_event: unknown, handler: (request: AgentToolConfirmRequest) => void) => {
      mocks.emitRequest = handler
      return vi.fn()
    },
    send: vi.fn()
  })
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/agent-tools', () => ({
  AgentToolEvents: { confirmRequest: { toEventName: () => 'agent-tools:confirm-request' } },
  createAgentToolsSdk: () => ({
    decide: mocks.decide,
    setEnabled: vi.fn(async () => ({ tools: [] })),
    resetApprovals: vi.fn(async () => undefined)
  })
}))

import { useAgentTools } from './useAgentTools'

function request(requestId: string): AgentToolConfirmRequest {
  return { requestId, toolName: 'fs.read', input: {} } as unknown as AgentToolConfirmRequest
}

describe('a failed tool decision is recoverable', () => {
  beforeEach(() => {
    mocks.decide.mockReset()
    mocks.decide.mockResolvedValue(undefined)
    mocks.emitRequest = null
  })

  it('decide 失败时不产生未处理的 rejection', async () => {
    mocks.decide.mockRejectedValue(new Error('transport destroyed'))
    const tools = useAgentTools()
    mocks.emitRequest?.(request('r1'))

    await expect(tools.approve(false)).resolves.toBeUndefined()
  })

  it('失败的请求会回到队列,用户可以重答', async () => {
    mocks.decide.mockRejectedValue(new Error('transport destroyed'))
    const tools = useAgentTools()
    mocks.emitRequest?.(request('r1'))

    await tools.approve(false)

    // The card comes back rather than the request being silently lost.
    expect(tools.pending.value?.requestId).toBe('r1')
  })

  it('已有别的请求占着卡片时,失败的那个排到后面而不是顶掉它', async () => {
    mocks.decide.mockRejectedValue(new Error('transport destroyed'))
    const tools = useAgentTools()
    mocks.emitRequest?.(request('r1'))
    mocks.emitRequest?.(request('r2'))

    await tools.approve(false)

    expect(tools.pending.value?.requestId).toBe('r2')
    expect(tools.queued.value.map((entry) => entry.requestId)).toEqual(['r1'])
  })

  it('失败会被记录,而不是静默吞掉', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.decide.mockRejectedValue(new Error('transport destroyed'))
    const tools = useAgentTools()
    mocks.emitRequest?.(request('r1'))

    await tools.approve(false)

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('成功时请求不会回流,队列正常前进(否则上面几条会掩盖"永远重排")', async () => {
    const tools = useAgentTools()
    mocks.emitRequest?.(request('r1'))
    mocks.emitRequest?.(request('r2'))

    await tools.approve(true)

    expect(mocks.decide).toHaveBeenCalledWith({
      requestId: 'r1',
      approved: true,
      remember: true
    })
    expect(tools.pending.value?.requestId).toBe('r2')
    expect(tools.queued.value).toEqual([])
  })

  it('卡片在 decide 落地之前就已经换掉了 —— 这个快速前进是刻意的,不要改回 await 再前进', async () => {
    let releaseDecide: (() => void) | undefined
    mocks.decide.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          releaseDecide = () => resolve(undefined)
        })
    )
    const tools = useAgentTools()
    mocks.emitRequest?.(request('r1'))
    mocks.emitRequest?.(request('r2'))

    const settling = tools.approve(true)
    // decide has not resolved yet, and the next card is already up.
    expect(tools.pending.value?.requestId).toBe('r2')

    releaseDecide?.()
    await settling
  })
})
