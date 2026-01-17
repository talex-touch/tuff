import { isLocalhostUrl } from '@talex-touch/utils'
import { DataCode } from '@talex-touch/utils/channel'
import { touchChannel } from '../channel/channel-core'
import { forTouchTip } from '../mention/dialog-mention'

export async function useUrlProcessor(): Promise<void> {
  function directListener(event: Event): void {
    const target = event.target as HTMLElement

    if (target.nodeName.toLocaleLowerCase() === 'a') {
      if (target.getAttribute('ignoreSafeCheck') === 'true') return

      const url = target.getAttribute('href')

      if (!url) return

      event.preventDefault()

      const isExternal =
        !isLocalhostUrl(url) && !url.startsWith(window.location.origin) && !url.startsWith('/')

      if (isExternal) {
        touchChannel.send('open-external', { url })
      } else {
        touchChannel.send('url:open', url)
      }

      // if(/^\//.test(target)) {
      //   // Relative to this website url
      //   return true
      // }

      // const isSafe = undefined !== whiteDomList.find(item=>{
      //   return target.indexOf(item) !== -1
      // })

      // if(!isSafe) {
      //   window.open(`${window.location.host}/direct?target=${target}`, '_blank')
      // window.open(`${safeLink}${target}`, '_blank')
      // }

      // window.open(`${url}`, "_blank");
    }
  }

  document.body.addEventListener('click', directListener)

  touchChannel.regChannel('url:open', async ({ data, reply }) => {
    const url = data as string

    if (isLocalhostUrl(url)) {
      reply(DataCode.SUCCESS, false)
      return
    }

    await forTouchTip('Allow to open external link?', url, [
      {
        content: 'Cancel',
        type: 'info',
        onClick: async () => {
          reply(DataCode.SUCCESS, false)
          return true
        }
      },
      {
        content: 'Sure',
        type: 'danger',
        onClick: async () => {
          reply(DataCode.SUCCESS, true)
          return true
        }
      }
    ])
  })
}
