export const PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES = Object.freeze([
  'clipboard-history',
  'touch-batch-rename',
  'touch-browser-bookmarks',
  'touch-browser-data',
  'touch-browser-open',
  'touch-code-snippets',
  'touch-dev-toolbox',
  'touch-dev-utils',
  'touch-dictation',
  'touch-emoji-symbols',
  'touch-intelligence',
  'touch-quick-actions',
  'touch-quickops',
  'touch-snipaste',
  'touch-snippets',
  'touch-system-actions',
  'touch-text-snippets',
  'touch-text-tools',
  'touch-translation',
  'touch-window-manager',
  'touch-window-presets',
  'touch-workspace-scripts'
] as const)

const PLUGIN_RUNTIME_DEFAULT_ENABLED = true

export function shouldInstallPluginRuntimeServiceByDefault(): boolean {
  return PLUGIN_RUNTIME_DEFAULT_ENABLED
}
