import { TalexTouch } from "../types";
import { ChannelType } from "@talex-touch/utils/channel";

export default {
  name: Symbol("DropManager"),
  filePath: false,
  listeners: new Array<Function>,
  init(app, manager) {

    this.listeners.push(
      this.touchChannel.regChannel(ChannelType.MAIN, 'drop', ({ data }) => {
        this.touchChannel.send(ChannelType.MAIN, 'drop', data)
      })
    )

  },
  destroy() {
    this.listeners.forEach(listener => listener())
  },
} as TalexTouch.IModule;
