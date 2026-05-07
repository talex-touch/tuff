export const RAW_MAIN_PROCESS_CHANNEL = '@main-process-message'
export const RAW_PLUGIN_PROCESS_CHANNEL = '@plugin-process-message'

export function resolveRawProcessChannel(type: 'main' | 'plugin'): string {
  return type === 'plugin' ? RAW_PLUGIN_PROCESS_CHANNEL : RAW_MAIN_PROCESS_CHANNEL
}
