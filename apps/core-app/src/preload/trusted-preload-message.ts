/**
 * Whether a `message` event was posted by this window to itself.
 *
 * The preload's loading-overlay sinks dispatched on `ev.data` alone, in the privileged preload
 * context, so any cross-origin frame embedded in the page could post `{ payload: 'removeLoading' }`
 * or a crafted channel event and be obeyed (#797).
 *
 * `source` is the decisive test: only a message posted by this same window object carries
 * `source === window`. A frame posting to its parent carries that frame's window instead, whatever
 * it claims in `data`. Origin is checked too when both sides have a real one - a `file:` page
 * serialises its origin as the string `'null'`, and rejecting on that would break the packaged
 * app rather than an attacker.
 */
export function isTrustedPreloadMessage(
  event: Pick<MessageEvent, 'source' | 'origin'>,
  self: Window | null
): boolean {
  if (!self || event.source !== self) return false

  const expected = self.location?.origin
  const actual = event.origin
  if (!expected || expected === 'null') return true
  if (!actual || actual === 'null') return true

  return actual === expected
}
