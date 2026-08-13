export const RAW_MAIN_PROCESS_CHANNEL = '@main-process-message'
export const RAW_PLUGIN_PROCESS_CHANNEL = '@plugin-process-message'

/**
 * Where a plugin view asks for the alias it presents on the plugin channel (#697).
 *
 * Synchronous because the preload has to hold the value before the page can send
 * anything, and the answer comes from a map the main process already has.
 */
export const PLUGIN_VIEW_NONCE_CHANNEL = '@plugin-view-nonce'

export function resolveRawProcessChannel(type: 'main' | 'plugin'): string {
  return type === 'plugin' ? RAW_PLUGIN_PROCESS_CHANNEL : RAW_MAIN_PROCESS_CHANNEL
}
