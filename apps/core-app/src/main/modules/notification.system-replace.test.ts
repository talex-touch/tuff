/**
 * Replacing a system notification reuses its id: the old toast is closed and the new one is
 * registered under the same key. The OS delivers the old toast's 'close' after that, and the
 * handler used to delete by id alone -- untracking the replacement, so a later dismiss found
 * nothing and silently left the toast on screen (#775).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeNotification } = vi.hoisted(() => {
  class FakeNotification {
    static instances: FakeNotification[] = []
    static isSupported = (): boolean => true

    readonly handlers = new Map<string, (...args: unknown[]) => void>()
    closeCalls = 0
    showCalls = 0

    constructor(public readonly options: Record<string, unknown>) {
      FakeNotification.instances.push(this)
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
      this.handlers.set(event, handler)
      return this
    }

    show(): void {
      this.showCalls += 1
    }

    close(): void {
      this.closeCalls += 1
    }

    /** The OS delivering 'close' — deliberately separate from close() so timing is explicit. */
    emitClose(): void {
      this.handlers.get('close')?.()
    }
  }

  return { FakeNotification }
})

vi.mock('electron', () => ({
  Notification: FakeNotification
}))

vi.mock('../core/runtime-accessor', () => ({
  resolveMainRuntime: () => ({ transport: null })
}))

import { NotificationModule } from './notification'

interface SystemNotificationInternals {
  showSystemNotification: (request: { id: string; title: string; message: string }) => void
  dismissSystemNotification: (id: string) => void
  systemRequests: Map<string, unknown>
}

function createModule(): SystemNotificationInternals {
  return new NotificationModule() as unknown as SystemNotificationInternals
}

describe('system notification replacement keeps the newest toast tracked', () => {
  beforeEach(() => {
    FakeNotification.instances = []
  })

  it('旧通知的 close 事件不能把替换它的新通知解除跟踪', () => {
    const module = createModule()

    module.showSystemNotification({ id: 'progress', title: 'Sync', message: '10%' })
    module.showSystemNotification({ id: 'progress', title: 'Sync', message: '80%' })

    const [first, second] = FakeNotification.instances
    expect(FakeNotification.instances).toHaveLength(2)
    expect(first!.closeCalls).toBe(1) // replaced

    // The OS now delivers the first toast's close, after the second已 taken the id.
    first!.emitClose()

    module.dismissSystemNotification('progress')
    expect(second!.closeCalls).toBe(1)
  })

  it('通知自己的 close 事件仍然会解除跟踪(守卫不是"永不删除")', () => {
    const module = createModule()

    module.showSystemNotification({ id: 'solo', title: 'Done', message: 'ok' })
    const [only] = FakeNotification.instances
    expect(module.systemRequests.has('solo')).toBe(true)

    only!.emitClose()

    expect(module.systemRequests.has('solo')).toBe(false)
  })
})
