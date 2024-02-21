import { touchChannel } from '~/modules/channel/channel-core'

export function useCoreBox() {
  touchChannel.regChannel('core-box:trigger', ({ data }: any) => {
    const { show, id } = data!
    if (window.$startupInfo.id !== undefined) {
      if ( id !== window.$startupInfo.id) return
    }

    if (show) {
      document.body.classList.add('core-box')

      setTimeout(() => {
        const input = document.querySelector('#core-box-input')

        input?.focus()
      }, 100);
    }
    else document.body.classList.remove('core-box')
  })
}