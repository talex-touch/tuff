import { genTouchChannel } from "../core/channel-core";
import { ChannelType } from "@talex-touch/utils/channel";

export default {
  name: Symbol("DropManager"),
  filePath: false,
  listeners: new Array<() => void>,
  init() {
    const touchChannel = genTouchChannel();

    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, 'drop', ({ data }) => {
        touchChannel.send(ChannelType.PLUGIN, 'drop', data)
      })
    )

  },
  destroy() {
    this.listeners.forEach(listener => listener())
  },
};
