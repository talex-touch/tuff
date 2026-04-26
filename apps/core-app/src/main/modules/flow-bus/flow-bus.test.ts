import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  clipboard: {
    writeHTML: vi.fn(),
    writeText: vi.fn()
  }
}))

vi.mock('./flow-consent', () => ({
  flowConsentStore: {
    consumeOnce: vi.fn(() => false),
    hasConsent: vi.fn(() => true)
  },
  requiresFlowConsent: vi.fn(() => false)
}))

vi.mock('./logger', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
  return {
    flowBusDispatchLog: logger,
    flowBusSessionLog: logger,
    flowBusTargetLog: logger
  }
})

import { FlowErrorCode } from '@talex-touch/utils/types/flow'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { flowBus } from './flow-bus'
import { flowSessionManager } from './session-manager'
import { flowTargetRegistry } from './target-registry'

afterEach(() => {
  flowTargetRegistry.clear()
  flowSessionManager.clear()
  PollingService.getInstance().unregister('flow-bus.cleanup')
})

describe('FlowBus delivery', () => {
  it('fails dispatch when a target has no delivery handler', async () => {
    flowTargetRegistry.registerTarget(
      'notes',
      {
        id: 'capture',
        name: 'Capture',
        supportedTypes: ['text']
      },
      { isEnabled: true, hasFlowHandler: false }
    )

    const result = await flowBus.dispatch(
      'sender',
      { type: 'text', data: 'hello' },
      { preferredTarget: 'notes.capture' }
    )

    expect(result.state).toBe('FAILED')
    expect(result.error?.code).toBe(FlowErrorCode.TARGET_OFFLINE)
    expect(result.error?.message).toContain('notes.capture')
  })

  it('propagates delivery handler failures instead of marking payloads delivered', async () => {
    flowTargetRegistry.registerTarget(
      'notes',
      {
        id: 'capture',
        name: 'Capture',
        supportedTypes: ['text']
      },
      { isEnabled: true, hasFlowHandler: true }
    )
    const dispose = flowBus.registerDeliveryHandler('notes', async () => {
      throw new Error('plugin transport failed')
    })

    try {
      const result = await flowBus.dispatch(
        'sender',
        { type: 'text', data: 'hello' },
        { preferredTarget: 'notes.capture' }
      )

      expect(result.state).toBe('FAILED')
      expect(result.error?.code).toBe(FlowErrorCode.INTERNAL_ERROR)
      expect(result.error?.message).toBe('plugin transport failed')
    } finally {
      dispose()
    }
  })
})
