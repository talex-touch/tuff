import { isLocalhostUrl } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { confirmExternalLinkOpen } from './confirm-external-link'

export async function useUrlProcessor(): Promise<void> {
  const transport = useTuffTransport()
  const appSdk = useAppSdk()
  const urlOpenEvent = defineRawEvent<string, boolean>('url:open')

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
        void appSdk.openExternal(url)
      } else {
        void transport.send(urlOpenEvent, url)
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

  transport.on(urlOpenEvent, async (url) => {
    if (typeof url !== 'string') {
      return false
    }

    if (isLocalhostUrl(url)) {
      return false
    }

    return await confirmExternalLinkOpen(url)
  })
}
