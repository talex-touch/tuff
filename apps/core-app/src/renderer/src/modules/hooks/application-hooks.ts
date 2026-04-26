import { isLocalhostUrl } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { blowMention } from '../mention/dialog-mention'
import { useI18nText } from '../lang'
import { resolveClipboardTriggerMention } from './clipboard-trigger-mention-utils'
import { confirmExternalLinkOpen } from './confirm-external-link'

export async function urlHooker(): Promise<void> {
  const transport = useTuffTransport()
  const appSdk = useAppSdk()
  const urlOpenEvent = defineRawEvent<string, boolean>('url:open')

  function directListener(event: Event): void {
    const target = event.target as HTMLElement

    if (target.nodeName.toLocaleLowerCase() === 'a') {
      if (target.getAttribute('ignoreSafeCheck') === 'true') return

      const url = target.getAttribute('href')

      if (!url) return

      const regex =
        /(^https:\/\/localhost)|(^http:\/\/localhost)|(^http:\/\/127\.0\.0\.1)|(^https:\/\/127\.0\.0\.1)/

      event.preventDefault()
      if (!regex.test(url) || url.startsWith(window.location.origin) || url.startsWith('/')) {
        void transport.send(urlOpenEvent, url)
      } else {
        void appSdk.openExternal(url)
      }
    }
  }

  document.body.addEventListener('click', directListener)

  transport.on(urlOpenEvent, async (url) => {
    if (typeof url !== 'string') return false
    if (isLocalhostUrl(url)) return false

    return await confirmExternalLinkOpen(url)
  })
}

export function clipBoardResolver(): void {
  const transport = useTuffTransport()
  const { t } = useI18nText()
  const clipboardTrigger = defineRawEvent<{ type: string; data: string }, void>('clipboard:trigger')
  transport.on(clipboardTrigger, (payload) => {
    if (!payload) return

    const mention = resolveClipboardTriggerMention(payload, t)
    if (!mention) return

    void blowMention(mention.title, mention.message)
  })
}
