import { describe, expect, it } from 'vitest'
import type { IntelligenceLabAction } from '../tuffIntelligenceLabService'
import {
  isRetryableInvokeError,
  isReadOnlyTool,
  shouldContinueOnActionFailure,
  sanitizeLabActions,
} from '../tuffIntelligenceLabService'

function buildToolAction(overrides: Partial<IntelligenceLabAction> = {}): IntelligenceLabAction {
  return {
    id: 'action_1',
    title: 'Read account snapshot',
    type: 'tool',
    toolId: 'intelligence.nexus.account.snapshot.get',
    riskLevel: 'low',
    input: {},
    ...overrides,
  }
}

describe('intelligence agent failure policy', () => {
  it('低风险只读工具且 action 显式 continueOnError=true 才允许继续', () => {
    const action = buildToolAction({ continueOnError: true })
    expect(shouldContinueOnActionFailure(action, false)).toBe(true)
  })

  it('未显式 continueOnError 时默认 fail-fast', () => {
    const action = buildToolAction({ continueOnError: false })
    expect(shouldContinueOnActionFailure(action, false)).toBe(false)
  })

  it('高风险工具即使显式 continueOnError 也不允许继续', () => {
    const action = buildToolAction({
      toolId: 'intelligence.fs.delete',
      riskLevel: 'high',
      continueOnError: true,
    })
    expect(shouldContinueOnActionFailure(action, false)).toBe(false)
  })

  it('全局 continueOnError=true 时保持向后兼容', () => {
    const action = buildToolAction({
      toolId: 'intelligence.fs.delete',
      riskLevel: 'high',
      continueOnError: false,
    })
    expect(shouldContinueOnActionFailure(action, true)).toBe(true)
  })

  it('sanitizeLabActions 保留 continueOnError 字段', () => {
    const actions = sanitizeLabActions([
      {
        id: 'action_1',
        title: 'Read account snapshot',
        type: 'tool',
        toolId: 'intelligence.nexus.account.snapshot.get',
        riskLevel: 'low',
        continueOnError: true,
      },
    ])
    expect(actions).toHaveLength(1)
    expect(actions[0]?.continueOnError).toBe(true)
  })

  it('只读工具识别包含 list/get/read/snapshot/status', () => {
    expect(isReadOnlyTool('intelligence.nexus.credits.summary.get')).toBe(true)
    expect(isReadOnlyTool('intelligence.nexus.account.snapshot.get')).toBe(true)
    expect(isReadOnlyTool('intelligence.nexus.theme.set')).toBe(false)
  })

  it('超时错误识别为可重试', () => {
    expect(isRetryableInvokeError(new Error('Request timeout after 30000ms'))).toBe(true)
  })

  it('4xx 参数错误不重试', () => {
    const error = Object.assign(new Error('Invalid request body'), { status: 400 })
    expect(isRetryableInvokeError(error)).toBe(false)
  })
})
