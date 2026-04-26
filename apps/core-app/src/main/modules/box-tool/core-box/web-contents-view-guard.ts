interface ViewWebContentsLike {
  isDestroyed?: () => boolean
}

interface ViewWithMaybeWebContents<T extends ViewWebContentsLike> {
  webContents?: T | null
}

export function getLiveViewWebContents<T extends ViewWebContentsLike>(
  view: ViewWithMaybeWebContents<T> | null | undefined
): T | null {
  const webContents = view?.webContents
  if (!webContents || typeof webContents.isDestroyed !== 'function') {
    return null
  }
  return webContents.isDestroyed() ? null : webContents
}
