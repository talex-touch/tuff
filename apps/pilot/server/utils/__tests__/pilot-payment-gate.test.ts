import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDummyOrder,
  getPaymentProviderUnavailablePayload,
  isPilotPaymentMockEnabled,
  PAYMENT_PROVIDER_UNAVAILABLE,
} from '../pilot-payment-service'

const ENV_SNAPSHOT = process.env.PILOT_PAYMENT_MODE

vi.mock('../pilot-entity-store', () => ({
  deletePilotEntity: vi.fn(),
  ensurePilotEntitySeed: vi.fn(),
  getPilotEntity: vi.fn(async () => null),
  listPilotEntities: vi.fn(async () => ({
    items: [],
    meta: {
      totalItems: 0,
      itemCount: 0,
      itemsPerPage: 20,
      totalPages: 0,
      currentPage: 1,
    },
  })),
  listPilotEntitiesAll: vi.fn(async () => []),
  upsertPilotEntity: vi.fn(),
}))

function createEvent(): H3Event {
  return {
    context: {},
  } as unknown as H3Event
}

afterEach(() => {
  if (ENV_SNAPSHOT === undefined) {
    delete process.env.PILOT_PAYMENT_MODE
    return
  }
  process.env.PILOT_PAYMENT_MODE = ENV_SNAPSHOT
})

describe('pilot payment mock gate', () => {
  it('disables mock payment unless PILOT_PAYMENT_MODE=mock is set', async () => {
    delete process.env.PILOT_PAYMENT_MODE

    expect(isPilotPaymentMockEnabled()).toBe(false)
    await expect(createDummyOrder(createEvent(), {
      userId: 'user-1',
      value: 100,
    })).rejects.toThrow(PAYMENT_PROVIDER_UNAVAILABLE)
    expect(getPaymentProviderUnavailablePayload()).toEqual({
      code: PAYMENT_PROVIDER_UNAVAILABLE,
      reason: expect.any(String),
      requiredEnv: 'PILOT_PAYMENT_MODE=mock',
    })
  })

  it('allows explicit mock payment mode', async () => {
    process.env.PILOT_PAYMENT_MODE = 'mock'

    const result = await createDummyOrder(createEvent(), {
      userId: 'user-1',
      value: 100,
    })

    expect(isPilotPaymentMockEnabled()).toBe(true)
    expect(result.order.type).toBe('DUMMY')
    expect(result.code_url).toContain('weixin://wxpay/pilot/mock/')
  })
})
