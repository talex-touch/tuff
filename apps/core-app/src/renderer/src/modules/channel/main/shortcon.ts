import type { ShortcutSetting } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

const shortconEvents = {
  getAll: defineRawEvent<void, ShortcutSetting>('shortcon:get-all'),
  update: defineRawEvent<{ id: string; accelerator: string }, boolean>('shortcon:update'),
  disableAll: defineRawEvent<void, void>('shortcon:disable-all'),
  enableAll: defineRawEvent<void, void>('shortcon:enable-all')
}

export class ShortconApi {
  private transport = useTuffTransport()

  getAll(): Promise<ShortcutSetting> {
    return this.transport.send(shortconEvents.getAll)
  }

  update(id: string, accelerator: string): Promise<boolean> {
    return this.transport.send(shortconEvents.update, { id, accelerator })
  }

  disableAll(): Promise<void> {
    return this.transport.send(shortconEvents.disableAll)
  }

  enableAll(): Promise<void> {
    return this.transport.send(shortconEvents.enableAll)
  }
}

export const shortconApi = new ShortconApi()
