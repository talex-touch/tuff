import type { FlowTargetInfo, ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { useTuffTransport } from '@talex-touch/utils/transport'
import type { FlowConsentCheckResponse } from '@talex-touch/utils/transport/events/types'
import type { MetaFlowSelection } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { computed, ref, shallowRef, watch } from 'vue'
import { normalizeCoreBoxIcon } from '~/components/render/icon-color-mode'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  estimateMetaPanelHeight,
  META_FLOW_CONFIRM_PANEL_HEIGHT
} from '../../../../../shared/meta-overlay-geometry'
import { buildCoreBoxFlowPayload } from './core-box-flow-payload'
import { matchesMetaPanelQuery, normalizeMetaPanelQuery } from './meta-panel-filter'

/**
 * The Flow page of the ⌘K card: where to send the item the card was opened for. The overlay view
 * (`views/meta/MetaOverlay.vue`) draws it as the card's second page, after the action list, or
 * opens straight on it for ⌘⇧D; this holds what the page knows, the view what it shows.
 *
 * Targets are grouped by plugin, in the order main first lists each plugin. A target that needs
 * authorization or confirmation asks for it on a third page (`select` answers `confirm`). The
 * page only picks: what it picked rides the transfer action back to the CoreBox renderer, which
 * builds the payload and dispatches it (`useDetach.dispatchFlow`).
 */

const metaFlowPageLog = createRendererLogger('MetaFlowPage')

/** DOM id of the target list; row and section ids derive from it. */
export const META_FLOW_LIST_ID = 'meta-flow-list'

export interface MetaFlowTargetRow {
  target: FlowTargetInfo
  icon: ITuffIcon
  subtitle?: string
  /** Position in the flattened, filtered list: the keyboard index. */
  index: number
  domId: string
}

export interface MetaFlowTargetSection {
  key: string
  title: string
  titleId: string
  rows: MetaFlowTargetRow[]
}

/** What picking a target leads to: the transfer itself, or the confirmation page first. */
export type MetaFlowSelectOutcome =
  | { kind: 'dispatch'; selection: MetaFlowSelection }
  | { kind: 'confirm' }

export interface UseMetaFlowPageOptions {
  transport: ReturnType<typeof useTuffTransport>
  t: (key: string, params?: Record<string, unknown>) => string
}

/** Targets fetched for an item before its page opened; `loaded` once they have arrived. */
interface FlowTargetsPrefetch {
  item: TuffItem
  pending: Promise<FlowTargetInfo[]>
  loaded?: FlowTargetInfo[]
}

/**
 * Height of the Flow page for these targets, from every target rather than the filtered ones: as
 * on the action list, typing in the filter does not resize the window. No targets, or none known
 * yet, draw one row. The CoreBox renderer sizes a card opened on this page with it, and the page
 * reports the same number when it changes.
 */
export function estimateFlowTargetsPanelHeight(targets: readonly FlowTargetInfo[]): number {
  const sectionCount = new Set(targets.map((target) => target.pluginId)).size
  if (sectionCount === 0) {
    return estimateMetaPanelHeight({ rows: 1, sections: 1, titledSections: 0 })
  }
  return estimateMetaPanelHeight({
    rows: targets.length,
    sections: sectionCount,
    titledSections: sectionCount
  })
}

export function useMetaFlowPage(options: UseMetaFlowPageOptions) {
  const { transport, t } = options

  // Opaque transport records: nothing here mutates them, and a deep ref would proxy them.
  const targets = shallowRef<FlowTargetInfo[]>([])
  const loading = ref(false)
  const showLoading = useDeferredLoading(loading)
  const query = ref('')
  const activeIndex = ref(0)
  const composing = ref(false)
  const consentTarget = shallowRef<FlowTargetInfo | null>(null)
  const consentRequiresAuthorization = ref(false)
  const consentRequiresExecutionConfirmation = ref(false)
  const consentLoading = ref(false)
  // The sender the item's payload names: consent is checked and granted for it, and CoreBox
  // dispatches as it (`buildCoreBoxFlowPayload`).
  const senderId = ref('corebox')

  // Bumped whenever the page opens, is left, or the card closes: a reply that lands after that
  // belongs to a page that is gone, and must not pick a target for the content of the next one.
  let generation = 0
  // Taken when a target is picked, so a second Enter or click cannot dispatch the content twice.
  // Denying the confirmation gives it back; the next open starts without it.
  let selectionLocked = false
  // Fetched when the card opens on its action list with a 流转 row, so the page usually has its
  // targets by the time it is pushed. Kept for the open card only.
  let prefetched: FlowTargetsPrefetch | null = null

  /** Targets by plugin, each plugin where main first lists one of its targets. */
  const groups = computed(() => {
    const byPlugin = new Map<string, FlowTargetInfo[]>()
    for (const target of targets.value) {
      const group = byPlugin.get(target.pluginId)
      if (group) group.push(target)
      else byPlugin.set(target.pluginId, [target])
    }
    return [...byPlugin.values()]
  })

  const sections = computed<MetaFlowTargetSection[]>(() => {
    const normalized = normalizeMetaPanelQuery(query.value)
    let index = 0
    const result: MetaFlowTargetSection[] = []
    for (const group of groups.value) {
      const rows: MetaFlowTargetRow[] = []
      for (const target of group) {
        const subtitle = target.description || target.adaptationHint || undefined
        if (!matchesMetaPanelQuery(normalized, target.name, [subtitle, target.pluginName])) continue
        rows.push({
          target,
          // `ri:` names from main become `i-ri-` classes; no icon falls back to the plugin's.
          icon: normalizeCoreBoxIcon(target.icon || target.pluginIcon),
          subtitle,
          index,
          domId: `${META_FLOW_LIST_ID}-option-${index}`
        })
        index += 1
      }
      if (rows.length === 0) continue
      const owner = group[0]!
      result.push({
        key: owner.pluginId,
        title: owner.pluginName || owner.pluginId,
        titleId: `${META_FLOW_LIST_ID}-section-${result.length}`,
        rows
      })
    }
    return result
  })

  const flatRows = computed(() => sections.value.flatMap((section) => section.rows))
  const activeRow = computed(() => flatRows.value[activeIndex.value] ?? null)
  const activeRowHighlighted = computed(
    () => activeRow.value !== null && activeRow.value.target.isEnabled !== false
  )

  const listPanelHeight = computed(() => estimateFlowTargetsPanelHeight(targets.value))
  // Never shorter than the list: going back to it must not shrink the card and grow it again.
  const confirmPanelHeight = computed(() =>
    Math.max(listPanelHeight.value, META_FLOW_CONFIRM_PANEL_HEIGHT)
  )

  const consentTargetName = computed(
    () => consentTarget.value?.pluginName || consentTarget.value?.name || t('flow.defaultTarget')
  )
  const confirmTitle = computed(() => {
    if (consentRequiresAuthorization.value && consentRequiresExecutionConfirmation.value) {
      return t('flow.authorizationAndConfirmationTitle')
    }
    if (consentRequiresExecutionConfirmation.value) {
      return t('flow.executionConfirmationTitle')
    }
    return t('flow.consentTitle')
  })
  const confirmDescription = computed(() => {
    // Both bundles name the sender `{source}`.
    const params = {
      source: senderId.value,
      target: consentTargetName.value
    }
    if (consentRequiresAuthorization.value && consentRequiresExecutionConfirmation.value) {
      return t('flow.authorizationAndConfirmationDesc', params)
    }
    if (consentRequiresExecutionConfirmation.value) {
      return t('flow.executionConfirmationDesc', params)
    }
    return t('flow.consentDesc', params)
  })
  const onceLabel = computed(() =>
    consentRequiresExecutionConfirmation.value && consentRequiresAuthorization.value
      ? t('flow.allowAndConfirmOnce')
      : consentRequiresExecutionConfirmation.value
        ? t('flow.confirmOnce')
        : t('flow.consentOnce')
  )
  const showAlwaysAction = computed(() => consentRequiresAuthorization.value)
  const primaryLabel = computed(() =>
    consentRequiresExecutionConfirmation.value && consentRequiresAuthorization.value
      ? t('flow.confirmAndSend')
      : consentRequiresExecutionConfirmation.value
        ? t('flow.confirmOnce')
        : t('flow.consentAlways')
  )
  const primaryMode = computed<'once' | 'always'>(() =>
    showAlwaysAction.value ? 'always' : 'once'
  )

  function firstSelectableIndex(): number {
    const found = flatRows.value.find((row) => row.target.isEnabled !== false)
    return found ? found.index : 0
  }

  // Loaded targets start on their first row again, and so does a new filter.
  watch(targets, () => {
    activeIndex.value = firstSelectableIndex()
  })
  watch(
    () => normalizeMetaPanelQuery(query.value),
    () => {
      activeIndex.value = firstSelectableIndex()
    }
  )

  async function fetchTargets(item: TuffItem): Promise<FlowTargetInfo[]> {
    try {
      const response = await transport.send(FlowEvents.getTargets, {
        payloadType: buildCoreBoxFlowPayload(item, '').type
      })
      if (response?.success) return response.data || []
      metaFlowPageLog.error('Failed to load targets:', response?.error)
    } catch (error) {
      metaFlowPageLog.error('Error loading targets:', error)
    }
    return []
  }

  function resetConsent(): void {
    consentTarget.value = null
    consentRequiresAuthorization.value = false
    consentRequiresExecutionConfirmation.value = false
    consentLoading.value = false
  }

  /** Fetches the targets ahead of the page, for the card that just opened on its action list. */
  function prefetch(item: TuffItem): void {
    const entry: FlowTargetsPrefetch = { item, pending: fetchTargets(item) }
    prefetched = entry
    void entry.pending.then((loaded) => {
      entry.loaded = loaded
    })
  }

  /**
   * Starts the page for `item`: with `preset` targets when the sender fetched them (⌘⇧D), with a
   * prefetch for the same item, done or still running, or with a fetch of its own.
   */
  function open(item: TuffItem, preset?: FlowTargetInfo[]): void {
    generation += 1
    const current = generation
    selectionLocked = false
    composing.value = false
    resetConsent()
    query.value = ''
    activeIndex.value = 0
    senderId.value = buildCoreBoxFlowPayload(item, '').context?.sourcePluginId || 'corebox'

    const reused = prefetched?.item === item ? prefetched : null
    const known = preset ?? reused?.loaded
    if (known) {
      loading.value = false
      targets.value = known
      // Set here too: the same targets again (a return to the page) do not trigger the watch.
      activeIndex.value = firstSelectableIndex()
      return
    }

    targets.value = []
    loading.value = true
    void (reused?.pending ?? fetchTargets(item)).then((loaded) => {
      if (current !== generation) return
      targets.value = loaded
      loading.value = false
    })
  }

  /** The card left the page without closing: whatever it had in flight no longer counts. */
  function cancel(): void {
    generation += 1
    selectionLocked = false
    loading.value = false
    composing.value = false
    resetConsent()
  }

  /** The card opened again or closed: nothing of the last page, and no prefetch, carries over. */
  function reset(): void {
    cancel()
    prefetched = null
    query.value = ''
    activeIndex.value = 0
    targets.value = []
  }

  /**
   * Picks a target. A target that is allowed and asks for no confirmation is the selection itself;
   * any other opens the confirmation (`confirm`). `null` when nothing happens: the pick is locked,
   * the row is disabled, the check failed, or its reply belongs to a page that is gone.
   */
  async function select(row: MetaFlowTargetRow): Promise<MetaFlowSelectOutcome | null> {
    const target = row.target
    if (selectionLocked || target.isEnabled === false) return null
    selectionLocked = true
    const current = generation

    let response: FlowConsentCheckResponse | undefined
    try {
      response = await transport.send(FlowEvents.checkConsent, {
        senderId: senderId.value,
        targetId: target.fullId
      })
    } catch (error) {
      if (current !== generation) return null
      metaFlowPageLog.error('Failed to check consent:', error)
      selectionLocked = false
      return null
    }
    if (current !== generation) return null

    const allowed = response?.success === true && response.data?.allowed === true
    const requiresConfirmation = response?.data?.requiresConfirmation === true
    if (allowed && !requiresConfirmation) {
      return { kind: 'dispatch', selection: { targetId: target.fullId } }
    }
    consentRequiresAuthorization.value = !allowed
    consentRequiresExecutionConfirmation.value = requiresConfirmation
    consentTarget.value = target
    return { kind: 'confirm' }
  }

  /**
   * Grants what the confirmation asked for, `once` or `always`, and answers the selection with the
   * tokens main returned. `null` when the grant failed or its reply belongs to a page that is gone.
   */
  async function handleConsent(mode: 'once' | 'always'): Promise<MetaFlowSelection | null> {
    const target = consentTarget.value
    if (!target || consentLoading.value) return null
    consentLoading.value = true
    const current = generation

    try {
      const response = await transport.send(FlowEvents.grantConsent, {
        senderId: senderId.value,
        targetId: target.fullId,
        mode
      })
      if (current !== generation) return null
      if (response?.success) {
        const consentToken = response.data?.token
        const confirmationToken = response.data?.confirmationToken
        // The buttons stay disabled until the card closes: the content is on its way.
        return {
          targetId: target.fullId,
          ...(typeof consentToken === 'string' ? { consentToken } : {}),
          ...(typeof confirmationToken === 'string' ? { confirmationToken } : {})
        }
      }
      metaFlowPageLog.error('Failed to grant consent:', response?.error)
    } catch (error) {
      if (current !== generation) return null
      metaFlowPageLog.error('Failed to grant consent:', error)
    }
    consentLoading.value = false
    return null
  }

  /** Nothing granted, nothing sent: the selection is handed back for the next pick. */
  function deny(): void {
    resetConsent()
    selectionLocked = false
  }

  /** Moves the active row, wrapping, past disabled rows. @returns Whether there was a row to move to. */
  function step(delta: number): boolean {
    const selectable = flatRows.value.filter((row) => row.target.isEnabled !== false)
    if (selectable.length === 0) return false
    const position = selectable.findIndex((row) => row.index === activeIndex.value)
    const next =
      position < 0
        ? selectable[delta > 0 ? 0 : selectable.length - 1]!
        : selectable[(position + delta + selectable.length) % selectable.length]!
    activeIndex.value = next.index
    return true
  }

  /**
   * Makes an enabled row under the pointer the active one. @returns Whether it changed, so the view
   * lets the hover plate glide there.
   */
  function hover(index: number): boolean {
    const row = flatRows.value[index]
    if (!row || row.target.isEnabled === false || index === activeIndex.value) return false
    activeIndex.value = index
    return true
  }

  return {
    targets,
    loading,
    showLoading,
    query,
    activeIndex,
    composing,
    sections,
    flatRows,
    activeRow,
    activeRowHighlighted,
    consentTarget,
    consentRequiresAuthorization,
    consentRequiresExecutionConfirmation,
    consentLoading,
    confirmTitle,
    confirmDescription,
    onceLabel,
    primaryLabel,
    primaryMode,
    showAlwaysAction,
    listPanelHeight,
    confirmPanelHeight,
    open,
    prefetch,
    select,
    grant: handleConsent,
    deny,
    step,
    hover,
    cancel,
    reset
  }
}
