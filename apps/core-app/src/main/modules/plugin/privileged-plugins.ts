/**
 * Which plugin may hold which privileged host capability (#535).
 *
 * These capabilities — intelligence context, browser open and data, system actions, window manager
 * and presets, workspace scripts — are not authorized by the manifest permission registry. They are
 * authorized by comparing the activation's plugin name against a literal, in twelve files and
 * twenty-nine places, with no shared constant between them.
 *
 * The failure that costs is a rename, which is exactly what the 2026-02 extraction invites: every
 * gate falls through to `invalid()` or `null`, so the plugin still loads and registers and only
 * fails when a user triggers the feature. No build error, no startup warning, and the twelve files
 * have to be found by grep.
 *
 * This is a lookup table, not a policy change: the same names authorize the same capabilities as
 * before. What it buys is that a rename is one edit, and that `PRIVILEGED_PLUGIN_NAMES` gives a
 * gate somewhere to check itself against.
 */

export const PRIVILEGED_PLUGIN_CAPABILITIES = {
  /** Reads and streams the intelligence context package. */
  intelligenceContext: ['touch-intelligence'],
  /** Opens URLs in a chosen browser. */
  browserOpen: ['touch-browser-open'],
  /** Scans browser profile data, and owns the bookmarks indexed source. */
  browserData: ['touch-browser-data'],
  /**
   * Runs the everyday system actions.
   *
   * Split from the advanced set rather than lumped together: the two holders are not
   * interchangeable, and `isActionAllowedForPlugin` gives them different action lists. One entry
   * naming both would have made the gate look like an either/or when it is not.
   */
  systemActionsBasic: ['touch-quick-actions'],
  /** Runs the advanced system actions — shutdown, restart and the rest of the destructive set. */
  systemActionsAdvanced: ['touch-system-actions'],
  /** Enumerates and manipulates OS windows. */
  windowManager: ['touch-window-manager'],
  /** Applies saved window geometry presets. */
  windowPresets: ['touch-window-presets'],
  /** Lists and runs scripts from a selected workspace. */
  workspaceScripts: ['touch-workspace-scripts'],
  /** Renames files in a chosen directory, under the plugin's declared filesystem permissions. */
  batchRenameFilesystem: ['touch-batch-rename'],
  /** Spawns and tracks the screenshot helper process. */
  snipasteProcess: ['touch-snipaste'],
  /** Reads and atomically updates the fixed operating-system hosts file. */
  hosts: ['touch-hosts'],
  /** Reads VS Code recent-project metadata and opens only host-issued targets. */
  vscodeProjects: ['touch-vscode-projects'],
  /** Reads a bounded Orca summary and opens the fixed Orca application. */
  orca: ['touch-orca'],
  /** Reads sanitized local AI-session metadata. */
  aiSessions: ['touch-ai-sessions'],
  /** Converts only lifecycle-approved image inputs through the bounded host renderer. */
  imageTools: ['touch-image'],
  /** Reaches the intelligence providers for translation requests. */
  translation: ['touch-translation']
} as const satisfies Record<string, readonly string[]>

export type PrivilegedPluginCapability = keyof typeof PRIVILEGED_PLUGIN_CAPABILITIES

/** Every plugin name that holds at least one privileged capability. */
export const PRIVILEGED_PLUGIN_NAMES: readonly string[] = Object.freeze([
  ...new Set(Object.values(PRIVILEGED_PLUGIN_CAPABILITIES).flat())
])

/** Holders of either system-action tier, for the gate that admits both before splitting them. */
export const SYSTEM_ACTION_PLUGIN_NAMES: readonly string[] = Object.freeze([
  ...PRIVILEGED_PLUGIN_CAPABILITIES.systemActionsBasic,
  ...PRIVILEGED_PLUGIN_CAPABILITIES.systemActionsAdvanced
])

/**
 * Whether a plugin name may hold a capability.
 *
 * Takes the name rather than the activation on purpose: callers hold it in three different shapes
 * — `activation.name`, `expectedActivation.name`, `snapshot.manifest.name` — and narrowing that
 * here would just move the coupling.
 */
export function isPrivilegedPluginFor(
  capability: PrivilegedPluginCapability,
  pluginName: string | undefined
): boolean {
  if (!pluginName) {
    return false
  }
  return (PRIVILEGED_PLUGIN_CAPABILITIES[capability] as readonly string[]).includes(pluginName)
}

/** The sole holder of a capability, for gates that read as `name !== THE_ONE`. */
export function privilegedPluginFor(capability: PrivilegedPluginCapability): string {
  const names = PRIVILEGED_PLUGIN_CAPABILITIES[capability] as readonly string[]
  if (names.length !== 1) {
    throw new Error(
      `privilegedPluginFor('${capability}') has ${names.length} holders; use isPrivilegedPluginFor`
    )
  }
  return names[0]!
}
