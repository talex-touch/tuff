/**
 * Addressing for user-bound feature shortcuts, with no dependencies on purpose.
 *
 * The shortcut module needs to read and build these ids while merely listing bindings, which must
 * not drag CoreBox, the plugin view loader and their transitive graph into every consumer — the
 * trigger path imports that machinery lazily, when a key is actually pressed.
 */

/** `feature.<plugin>.<featureId>` — the id a user-bound feature accelerator is stored under. */
const FEATURE_SHORTCUT_PREFIX = 'feature'

export interface FeatureShortcutTarget {
  pluginName: string
  featureId: string
}

export function buildFeatureShortcutId(pluginName: string, featureId: string): string {
  return `${FEATURE_SHORTCUT_PREFIX}.${pluginName}.${featureId}`
}

/**
 * The plugin and feature a `feature.*` shortcut id names.
 *
 * Parsed rather than read off `meta`, so an id that was hand-edited in the shortcut settings
 * cannot point the trigger at a different plugin than the binding claims to belong to. A plugin
 * name contains dots of its own, so only the prefix is fixed and the *last* segment is the
 * feature: `feature.com.talex.translate.translate-selection`.
 */
export function parseFeatureShortcutId(id: string): FeatureShortcutTarget | null {
  if (!id.startsWith(`${FEATURE_SHORTCUT_PREFIX}.`)) return null

  const rest = id.slice(FEATURE_SHORTCUT_PREFIX.length + 1)
  const separator = rest.lastIndexOf('.')
  if (separator <= 0 || separator === rest.length - 1) return null

  return {
    pluginName: rest.slice(0, separator),
    featureId: rest.slice(separator + 1)
  }
}
