import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export type ShortcutWarning = 'permission-missing' | 'sdk-legacy' | 'missing-description'

export interface ShortcutStatus {
  state: 'active' | 'conflict' | 'unavailable' | 'disabled'
  reason?:
    | 'conflict-system'
    | 'conflict-plugin'
    | 'register-failed'
    | 'register-error'
    | 'invalid'
    | 'disabled'
  conflictWith?: string[]
  warnings?: ShortcutWarning[]
}

export type ShortcutWithStatus = Shortcut & { status?: ShortcutStatus }

const shortconEvents = {
  getAll: defineRawEvent<void, ShortcutWithStatus[]>('shortcon:get-all'),
  update: defineRawEvent<{ id: string; accelerator?: string; enabled?: boolean }, boolean>(
    'shortcon:update'
  ),
  disableAll: defineRawEvent<void, void>('shortcon:disable-all'),
  enableAll: defineRawEvent<void, void>('shortcon:enable-all')
}

export class ShortconApi {
  private transport = useTuffTransport()

  getAll(): Promise<ShortcutWithStatus[]> {
    return this.transport.send(shortconEvents.getAll)
  }

  update(id: string, accelerator?: string, enabled?: boolean): Promise<boolean> {
    return this.transport.send(shortconEvents.update, { id, accelerator, enabled })
  }

  disableAll(): Promise<void> {
    return this.transport.send(shortconEvents.disableAll)
  }

  enableAll(): Promise<void> {
    return this.transport.send(shortconEvents.enableAll)
  }
}

export const shortconApi = new ShortconApi()
