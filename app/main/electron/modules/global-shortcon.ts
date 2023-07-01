import {TalexTouch} from "../types";
import {ChannelType, ITouchChannel, StandardChannelData} from "@talex-touch/utils/channel";
import { globalShortcut } from "electron";

const registered: Map<string, string> = new Map()

export default {
  name: Symbol("GlobalShortcon"),
  // filePath: "shortcons",
  filePath: false,
  extensions: [],
  init(app, manager) {
    const { modulePath, touchChannel }: { modulePath: string, touchChannel: ITouchChannel } = this

    touchChannel.regChannel(ChannelType.PLUGIN,'shortcon:reg', ({ data, plugin }: StandardChannelData) => {
        const { key } = data
        if ( registered.has(key) ) {
            return 'key already registered'
        }

        registered.set(key, plugin)
        return globalShortcut.register(key, () => {
            console.log('trigger', key)
            touchChannel.send(ChannelType.PLUGIN, 'shortcon:trigger', { plugin, key })
        })
    })
  },
  destroy() {},
} as TalexTouch.IModule;
