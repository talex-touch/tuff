import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import type { ITuffTransport } from '@talex-touch/utils/transport/types'
import type { ShortcutBinding } from '../../../../../shared/events/shortcut-binding'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import {
  shortconChangedEvent,
  shortconGetBindingEvent
} from '../../../../../shared/events/shortcut-binding'

export type { ShortcutBinding }

export type ShortcutWarning = 'permission-missing' | 'sdk-blocked' | 'missing-description'

export interface ShortcutStatus {
  state: 'active' | 'conflict' | 'unavailable' | 'disabled'
  reason?:
    | 'conflict-system'
    | 'conflict-plugin'
    | 'register-failed'
    | 'register-error'
    | 'invalid'
    | 'disabled'
  conflictWith?: string[]
  warnings?: ShortcutWarning[]
}

export type ShortcutWithStatus = Shortcut & { status?: ShortcutStatus }

const shortconEvents = {
  getAll: defineRawEvent<void, ShortcutWithStatus[]>('shortcon:get-all'),
  // Shared with the main process rather than redefined here, so the two cannot drift apart.
  getBinding: shortconGetBindingEvent,
  /** Pushed by the main process after a pass that changed a stored or effective key. */
  changed: shortconChangedEvent,
  update: defineRawEvent<{ id: string; accelerator?: string; enabled?: boolean }, boolean>(
    'shortcon:update'
  ),
  disableAll: defineRawEvent<void, void>('shortcon:disable-all'),
  enableAll: defineRawEvent<void, void>('shortcon:enable-all'),
  getFeature: defineRawEvent<{ plugin: string }, Record<string, ShortcutWithStatus>>(
    'shortcon:get-feature'
  ),
  setFeature: defineRawEvent<{ plugin: string; feature: string; accelerator: string }, boolean>(
    'shortcon:set-feature'
  )
}

export class ShortconApi {
  /**
   * Resolved per call, not at construction.
   *
   * `shortconApi` is a module-scope singleton, so a field initialiser runs the moment any
   * importer is evaluated - which for a lazily routed view can be before the renderer transport
   * exists, and `useTuffTransport()` then throws inside the import rather than at a call site.
   */
  private get transport(): ITuffTransport {
    return useTuffTransport()
  }

  getAll(): Promise<ShortcutWithStatus[]> {
    return this.transport.send(shortconEvents.getAll)
  }

  /** The stored and the effective accelerator of one shortcut. */
  getBinding(id: string): Promise<ShortcutBinding> {
    return this.transport.send(shortconEvents.getBinding, { id })
  }

  /** Runs `handler` whenever a stored or effective key changes; returns the unsubscribe. */
  onChanged(handler: () => void): () => void {
    return this.transport.on(shortconEvents.changed, () => {
      handler()
    })
  }

  update(id: string, accelerator?: string, enabled?: boolean): Promise<boolean> {
    return this.transport.send(shortconEvents.update, { id, accelerator, enabled })
  }

  disableAll(): Promise<void> {
    return this.transport.send(shortconEvents.disableAll)
  }

  enableAll(): Promise<void> {
    return this.transport.send(shortconEvents.enableAll)
  }

  /** Every feature binding for one plugin, keyed by feature id. */
  getFeatureShortcuts(plugin: string): Promise<Record<string, ShortcutWithStatus>> {
    return this.transport.send(shortconEvents.getFeature, { plugin })
  }

  /** Binds, rebinds, or - with an empty accelerator - clears one feature's shortcut. */
  setFeatureShortcut(plugin: string, feature: string, accelerator: string): Promise<boolean> {
    return this.transport.send(shortconEvents.setFeature, { plugin, feature, accelerator })
  }
}

export const shortconApi = new ShortconApi()
