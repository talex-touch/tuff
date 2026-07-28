export const PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES = Object.freeze([
  'clipboard-history',
  'touch-browser-bookmarks',
  'touch-code-snippets',
  'touch-dev-toolbox',
  'touch-dev-utils',
  'touch-dictation',
  'touch-emoji-symbols',
  'touch-quickops',
  'touch-snippets',
  'touch-text-snippets',
  'touch-text-tools'
] as const)

const PLUGIN_RUNTIME_DEFAULT_ENABLED = false

export function shouldInstallPluginRuntimeServiceByDefault(): boolean {
  return PLUGIN_RUNTIME_DEFAULT_ENABLED
}
