import { ChannelType, StandardChannelData } from "@talex-touch/utils/channel";
import { globalShortcut } from "electron";
import { genTouchChannel } from "../core/channel-core";

const registered: Map<string, string> = new Map()

export default {
  name: Symbol("GlobalShortcon"),
  filePath: false,
  extensions: [],
  init() {
    const touchChannel = genTouchChannel()

    touchChannel.regChannel(ChannelType.PLUGIN, 'shortcon:reg', ({ data, plugin }: StandardChannelData) => {
      const { key } = data
      if (registered.has(key)) {
        return 'key already registered'
      }

      registered.set(key, plugin!)
      return globalShortcut.register(key, () => {
        console.log('trigger', key)
        touchChannel.send(ChannelType.PLUGIN, 'shortcon:trigger', { plugin, key })
      })
    })
  },
  destroy() { },
};
