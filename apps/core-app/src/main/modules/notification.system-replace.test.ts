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

/**
 * `ipcMain` and `MessageChannelMain` are here because this factory replaces the whole `electron`
 * module, and `packages/utils/transport/sdk/main-transport.ts` destructures both at import time.
 *
 * The mock got away without them while the workspace resolved two copies of electron: the utils
 * package bound to one and this test mocked the other, so main-transport read the real module.
 * Deduplicating electron (#328) put them on the same specifier and the omission became a
 * collection failure -- `No "ipcMain" export is defined on the "electron" mock`.
 */
vi.mock('electron', () => ({
  Notification: FakeNotification,
  // `config/default.ts` reads `app.getAppPath()` at module load. Nothing here exercises it, but a
  // mock that omits the export makes vitest throw on access rather than yield undefined, so any
  // new edge into that module breaks this file.
  app: { getAppPath: () => process.cwd() },
  ipcMain: { on: () => {}, off: () => {}, handle: () => {}, removeHandler: () => {} },
  MessageChannelMain: class {
    port1 = { on: () => {}, start: () => {}, close: () => {}, postMessage: () => {} }
    port2 = { on: () => {}, start: () => {}, close: () => {}, postMessage: () => {} }
  }
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
