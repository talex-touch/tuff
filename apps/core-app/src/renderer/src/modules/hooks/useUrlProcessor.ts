import { isLocalhostUrl } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { confirmExternalLinkOpen } from './confirm-external-link'

function isAllowedExternalProtocol(protocol: string): boolean {
  return protocol === 'https:' || protocol === 'http:'
}

export async function useUrlProcessor(): Promise<() => void> {
  const appSdk = useAppSdk()

  function directListener(event: Event): void {
    const rawTarget = event.target
    if (!(rawTarget instanceof Element)) return

    const anchor = rawTarget.closest('a[href]')
    if (!anchor) return
    if (anchor.getAttribute('ignoreSafeCheck') === 'true') return

    const rawHref = anchor.getAttribute('href')?.trim()
    if (!rawHref || rawHref.startsWith('#')) return

    let parsed: URL
    try {
      parsed = new URL(rawHref, window.location.href)
    } catch {
      event.preventDefault()
      return
    }

    const isSameOriginOrLocal =
      rawHref.startsWith('/') ||
      parsed.origin === window.location.origin ||
      isLocalhostUrl(parsed.href)

    if (isSameOriginOrLocal) {
      return
    }

    event.preventDefault()

    if (!isAllowedExternalProtocol(parsed.protocol)) {
      return
    }

    void confirmExternalLinkOpen(parsed.href)
      .then((allowed) => {
        if (!allowed) return
        return appSdk.openExternal(parsed.href)
      })
      .catch(() => {})
  }

  document.body.addEventListener('click', directListener)

  return () => {
    document.body.removeEventListener('click', directListener)
  }
}
