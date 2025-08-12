import { touchChannel } from "~/modules/channel/channel-core";

export class ShortconApi {

  regKey(_key: string, value: Function) {
    const res: {
      registered: boolean,
      message: string
    } = touchChannel.sendSync('shortcon:reg', _key);

    if (!res.registered) {
      return res
    }

    touchChannel.regChannel('shortcon:trigger', ({ key }: any) => {
      if (_key !== key) return

      value?.()
    })

    return res
  }
}

export const shortconApi = new ShortconApi();