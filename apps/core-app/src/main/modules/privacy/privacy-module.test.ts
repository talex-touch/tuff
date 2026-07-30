import { describe, expect, it, vi } from 'vitest'
import { PrivacyLifecycleModule } from './privacy-module'

describe('privacyLifecycleModule lifecycle', () => {
  it('initializes retention after service readiness and disposes handlers before shutdown', async () => {
    const order: string[] = []
    const service = { destroy: vi.fn() }
    const coordinator = {
      initializeAfterStorageReady: vi.fn(async () => order.push('coordinator:initialize')),
      runManualCleanup: vi.fn(),
      updatePolicy: vi.fn(),
      shutdown: vi.fn(async () => order.push('coordinator:shutdown'))
    }
    const disposeHandlers = vi.fn(() => order.push('handlers:dispose'))
    const module = new PrivacyLifecycleModule({
      resolveTransport: vi.fn(() => ({ id: 'typed-main-transport' }) as never),
      createService: vi.fn(() => {
        order.push('service:create')
        return service as never
      }),
      registerHandlers: vi.fn(() => {
        order.push('handlers:register')
        return disposeHandlers
      }),
      createCoordinator: vi.fn(() => coordinator as never)
    })

    await module.onInit({ app: {}, runtime: {}, file: {} } as never)
    expect(order).toEqual(['service:create', 'coordinator:initialize', 'handlers:register'])

    await module.onDestroy({} as never)
    expect(order).toEqual([
      'service:create',
      'coordinator:initialize',
      'handlers:register',
      'handlers:dispose',
      'coordinator:shutdown'
    ])
  })

  it('attempts every shutdown step and retains aggregate failures', async () => {
    const order: string[] = []
    const service = { destroy: vi.fn() }
    const coordinator = {
      initializeAfterStorageReady: vi.fn(async () => undefined),
      runManualCleanup: vi.fn(),
      updatePolicy: vi.fn(),
      shutdown: vi.fn(async () => {
        order.push('coordinator:shutdown')
        throw new Error('CANARY_COORDINATOR_SHUTDOWN')
      })
    }
    const module = new PrivacyLifecycleModule({
      resolveTransport: vi.fn(() => ({}) as never),
      createService: vi.fn(() => service as never),
      registerHandlers: vi.fn(() => () => {
        order.push('handlers:dispose')
        throw new Error('CANARY_HANDLER_DISPOSE')
      }),
      createCoordinator: vi.fn(() => coordinator as never)
    })
    await module.onInit({ app: {}, runtime: {}, file: {} } as never)

    const failure = await module.onDestroy({} as never).catch((error: unknown) => error)
    expect(order).toEqual(['handlers:dispose', 'coordinator:shutdown'])
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'CANARY_HANDLER_DISPOSE' }),
      expect.objectContaining({ message: 'CANARY_COORDINATOR_SHUTDOWN' })
    ])
  })

  it('shuts down the coordinator and service when initialization fails', async () => {
    const service = { destroy: vi.fn(async () => undefined) }
    const coordinator = {
      initializeAfterStorageReady: vi.fn(async () => {
        throw new Error('coordinator startup failed')
      }),
      runManualCleanup: vi.fn(),
      updatePolicy: vi.fn(),
      shutdown: vi.fn(async () => {
        await service.destroy()
      })
    }
    const module = new PrivacyLifecycleModule({
      resolveTransport: vi.fn(() => ({}) as never),
      createService: vi.fn(() => service as never),
      registerHandlers: vi.fn(() => vi.fn()),
      createCoordinator: vi.fn(() => coordinator as never)
    })

    await expect(module.onInit({ app: {}, runtime: {}, file: {} } as never)).rejects.toThrow(
      'coordinator startup failed'
    )
    expect(coordinator.shutdown).toHaveBeenCalledOnce()
    expect(service.destroy).toHaveBeenCalledOnce()
  })
})
