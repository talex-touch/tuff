import { describe, expect, it, vi } from 'vitest'

vi.mock('./manager', () => ({
  DivisionBoxManager: {
    getInstance: () => ({
      createSession: async () => ({ sessionId: 'unused' })
    })
  }
}))

describe('FlowTriggerManager', () => {
  it('returns explicit unavailable status instead of opening a placeholder session', async () => {
    const { FLOW_TRIGGER_UNAVAILABLE_CODE, flowTriggerManager } = await import('./flow-trigger')

    await expect(
      flowTriggerManager.handleFlow('plugin.notes.quick-capture', {
        type: 'text',
        data: 'hello'
      })
    ).rejects.toThrow(FLOW_TRIGGER_UNAVAILABLE_CODE)
  })
})
