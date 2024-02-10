import { touchChannel } from '~/modules/channel/channel-core'

export function useCoreBox() {
  touchChannel.regChannel('core-box:trigger', ({ data }: any) => {
    const { show } = data!

    if (show)
      document.body.classList.add('core-box')
    else document.body.classList.remove('core-box')
  })
}