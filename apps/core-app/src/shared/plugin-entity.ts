import type { ITuffIcon, TuffItem } from '@talex-touch/utils'

/**
 * An installed plugin as a CoreBox result, managed in place.
 *
 * Main builds these rows (`PluginEntityProvider`), the CoreBox renderer draws them and their
 * management pane, and both sides dispatch the same action ids. The snapshot lives on
 * `item.meta.extension.pluginEntity`; the row never carries `meta.pluginName`, which would make
 * every CoreBox surface treat it as one of the plugin's own feature rows.
 */

export const PLUGIN_ENTITY_PROVIDER_ID = 'plugin-entities'
export const PLUGIN_ENTITY_ITEM_KIND = 'plugin'
/** Item id shape: `plugin-entity:<plugin name>`. */
export const PLUGIN_ENTITY_ITEM_ID_PREFIX = 'plugin-entity:'

export const PLUGIN_ENTITY_ACTION_IDS = Object.freeze({
  /** Enter on an enabled plugin with a runnable feature: the renderer runs that feature row. */
  runFeature: 'plugin-entity:run-feature',
  enable: 'plugin-entity:enable',
  disable: 'plugin-entity:disable',
  reload: 'plugin-entity:reload',
  openFolder: 'plugin-entity:open-folder',
  openDetail: 'plugin-entity:open-detail'
})

export type PluginEntityActionId =
  (typeof PLUGIN_ENTITY_ACTION_IDS)[keyof typeof PLUGIN_ENTITY_ACTION_IDS]

const ACTION_IDS: Readonly<Record<string, true>> = Object.fromEntries(
  Object.values(PLUGIN_ENTITY_ACTION_IDS).map((id) => [id, true])
)

export function isPluginEntityActionId(value: unknown): value is PluginEntityActionId {
  return typeof value === 'string' && Object.hasOwn(ACTION_IDS, value)
}

/**
 * What `onExecute` throws when enabling waits on the user: the plugin's permissions are confirmed
 * on a card in the main window, which main has brought forward. Not a failure.
 */
export const PLUGIN_ENTITY_PERMISSION_REQUIRED = 'PLUGIN_ENTITY_PERMISSION_REQUIRED'
/** What `onExecute` throws when a management step did not happen. */
export const PLUGIN_ENTITY_ACTION_FAILED = 'PLUGIN_ENTITY_ACTION_FAILED'

/**
 * What the row says about the plugin. `PluginStatus` has ten values; the user acts on five.
 * `failed` covers a load failure and `dev-disconnected` a dev server that went away.
 */
export type PluginEntityState =
  | 'enabled'
  | 'disabled'
  | 'loading'
  | 'failed'
  | 'crashed'
  | 'dev-disconnected'

/**
 * What keeps the plugin from running, as main recorded it: the code and details word it in the
 * interface language, and `message` is main's own sentence, shown beneath as the detail.
 */
export interface PluginEntityProblem {
  type: 'error' | 'warning'
  code?: string
  source?: string
  message: string
  suggestion?: string
  meta?: Record<string, unknown>
}

export interface PluginEntityFeature {
  id: string
  name: string
  desc: string
  icon?: ITuffIcon
  /** The feature's own result row, present only while the plugin can run it. */
  item?: TuffItem
}

export interface PluginEntitySnapshot {
  name: string
  displayName: string
  version: string
  description: string
  state: PluginEntityState
  /** The action Enter runs; also the row's primary ⌘K action. */
  primaryAction: PluginEntityActionId
  /** Load error or the first error issue. */
  problem?: PluginEntityProblem
  dev: boolean
  features: PluginEntityFeature[]
}

/**
 * The one decision both sides need: what Enter does for a plugin in this state.
 *
 * An enabled plugin runs its first runnable feature, which is what typing a plugin's name and
 * pressing Enter means. A plugin that cannot run offers the one step that would make it run.
 */
export function resolvePluginEntityPrimaryAction(
  state: PluginEntityState,
  hasRunnableFeature: boolean
): PluginEntityActionId {
  switch (state) {
    case 'enabled':
      return hasRunnableFeature
        ? PLUGIN_ENTITY_ACTION_IDS.runFeature
        : PLUGIN_ENTITY_ACTION_IDS.openDetail
    case 'disabled':
      return PLUGIN_ENTITY_ACTION_IDS.enable
    case 'failed':
    case 'crashed':
    case 'dev-disconnected':
      return PLUGIN_ENTITY_ACTION_IDS.reload
    case 'loading':
      return PLUGIN_ENTITY_ACTION_IDS.openDetail
  }
}

/** The plugin's first feature that can run now, or `null`. */
export function resolvePluginEntityRunnableFeature(
  snapshot: PluginEntitySnapshot
): TuffItem | null {
  if (snapshot.state !== 'enabled') return null
  return snapshot.features.find((feature) => feature.item)?.item ?? null
}

const STATES: Readonly<Record<PluginEntityState, true>> = {
  enabled: true,
  disabled: true,
  loading: true,
  failed: true,
  crashed: true,
  'dev-disconnected': true
}

/**
 * The snapshot a plugin-entity row carries, or `null` for any other row. Read defensively: the
 * row crossed IPC, and a malformed one must draw nothing rather than a half-filled pane.
 */
export function readPluginEntitySnapshot(
  item: TuffItem | null | undefined
): PluginEntitySnapshot | null {
  if (!item || item.kind !== PLUGIN_ENTITY_ITEM_KIND) return null
  const candidate: unknown = item.meta?.extension?.pluginEntity
  if (typeof candidate !== 'object' || candidate === null) return null
  const snapshot = candidate as Partial<PluginEntitySnapshot>
  if (typeof snapshot.name !== 'string' || !snapshot.name) return null
  if (typeof snapshot.state !== 'string' || !Object.hasOwn(STATES, snapshot.state)) return null
  if (!isPluginEntityActionId(snapshot.primaryAction)) return null
  if (!Array.isArray(snapshot.features) || !snapshot.features.every(isFeatureEntry)) return null
  return snapshot as PluginEntitySnapshot
}

/** The fields the pane and Enter read off a feature entry. */
function isFeatureEntry(value: unknown): value is PluginEntityFeature {
  if (typeof value !== 'object' || value === null) return false
  const feature = value as Partial<PluginEntityFeature>
  if (typeof feature.id !== 'string' || typeof feature.name !== 'string') return false
  return feature.item === undefined || (typeof feature.item === 'object' && feature.item !== null)
}
