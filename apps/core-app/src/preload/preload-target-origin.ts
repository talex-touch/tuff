/**
 * postMessage targetOrigin for the preload's loading-state channel.
 *
 * `'*'` delivers the payload to any cross-origin frame embedded in the page. The data is low
 * value, but the wildcard is exposure nobody asked for, so an origin that cannot be pinned down
 * means the post is skipped rather than broadcast (#798).
 *
 * An opaque origin serialises as the string 'null', which postMessage cannot use; file: pages
 * have a usable 'file://' instead.
 */
export function resolvePreloadTargetOrigin(location: {
  origin?: string
  protocol?: string
}): string | null {
  if (location.origin && location.origin !== 'null') return location.origin
  if (location.protocol === 'file:') return 'file://'
  return null
}
