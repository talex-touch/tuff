/**
 * One voice clip plays at a time, across every {@link TxVoiceClip} on the page.
 *
 * A conversation is a column of clips; starting a second one while the first keeps talking is
 * never what the press meant. The clip that starts claims the slot, and whichever clip held it
 * is paused — through its own `pause`, so it emits `pause` and resets its own state.
 */

interface PlaybackOwner {
  pause: () => void
}

let current: PlaybackOwner | null = null

export function claimPlayback(owner: PlaybackOwner): void {
  if (current === owner)
    return
  const previous = current
  current = owner
  previous?.pause()
}

export function releasePlayback(owner: PlaybackOwner): void {
  if (current === owner)
    current = null
}

/** Test seam. */
export function currentPlaybackOwner(): PlaybackOwner | null {
  return current
}
