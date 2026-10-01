import type {
  IExecuteArgs,
  IExecuteOutcome,
  PluginRecommendCandidate
} from '@talex-touch/utils/core-box'
import type { TuffItem, TuffRender } from '@talex-touch/utils'

type TuffBasicIcon = NonNullable<NonNullable<TuffRender['basic']>['icon']>

/** Host-generated clipboard-URL card source id. It is a recommendation source, not a plugin one. */
export const BUILTIN_CLIPBOARD_URL_SOURCE_ID = '__builtin_clipboard_url__'

const DEFAULT_PLUGIN_RECOMMEND_ICON: TuffBasicIcon = {
  type: 'class',
  value: 'i-ri-lightbulb-line'
}
const SUPPORTED_RECOMMEND_ICON_TYPES = new Set(['emoji', 'url', 'file', 'class', 'builtin'])

/** Source id a plugin's recommendation provider registers under, derived from its provider id. */
export function pluginRecommendationSourceId(providerId: string): string {
  return `plugin-recommend:${providerId}`
}

function normalizePluginRecommendIcon(icon: unknown): TuffBasicIcon {
  if (!icon || typeof icon !== 'object') return { ...DEFAULT_PLUGIN_RECOMMEND_ICON }

  const raw = icon as Record<string, unknown>
  if (
    typeof raw.type !== 'string' ||
    !SUPPORTED_RECOMMEND_ICON_TYPES.has(raw.type) ||
    typeof raw.value !== 'string' ||
    !raw.value.trim()
  ) {
    return { ...DEFAULT_PLUGIN_RECOMMEND_ICON }
  }

  const normalized: TuffBasicIcon = {
    type: raw.type as TuffBasicIcon['type'],
    value: raw.value
  }

  if (typeof raw.color === 'string') normalized.color = raw.color
  if (typeof raw.colorful === 'boolean') normalized.colorful = raw.colorful
  if (raw.status === 'normal' || raw.status === 'loading' || raw.status === 'error') {
    normalized.status = raw.status
  }
  if (typeof raw.error === 'string') normalized.error = raw.error

  return normalized
}

/** Snapshot the host took of a candidate during the last recommendation pass. */
export interface PluginRecommendSnapshot {
  readonly candidate: PluginRecommendCandidate
}

/**
 * Serialize one snapshot into the clickable item.
 *
 * This used to be an inline branch in `ItemRebuilder` keyed off `pluginCandidate` on the scored
 * item. It is here instead because the clickable card and its id belong to the source that owns the
 * candidate: the rebuilder now dispatches every source through the registry, and a plugin source
 * builds its own items from its own snapshot.
 */
export function buildPluginRecommendItem(
  sourceId: string,
  snapshot: PluginRecommendSnapshot
): TuffItem {
  const { candidate } = snapshot
  const isBuiltinUrl = sourceId === BUILTIN_CLIPBOARD_URL_SOURCE_ID

  return {
    id: candidate.id,
    source: {
      id: sourceId,
      type: (isBuiltinUrl ? 'system' : 'plugin') as TuffItem['source']['type'],
      name: isBuiltinUrl ? 'Clipboard URL' : `Plugin: ${candidate.providerId || 'unknown'}`
    },
    kind: 'action',
    render: {
      mode: 'default',
      basic: {
        title: candidate.title,
        subtitle: candidate.subtitle,
        icon: normalizePluginRecommendIcon(candidate.icon)
      }
    },
    actions: isBuiltinUrl
      ? [
          {
            id: 'open-url',
            type: 'execute',
            label: '打开',
            shortcut: 'Enter'
          },
          {
            id: 'copy-url',
            type: 'copy',
            label: '复制',
            shortcut: 'CmdOrCtrl+C'
          }
        ]
      : [
          {
            id: candidate.action,
            type: 'execute',
            label: 'Execute',
            shortcut: 'Enter'
          }
        ],
    meta: {
      pluginRecommend: {
        providerId: candidate.providerId,
        action: candidate.action,
        data: candidate.data
      },
      _originalItemId: candidate.id,
      _originalSourceId: sourceId
    } as TuffItem['meta']
  }
}

/**
 * One registered recommendation source backed by host-held candidate snapshots.
 *
 * `rebuild` rehydrates only the ids still present in the live snapshot map — a candidate the host
 * no longer holds is not executable, so it must not come back as a clickable card. `execute`
 * likewise refuses an unknown id rather than trusting the renderer's copy of the payload.
 */
export function createSnapshotRecommendationSource(
  sourceId: string,
  snapshots: () => ReadonlyMap<string, PluginRecommendSnapshot> | undefined,
  execute: (args: IExecuteArgs) => Promise<IExecuteOutcome>
): {
  sourceId: string
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
  execute(args: IExecuteArgs): Promise<IExecuteOutcome>
} {
  return {
    sourceId,
    async rebuild(itemIds) {
      const live = snapshots()
      if (!live || itemIds.length === 0) return []
      const items: TuffItem[] = []
      for (const itemId of itemIds) {
        const snapshot = live.get(itemId)
        if (snapshot) items.push(buildPluginRecommendItem(sourceId, snapshot))
      }
      return items
    },
    execute
  }
}
