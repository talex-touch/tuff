import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

/**
 * The shortcut-binding surface shared by the shortcut module and the renderer.
 *
 * Defined once and imported by both sides: two `defineRawEvent` copies of one name are compiled
 * into separate Electron bundles, and a rename in one then fails only at runtime with
 * `No handler registered`.
 */

/** What one binding is set to, and what actually fires it this run. */
export interface ShortcutBinding {
  /** The stored accelerator, whether or not the OS accepted it. */
  configured: string | null
  /** The accelerator registered for it right now: the stored one, or none. */
  effective: string | null
}

/**
 * One shortcut's binding, for surfaces that print a key back to the user, so a hint never teaches
 * a key that is dead. Host renderer only: it is not on the plugin-facing allowlist.
 */
export const shortconGetBindingEvent = defineRawEvent<{ id: string }, ShortcutBinding>(
  'shortcon:get-binding'
)

/**
 * Broadcast to every window after a registration pass that changed a stored or effective key.
 * Fire-and-forget and empty: a listener asks {@link shortconGetBindingEvent} for what it prints.
 */
export const shortconChangedEvent = defineRawEvent<void, void>('shortcon:changed')
