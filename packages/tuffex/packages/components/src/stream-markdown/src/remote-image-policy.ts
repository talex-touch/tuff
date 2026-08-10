import { ref } from 'vue'

/**
 * Whether a remote image in model-authored markdown may load.
 *
 * An image fetches the moment it renders — no click, no consent. In a reply
 * assembled from pages the model just read, that fetch is a beacon carrying the
 * reader's IP to whoever wrote the page. Blocking by default is the only stance
 * that holds when the content author is unknown, so this defaults to blocking
 * and gives the reader two cheap ways out: this one image, or everything for
 * the rest of the conversation.
 *
 * State is module-level rather than per-component because a conversation
 * renders one `TxStreamMarkdown` per message: a decision the reader makes on
 * message four has to hold for message five, and per-instance state would ask
 * them again every time.
 */

const allowedSources = new Set<string>()
const sessionAllowed = ref(false)

/**
 * Bumped on every policy change. Components watch it to drop their cached HTML:
 * rendered blocks are strings, so nothing re-renders on its own.
 */
export const remoteImagePolicyVersion = ref(0)

/** `data:` and `blob:` carry their own bytes; app protocols are local. */
const REMOTE_SCHEME = /^(?:https?:)?\/\//i

export function isRemoteImage(src: string): boolean {
  return REMOTE_SCHEME.test(src.trim())
}

export function isRemoteImageAllowed(src: string): boolean {
  return sessionAllowed.value || allowedSources.has(src)
}

export function allowRemoteImageOnce(src: string): void {
  if (allowedSources.has(src)) return
  allowedSources.add(src)
  remoteImagePolicyVersion.value += 1
}

export function allowRemoteImagesForSession(): void {
  if (sessionAllowed.value) return
  sessionAllowed.value = true
  remoteImagePolicyVersion.value += 1
}

/**
 * Called by the host when the conversation changes. Consent was given for one
 * conversation; carrying it into the next one would silently widen it.
 */
export function resetRemoteImagePolicy(): void {
  if (!sessionAllowed.value && allowedSources.size === 0) return
  allowedSources.clear()
  sessionAllowed.value = false
  remoteImagePolicyVersion.value += 1
}

/** Test seam; not part of the public surface. */
export function remoteImagePolicyState(): { sessionAllowed: boolean; allowed: string[] } {
  return { sessionAllowed: sessionAllowed.value, allowed: [...allowedSources] }
}
