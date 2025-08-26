import { touchChannel } from '~/modules/channel/channel-core'
import { ShortcutSetting } from '@talex-touch/utils/common/storage/entity/shortcut-settings'

export class ShortconApi {
  getAll(): Promise<ShortcutSetting> {
    return touchChannel.send('shortcon:get-all')
  }

  update(key: keyof ShortcutSetting, value: string): Promise<boolean> {
    return touchChannel.send('shortcon:update', { key, value })
  }

  disableAll(): Promise<void> {
    return touchChannel.send('shortcon:disable-all')
  }

  enableAll(): Promise<void> {
    return touchChannel.send('shortcon:enable-all')
  }
}

export const shortconApi = new ShortconApi()