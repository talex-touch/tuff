import { ChannelType, StandardChannelData } from '@talex-touch/utils/channel'
import { globalShortcut } from 'electron'
import { genTouchChannel } from '../core/channel-core'

const registered: Map<string, string> = new Map()

export default {
  name: Symbol('GlobalShortcon'),
  filePath: false,
  extensions: [],
  init() {
    const touchChannel = genTouchChannel()

    touchChannel.regChannel(ChannelType.MAIN, 'shortcon:check', ({ data }: StandardChannelData) => {
      const { key } = data!
      if (!key)
        return {
          registered: false,
          message: 'key is required'
        }

      if (globalShortcut.isRegistered(key)) {
        return {
          registered: true,
          message: 'key already registered'
        }
      } else {
        return {
          registered: true,
          message: 'key registered'
        }
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'shortcon:reg', ({ data }: StandardChannelData) => {
      const { key } = data!
      if (!key)
        return {
          registered: false,
          message: 'key is required'
        }

      if (globalShortcut.isRegistered(key)) {
        return {
          registered: false,
          message: 'key already registered'
        }
      } else {
        globalShortcut.register(key, () => {
          console.log('[GlobalShortcon] Main trigger', key)
          touchChannel.send(ChannelType.MAIN, 'shortcon:trigger', { key })
        })

        return {
          registered: true,
          message: 'key registered'
        }
      }
    })

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'shortcon:reg',
      ({ data, plugin }: StandardChannelData) => {
        const { key } = data!
        if (registered.has(key)) {
          return 'key already registered'
        }

        registered.set(key, plugin!)
        return globalShortcut.register(key, () => {
          console.log('[GlobalShortcon] Plugin trigger', key, plugin)
          touchChannel.send(ChannelType.PLUGIN, 'shortcon:trigger', { plugin, key })
        })
      }
    )
  },
  destroy() {}
}
