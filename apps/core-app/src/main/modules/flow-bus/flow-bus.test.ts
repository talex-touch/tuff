import { afterEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  app: {
    getLocale: vi.fn(() => 'zh-CN'),
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
    setPath: vi.fn()
  },
  clipboard: {
    writeHTML: vi.fn(),
    writeText: vi.fn()
  },
  crashReporter: {
    start: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn()
  },
  MessageChannelMain: vi.fn(),
  powerMonitor: {
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))

vi.mock('electron', () => ({
  __esModule: true,
  default: electronMock,
  ...electronMock
}))

vi.mock('@sentry/electron/main', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  init: vi.fn(),
  setContext: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn()
}))

vi.mock('../../core/precore', () => ({
  innerRootPath: '/tmp/tuff-test',
  rootPath: '/tmp/tuff-test'
}))

const flowConsentMock = vi.hoisted(() => {
  let confirmationToken: string | null = null
  return {
    store: {
      consumeConfirmationOnce: vi.fn((_senderId: string, _targetId: string, token: string) => {
        if (!confirmationToken || confirmationToken !== token) return false
        confirmationToken = null
        return true
      }),
      consumeOnce: vi.fn(() => false),
      grantConfirmationOnce: vi.fn((_senderId: string, _targetId: string) => {
        confirmationToken = 'flow-confirm-token'
        return confirmationToken
      }),
      hasConsent: vi.fn(() => true)
    },
    reset: () => {
      confirmationToken = null
    }
  }
})

vi.mock('./flow-consent', () => ({
  flowConsentStore: flowConsentMock.store,
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

vi.mock('./flow-audit-logger', () => ({
  flowAuditLogger: {
    log: vi.fn(),
    logSessionComplete: vi.fn()
  }
}))

import { FlowErrorCode } from '@talex-touch/utils/types/flow'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { flowBus } from './flow-bus'
import { flowSessionManager } from './session-manager'
import { flowTargetRegistry } from './target-registry'

afterEach(() => {
  flowTargetRegistry.clear()
  flowSessionManager.clear()
  flowConsentMock.reset()
  vi.clearAllMocks()
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

  it('preserves synchronous acknowledgment from delivery handlers', async () => {
    flowTargetRegistry.registerTarget(
      'quickops',
      {
        id: 'capabilities',
        name: 'QuickOps Capabilities',
        supportedTypes: ['json', 'text']
      },
      { isEnabled: true, hasFlowHandler: true }
    )
    const dispose = flowBus.registerDeliveryHandler('quickops', async (session) => {
      flowBus.acknowledge(session.sessionId, {
        kind: 'quickops.capabilities',
        text: 'QuickOps Capabilities'
      })
    })

    try {
      const result = await flowBus.dispatch(
        'sender',
        { type: 'json', data: { request: 'capabilities' } },
        { preferredTarget: 'quickops.capabilities', requireAck: true }
      )

      expect(result).toEqual({
        sessionId: expect.any(String),
        state: 'ACKED',
        ackPayload: {
          kind: 'quickops.capabilities',
          text: 'QuickOps Capabilities'
        }
      })
      expect(flowSessionManager.getSession(result.sessionId)?.state).toBe('ACKED')
    } finally {
      dispose()
    }
  })

  it('blocks requireConfirm targets until a one-time confirmation token is provided', async () => {
    const deliveryHandler = vi.fn()
    flowTargetRegistry.registerTarget(
      'quickops',
      {
        id: 'temp-text-file',
        name: 'QuickOps Temp Text File',
        requireConfirm: true,
        supportedTypes: ['json']
      },
      { isEnabled: true, hasFlowHandler: true }
    )
    const dispose = flowBus.registerDeliveryHandler('quickops', deliveryHandler)

    try {
      const result = await flowBus.dispatch(
        'corebox',
        { type: 'json', data: { text: 'hello' } },
        { preferredTarget: 'quickops.temp-text-file' }
      )

      expect(result.state).toBe('FAILED')
      expect(result.error).toEqual({
        code: FlowErrorCode.PERMISSION_DENIED,
        message: 'Flow target confirmation required',
        details: {
          senderId: 'corebox',
          targetId: 'quickops.temp-text-file',
          reason: 'flow-confirmation-required'
        }
      })
      expect(deliveryHandler).not.toHaveBeenCalled()
    } finally {
      dispose()
    }
  })

  it('consumes confirmation tokens once for requireConfirm targets', async () => {
    flowTargetRegistry.registerTarget(
      'quickops',
      {
        id: 'temp-text-file',
        name: 'QuickOps Temp Text File',
        requireConfirm: true,
        supportedTypes: ['json']
      },
      { isEnabled: true, hasFlowHandler: true }
    )
    const dispose = flowBus.registerDeliveryHandler('quickops', async (session) => {
      flowBus.acknowledge(session.sessionId, { kind: 'quickops.tempTextFile', state: 'created' })
    })

    try {
      const confirmationToken = flowConsentMock.store.grantConfirmationOnce(
        'corebox',
        'quickops.temp-text-file'
      )
      const first = await flowBus.dispatch(
        'corebox',
        { type: 'json', data: { text: 'hello' } },
        {
          confirmationToken,
          preferredTarget: 'quickops.temp-text-file',
          requireAck: true
        }
      )
      const second = await flowBus.dispatch(
        'corebox',
        { type: 'json', data: { text: 'hello' } },
        {
          confirmationToken,
          preferredTarget: 'quickops.temp-text-file',
          requireAck: true
        }
      )

      expect(first).toEqual({
        sessionId: expect.any(String),
        state: 'ACKED',
        ackPayload: { kind: 'quickops.tempTextFile', state: 'created' }
      })
      expect(second.state).toBe('FAILED')
      expect(second.error?.message).toBe('Flow target confirmation required')
      expect(flowConsentMock.store.consumeConfirmationOnce).toHaveBeenCalledTimes(2)
    } finally {
      dispose()
    }
  })
})
