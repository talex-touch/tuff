import type { PluginStatus } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import {
  PluginStatusChangedEvent,
  TalexEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'

/**
 * Tell everyone who follows a plugin's status that it was set: the renderer on every set, and
 * main-process modules — its global shortcuts among them — when the status actually changed.
 *
 * Beside `plugin.ts` rather than in it, because that file may only shrink (#339).
 */
export function announcePluginStatus(
  transport: ITuffTransportMain | null,
  pluginName: string,
  status: PluginStatus,
  previous: PluginStatus
): void {
  transport?.broadcast(PluginEvents.push.statusUpdated, { plugin: pluginName, status })
  if (previous !== status) {
    touchEventBus.emit(
      TalexEvents.PLUGIN_STATUS_CHANGED,
      new PluginStatusChangedEvent(pluginName, status, previous)
    )
  }
}
