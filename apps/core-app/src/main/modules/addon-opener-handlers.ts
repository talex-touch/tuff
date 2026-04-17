import type { TalexTouch } from '../types'

type SecondaryLaunchTargetWindow = {
  focus?: () => void
  isDestroyed?: () => boolean
  isMinimized?: () => boolean
  restore?: () => void
}

export function focusMainWindowIfAlive(
  win: SecondaryLaunchTargetWindow | null | undefined
): boolean {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
    return false
  }

  if (typeof win.isMinimized === 'function' && win.isMinimized()) {
    win.restore?.()
  }

  win.focus?.()
  return true
}

export function registerMacOSOpenUrlHandler(
  app: TalexTouch.TouchApp['app'],
  onSchemaUrl: (url: string) => void,
  registerDisposer: (disposer: () => void) => void
): void {
  const onOpenUrl = (_: unknown, url: string) => {
    onSchemaUrl(url)
  }

  app.on('open-url', onOpenUrl)
  registerDisposer(() => {
    app.off('open-url', onOpenUrl)
  })
}
