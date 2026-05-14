const BODY_LOCK_COUNT_KEY = 'txFlipOverlayLockCount'
const BODY_LOCK_OVERFLOW_KEY = 'txFlipOverlayLockOverflow'
const BODY_LOCK_PADDING_KEY = 'txFlipOverlayLockPaddingRight'

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function lockFlipOverlayBodyScroll(): void {
  if (!canUseDom())
    return

  const body = window.document.body
  if (!body)
    return

  const currentCount = Number.parseInt(body.dataset[BODY_LOCK_COUNT_KEY] || '0', 10)

  if (currentCount === 0) {
    body.dataset[BODY_LOCK_OVERFLOW_KEY] = body.style.overflow || ''
    body.dataset[BODY_LOCK_PADDING_KEY] = body.style.paddingRight || ''

    const scrollbarWidth = window.innerWidth - window.document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0)
      body.style.paddingRight = `${scrollbarWidth}px`
  }

  body.dataset[BODY_LOCK_COUNT_KEY] = String(currentCount + 1)
}

export function unlockFlipOverlayBodyScroll(): void {
  if (!canUseDom())
    return

  const body = window.document.body
  if (!body)
    return

  const currentCount = Number.parseInt(body.dataset[BODY_LOCK_COUNT_KEY] || '0', 10)
  if (currentCount <= 0)
    return

  const nextCount = currentCount - 1
  if (nextCount === 0) {
    body.style.overflow = body.dataset[BODY_LOCK_OVERFLOW_KEY] || ''
    body.style.paddingRight = body.dataset[BODY_LOCK_PADDING_KEY] || ''
    delete body.dataset[BODY_LOCK_COUNT_KEY]
    delete body.dataset[BODY_LOCK_OVERFLOW_KEY]
    delete body.dataset[BODY_LOCK_PADDING_KEY]
    return
  }

  body.dataset[BODY_LOCK_COUNT_KEY] = String(nextCount)
}
