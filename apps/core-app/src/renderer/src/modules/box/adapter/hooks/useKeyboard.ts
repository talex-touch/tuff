import type { IProviderActivate, TuffItem, TuffSection } from '@talex-touch/utils'
import type { MetaShowRequest } from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { ForwardedKeyEvent } from '../transport/key-transport'
import type { CoreBoxMetaActionEventDetail } from '../../meta-actions/meta-action-model'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { onBeforeUnmount } from 'vue'
import { BoxMode } from '..'
import {
  buildMetaActionModel,
  buildMetaShowRequest,
  COREBOX_META_ACTION_EVENT,
  estimateMetaActionPanelHeight,
  isImeComposing,
  resolveMetaActionShortcut
} from '../../meta-actions/meta-action-model'
import { createCoreBoxKeyTransport } from '../transport/key-transport'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { resolveVisibleBoxGridColumnCount } from '~/components/render/box-grid-layout'
import { publishWidgetHostKeyEvent } from '~/modules/plugin/widget-host-key-bridge'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'

interface SectionRange {
  start: number
  end: number
  count: number
  columns: number
}

type ScrollbarLike = {
  getScrollInfo: () => { clientHeight: number; scrollTop: number }
  scrollTo: (x: number, y: number) => void
}

type ItemRef = { $el?: HTMLElement } | HTMLElement | null

type ClipboardOptions = {
  last?: unknown
}

const rendererPlatformState = getCurrentRendererPlatformState()
const coreBoxKeyboardLog = createRendererLogger('CoreBoxKeyboard')

/** Build section ranges from sections config */
function buildSectionRanges(sections: TuffSection[], fallbackColumns: number): SectionRange[] {
  const ranges: SectionRange[] = []
  let start = 0
  for (const section of sections) {
    const count = section.itemIds.length
    if (count > 0) {
      ranges.push({
        start,
        end: start + count - 1,
        count,
        columns: resolveVisibleBoxGridColumnCount(section, count, fallbackColumns)
      })
      start += count
    }
  }
  return ranges
}

/**
 * The columns BoxGrid is actually showing: what fit at the tile minimum (it wraps the rest onto
 * another row), never more than the layout declared. Undefined until BoxGrid has measured.
 */
function resolveVisibleGridColumns(
  boxOptions: Pick<IBoxOptions, 'layout' | 'visibleGridColumns'>
): number {
  const declared = boxOptions.layout?.grid?.columns || 5
  const visible = boxOptions.visibleGridColumns
  return visible ? Math.max(1, Math.min(visible, declared)) : declared
}

/** Find which section a global index belongs to */
function findSectionIndex(index: number, ranges: SectionRange[]): number {
  for (let i = 0; i < ranges.length; i++) {
    if (index >= ranges[i].start && index <= ranges[i].end) {
      return i
    }
  }
  return ranges.length - 1
}

/** Navigate down in multi-section grid */
function navigateGridDown(
  currentIndex: number,
  fallbackColumns: number,
  sections: TuffSection[],
  totalItems: number
): number {
  const ranges = buildSectionRanges(sections, fallbackColumns)
  if (ranges.length === 0) return currentIndex

  const sectionIdx = findSectionIndex(currentIndex, ranges)
  const section = ranges[sectionIdx]
  const localIndex = currentIndex - section.start
  const localCol = localIndex % section.columns
  const localRow = Math.floor(localIndex / section.columns)
  const sectionRows = Math.ceil(section.count / section.columns)

  const nextLocalRow = localRow + 1
  if (nextLocalRow < sectionRows) {
    const nextLocalIndex = nextLocalRow * section.columns + localCol
    if (nextLocalIndex < section.count) {
      return section.start + nextLocalIndex
    }
    return section.end
  }

  if (sectionIdx < ranges.length - 1) {
    const nextSection = ranges[sectionIdx + 1]
    const targetColumn = Math.min(localCol, nextSection.columns - 1)
    return nextSection.start + Math.min(targetColumn, nextSection.count - 1)
  }

  if (totalItems <= 20) {
    const firstSection = ranges[0]
    const targetColumn = Math.min(localCol, firstSection.columns - 1)
    return Math.min(targetColumn, firstSection.count - 1)
  }

  return currentIndex
}

/** Navigate up in multi-section grid */
function navigateGridUp(
  currentIndex: number,
  fallbackColumns: number,
  sections: TuffSection[]
): number {
  const ranges = buildSectionRanges(sections, fallbackColumns)
  if (ranges.length === 0) return currentIndex

  const sectionIdx = findSectionIndex(currentIndex, ranges)
  const section = ranges[sectionIdx]
  const localIndex = currentIndex - section.start
  const localCol = localIndex % section.columns
  const localRow = Math.floor(localIndex / section.columns)

  if (localRow > 0) {
    return section.start + (localRow - 1) * section.columns + localCol
  }

  if (sectionIdx > 0) {
    const previousSection = ranges[sectionIdx - 1]
    const targetColumn = Math.min(localCol, previousSection.columns - 1)
    const lastRowStart =
      (Math.ceil(previousSection.count / previousSection.columns) - 1) * previousSection.columns
    const targetLocalIndex = lastRowStart + targetColumn
    return targetLocalIndex < previousSection.count
      ? previousSection.start + targetLocalIndex
      : previousSection.end
  }

  const totalItems = ranges.reduce((sum, range) => sum + range.count, 0)
  if (totalItems <= 20) {
    const lastSection = ranges[ranges.length - 1]
    const targetColumn = Math.min(localCol, lastSection.columns - 1)
    const lastRowStart =
      (Math.ceil(lastSection.count / lastSection.columns) - 1) * lastSection.columns
    const targetLocalIndex = lastRowStart + targetColumn
    return targetLocalIndex < lastSection.count
      ? lastSection.start + targetLocalIndex
      : lastSection.end
  }

  return currentIndex
}

declare global {
  interface Window {
    __coreboxHistoryVisible?: boolean
  }
}

/**
 * Keys that should always be forwarded to plugin UI view when in UI mode.
 * ArrowLeft/ArrowRight are NOT forwarded unless meta/ctrl is pressed,
 * as they are used for text cursor navigation in the input field.
 */
const FORWARD_KEYS = new Set(['Enter', 'ArrowUp', 'ArrowDown'])

/**
 * Keys that should be forwarded when Alt/Option key is pressed.
 * These are common text editing shortcuts:
 * - Option+Backspace: Delete word backward
 * - Option+Delete: Delete word forward
 * - Option+Left/Right: Move by word
 */
const ALT_FORWARD_KEYS = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'])

/**
 * Keys that should NOT be forwarded even in input-hidden mode.
 * These are system-level shortcuts handled by CoreBox itself.
 */
const SYSTEM_KEYS = new Set(['Escape'])
const BLOCKED_FUNCTION_KEY_PATTERN = /^F(?:[1-9]|1\d|2[0-4])$/

function isBlockedFunctionKey(event: KeyboardEvent): boolean {
  return BLOCKED_FUNCTION_KEY_PATTERN.test(event.key)
}

/**
 * Text editing shortcuts that should stay in CoreBox input when input is visible.
 */
const INPUT_EDIT_SHORTCUT_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y'])

/**
 * Event name for triggering DivisionBox detach (Command+D)
 */
const COREBOX_DETACH_EVENT = 'corebox:detach-item'

const isMac = rendererPlatformState.isMac

/**
 * Whether CoreBox is showing its footer. The ⌘K panel sits just above it when it is, and drops to
 * the window corner when it is not: plugin UI mode, no results, or an item that hides the footer.
 */
function isCoreBoxFooterShown(): boolean {
  return Boolean(document.querySelector('.CoreBoxFooter-Sticky.display'))
}

/**
 * The ⌘K show request: the item's actions plus where the panel anchors and how tall it needs to
 * be, so main grows the window only when the panel would not fit in it.
 */
export function buildCoreBoxMetaShowRequest(
  item: TuffItem,
  options: { footerShown: boolean }
): MetaShowRequest {
  const request = buildMetaShowRequest(item)
  const model = buildMetaActionModel(request, { platform: rendererPlatformState.platform })
  return {
    ...request,
    anchor: options.footerShown ? 'footer' : 'corner',
    desiredPanelHeight: estimateMetaActionPanelHeight(model)
  }
}

export function resolveQuickActionsItem(
  results: TuffItem[],
  focus: number,
  activations: IProviderActivate[] | null
): TuffItem | null {
  const featureItem = activations?.find((activation) => activation?.id === 'plugin-features')?.meta
    ?.feature as TuffItem | undefined
  if (
    featureItem &&
    featureItem.id &&
    (featureItem.render?.basic?.title || featureItem.actions?.length)
  ) {
    return featureItem
  }

  const focused = results[focus]
  if (focused) {
    return focused
  }

  const fallbackActivation = activations?.[0]
  if (!fallbackActivation) {
    return results[0] ?? null
  }

  const pluginName =
    typeof fallbackActivation.meta?.pluginName === 'string'
      ? fallbackActivation.meta.pluginName
      : 'plugin'
  const featureId =
    typeof fallbackActivation.meta?.featureId === 'string'
      ? fallbackActivation.meta.featureId
      : 'active'

  return {
    id: `quick-actions/${pluginName}/${featureId}`,
    source: {
      type: 'plugin',
      id: pluginName,
      name: fallbackActivation.name || pluginName
    },
    kind: 'feature',
    render: {
      mode: 'default',
      basic: {
        title: fallbackActivation.name || 'Quick Actions',
        subtitle: pluginName
      }
    },
    meta: {
      pluginName,
      featureId
    }
  }
}

export function hasCoreBoxAttachment(
  boxOptions: Pick<IBoxOptions, 'mode' | 'file'>,
  clipboardOptions: ClipboardOptions
): boolean {
  return (
    Boolean(clipboardOptions.last) ||
    (boxOptions.mode === BoxMode.FILE && (boxOptions.file?.paths?.length ?? 0) > 0)
  )
}

export function clearCoreBoxAttachment(
  boxOptions: Pick<IBoxOptions, 'mode' | 'file'>,
  clearClipboard: (options?: { remember?: boolean }) => void
): void {
  clearClipboard({ remember: true })

  if (boxOptions.mode === BoxMode.FILE) {
    boxOptions.mode = BoxMode.INPUT
    boxOptions.file = { buffer: null, paths: [] }
  }
}

type EscapeKeyResult = 'overlay' | 'attachment' | 'provider' | 'query' | 'hide'

export async function handleCoreBoxEscapeKey(options: {
  event: KeyboardEvent
  isMetaOverlayVisible: () => Promise<boolean>
  hideMetaOverlay: () => Promise<unknown>
  boxOptions: Pick<IBoxOptions, 'mode' | 'file'>
  clipboardOptions: ClipboardOptions
  clearClipboard: (options?: { remember?: boolean }) => void
  activeCount: number
  handleExit: () => Promise<void>
  searchVal: Ref<string>
}): Promise<EscapeKeyResult> {
  const {
    event,
    isMetaOverlayVisible,
    hideMetaOverlay,
    boxOptions,
    clipboardOptions,
    clearClipboard,
    activeCount,
    handleExit,
    searchVal
  } = options

  event.preventDefault()
  event.stopPropagation()

  try {
    if (await isMetaOverlayVisible()) {
      await hideMetaOverlay()
      return 'overlay'
    }
  } catch {
    // If check fails, continue with normal ESC handling.
  }

  if (hasCoreBoxAttachment(boxOptions, clipboardOptions)) {
    clearCoreBoxAttachment(boxOptions, clearClipboard)
    return 'attachment'
  }

  if (activeCount > 0) {
    void handleExit()
    return 'provider'
  }

  if (searchVal.value) {
    searchVal.value = ''
    return 'query'
  }

  void handleExit()
  return 'hide'
}

function resolveActiveFeatureItem(activations: IProviderActivate[] | null): TuffItem | null {
  const feature = activations?.find((activation) => activation?.id === 'plugin-features')?.meta
    ?.feature
  return feature && typeof feature === 'object' ? (feature as TuffItem) : null
}

function isInputEditingShortcut(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false

  return INPUT_EDIT_SHORTCUT_KEYS.has(event.key.toLowerCase())
}

/**
 * Determines if a keyboard event should be forwarded to the plugin UI view.
 *
 * Common shortcuts that should be forwarded (when input is hidden):
 * - Cmd/Ctrl+A/C/X/Z/Y
 * - Cmd/Ctrl+Backspace: Delete to line start
 * - Option/Alt+Backspace: Delete word backward
 * - Option/Alt+Delete: Delete word forward
 * - Option/Alt+Left/Right: Move by word
 * - Cmd/Ctrl+Left/Right: Move to line start/end
 *
 * @param event - The keyboard event to check
 * @param inputHidden - Whether the input is hidden (UI mode with no input box)
 * @returns True if the event should be forwarded
 */
export function shouldForwardKey(event: KeyboardEvent, inputHidden = false): boolean {
  // Flow commands belong to the CoreBox page even when a plugin UI view is attached.
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'd') {
    return false
  }

  // Never forward system keys (Escape for exit) or function keys (F11 fullscreen etc.)
  if (SYSTEM_KEYS.has(event.key) || isBlockedFunctionKey(event)) {
    return false
  }

  // Never forward ⌘←/⌘→ - reserved for CoreBox history panel
  if (
    (event.metaKey || event.ctrlKey) &&
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    return false
  }

  // Never forward ⌘K/Ctrl+K - reserved for MetaOverlay panel
  if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
    return false
  }

  // Keep input editing shortcuts in CoreBox input when the input is visible.
  if (!inputHidden && isInputEditingShortcut(event)) {
    return false
  }

  // In input-hidden mode (UI mode), forward almost all keys except system keys
  if (inputHidden) {
    // Don't forward Cmd+V (handled separately for paste)
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      return false
    }
    return true
  }

  // Normal mode: forward specific keys
  // Forward all Cmd/Ctrl shortcuts except Cmd+V (handled separately for paste)
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() !== 'v') {
    return true
  }
  // Forward Alt/Option key combinations for word-level editing
  if (event.altKey && ALT_FORWARD_KEYS.has(event.key)) {
    return true
  }
  return FORWARD_KEYS.has(event.key)
}

/**
 * Serializes a DOM KeyboardEvent into a plain object for IPC transport.
 *
 * @param event - The keyboard event to serialize
 * @returns A serializable keyboard event object
 */
function serializeKeyEvent(event: KeyboardEvent): ForwardedKeyEvent {
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat
  }
}

export function useKeyboard(
  boxOptions: IBoxOptions,
  res: Ref<TuffItem[]>,
  select: Ref<number>,
  scrollbar: Ref<ScrollbarLike | null>,
  searchVal: Ref<string>,
  handleExecute: (item: TuffItem | undefined) => void,
  handleExit: () => Promise<void>,
  inputEl: Ref<HTMLInputElement | undefined>,
  clipboardOptions: ClipboardOptions,
  clearClipboard: (options?: { remember?: boolean }) => void,
  activeActivations: Ref<IProviderActivate[] | null>,
  handlePaste: (options?: { overrideDismissed?: boolean }) => void,
  itemRefs: Ref<ItemRef[]>
) {
  const transport = useTuffTransport()
  const keyTransport = createCoreBoxKeyTransport(transport)

  function getFooterInset(): number {
    const footer = document.querySelector('.CoreBoxFooter-Sticky') as HTMLElement | null
    if (!footer) return 0
    const rect = footer.getBoundingClientRect()
    if (!Number.isFinite(rect.height) || rect.height <= 0) return 0
    return rect.height
  }

  function getScrollViewport(activeEl: HTMLElement): HTMLElement | null {
    const scrollRoot = activeEl.closest('.scroll-area') as HTMLElement | null
    return (
      scrollRoot?.querySelector<HTMLElement>('.tx-scroll__native') ??
      scrollRoot?.querySelector<HTMLElement>('.tx-scroll__wrapper') ??
      null
    )
  }

  /**
   * Checks if CoreBox is currently in UI mode (plugin view attached).
   */
  function isInUIMode(): boolean {
    return Boolean(activeActivations.value?.some((a) => a?.hideResults === true))
  }

  /**
   * Forwards a keyboard event to the plugin UI view via IPC.
   */
  function forwardToUIView(event: KeyboardEvent): void {
    keyTransport.forwardKeyEvent(serializeKeyEvent(event))
  }

  function isCustomWidgetItem(item?: TuffItem): boolean {
    const render = item?.render
    if (!render || render.mode !== 'custom') {
      return false
    }

    const customRender = render.custom
    return customRender?.type === 'vue' && typeof item?.id === 'string'
  }

  function shouldForwardToCustomWidget(event: KeyboardEvent, item?: TuffItem): boolean {
    if (!isCustomWidgetItem(item)) {
      return false
    }

    if (event.isComposing || event.keyCode === 229) {
      return false
    }

    return event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown'
  }

  function getActivePluginFeatureItem(): TuffItem | undefined {
    const activation = activeActivations.value?.find((item) => item?.id === 'plugin-features')
    const feature = (activation?.meta as { feature?: TuffItem } | undefined)?.feature
    return feature && typeof feature === 'object' ? feature : undefined
  }

  function shouldSubmitActivePluginFeature(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.repeat) {
      return false
    }
    const feature = getActivePluginFeatureItem()
    const interaction = (feature?.meta as { interaction?: { type?: string } } | undefined)
      ?.interaction
    return Boolean(feature && interaction?.type === 'widget' && searchVal.value.trim())
  }

  /**
   * Runs an action shortcut on the item the ⌘K panel would open for, with the panel closed.
   *
   * The key is resolved against the same action model the panel draws, so a badge in the panel
   * and the key in the list always name the same action. A key that names nothing this item offers
   * is left alone (not prevented): it falls through to CoreBox's own handling, which for ⌘↵ is the
   * ordinary Enter path.
   *
   * @returns Whether the event was consumed.
   */
  function runResultListActionShortcut(event: KeyboardEvent): boolean {
    if (!event.metaKey && !event.ctrlKey) return false
    if (isImeComposing(event)) return false
    // An in-page layer that owns the keyboard: the calculation history or the Flow picker.
    if (window.__coreboxHistoryVisible || document.querySelector('.FlowSelector')) return false

    const item = resolveQuickActionsItem(res.value, boxOptions.focus, activeActivations.value)
    if (!item) return false

    const model = buildMetaActionModel(buildMetaShowRequest(item), {
      platform: rendererPlatformState.platform
    })
    const row = resolveMetaActionShortcut(model, event, { isMac, scope: 'list' })
    if (!row) return false

    event.preventDefault()
    // Holding the chord must not copy or pin once per auto-repeat.
    if (event.repeat) return true

    window.dispatchEvent(
      new CustomEvent<CoreBoxMetaActionEventDetail>(COREBOX_META_ACTION_EVENT, {
        detail: { actionId: row.id, item }
      })
    )
    return true
  }

  /**
   * Whether this document saw the Enter now held down begin. The ⌘K panel runs a row on its own
   * Enter, and main hands focus back here while the key may still be down: the auto-repeats that
   * follow belong to that press and must not also run the selected result (or reach a plugin
   * view). Only a press that starts here arms Enter; losing or regaining focus forgets it, since
   * its keyup then lands in another document.
   */
  let enterPressSeen = false

  function forgetEnterPress(): void {
    enterPressSeen = false
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter') forgetEnterPress()
  }

  /** @returns Whether the key is an auto-repeat of an Enter pressed elsewhere, now swallowed. */
  function swallowForeignEnterRepeat(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter') return false
    if (!event.repeat) {
      enterPressSeen = true
      return false
    }
    if (enterPressSeen) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  /**
   * Global keyboard event handler for CoreBox window
   * @param event - KeyboardEvent from user interaction
   */
  async function onKeyDown(event: KeyboardEvent): Promise<void> {
    // Debug: log all meta+arrow events at entry point
    if (event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      devLog(
        '[useKeyboard] META+ARROW at entry, key:',
        event.key,
        'hasClass:',
        document.body.classList.contains('core-box')
      )
    }

    if (!document.body.classList.contains('core-box')) {
      return
    }

    if (isBlockedFunctionKey(event)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    // Before every Enter consumer below: the result list, a custom widget and a plugin view.
    if (swallowForeignEnterRepeat(event)) {
      return
    }

    // Check if in UI mode - input is hidden only when webcontent view is attached AND input is not allowed
    const uiMode = isInUIMode()
    const inputAllowed = Boolean(activeActivations.value?.some((a) => a?.showInput === true))
    const inputHidden = uiMode && !inputAllowed
    const isDivisionBoxHost = document.body.classList.contains('division-box')

    // Command/Ctrl+K: Open MetaOverlay action panel (should work even in UI mode)
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === 'k' || event.key === 'K')
    ) {
      const currentItem = resolveQuickActionsItem(
        res.value,
        boxOptions.focus,
        activeActivations.value
      )
      if (!currentItem) {
        event.preventDefault()
        return
      }

      transport
        .send(
          MetaOverlayEvents.ui.show,
          buildCoreBoxMetaShowRequest(currentItem, {
            footerShown: !uiMode && isCoreBoxFooterShown()
          })
        )
        .catch((error) => {
          coreBoxKeyboardLog.error('Failed to open MetaOverlay:', error)
        })

      event.preventDefault()
      return
    }

    // Debug: log ⌘← events
    if (event.metaKey && event.key === 'ArrowLeft') {
      devLog(
        '[useKeyboard] ⌘← after class check, uiMode:',
        uiMode,
        'shouldForward:',
        shouldForwardKey(event, inputHidden)
      )
    }

    // ⌘/Ctrl+←/→ stay reserved for the CoreBox calculation-history panel while results are on
    // screen (`shouldForwardKey` blocks them), but an attached plugin view owns the surface: it
    // advertises these keys for its own category/step navigation, and there are no results to
    // browse. Without this the key died in the host input and never reached the plugin view,
    // which is a separate webContents with its own keydown listener.
    //
    // A detached DivisionBox window is the same situation without CoreBox's activations: its
    // plugin view is attached by the division-box session (the core-box module adds the
    // `division-box` body class), and the main process routes the forwarded key to that session.
    if (
      (uiMode || isDivisionBoxHost) &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault()
      forwardToUIView(event)
      return
    }

    // A detached DivisionBox has no CoreBox activation record, but its hosted plugin still owns
    // navigation and action keys. Keep text-editing shortcuts in the visible header input while
    // forwarding Enter/Cmd+Enter and the other plugin keys selected by the shared policy.
    if ((uiMode || isDivisionBoxHost) && shouldForwardKey(event, inputHidden)) {
      forwardToUIView(event)
      event.preventDefault()
      return
    }

    const focusedItem = res.value[boxOptions.focus]
    if (!uiMode && shouldSubmitActivePluginFeature(event)) {
      handleExecute(getActivePluginFeatureItem())
      event.preventDefault()
      return
    }

    if (!uiMode && shouldForwardToCustomWidget(event, focusedItem)) {
      publishWidgetHostKeyEvent(focusedItem!.id, serializeKeyEvent(event))
      event.preventDefault()
      return
    }

    // Action shortcuts (⌘⇧C, ⌘⌥C, ⌘O, ⌘., ⌘↵ …) run on the selected result without opening the
    // panel. After the plugin-view and widget forwarding above, so a hosted view keeps its keys.
    if (!uiMode && !isDivisionBoxHost && runResultListActionShortcut(event)) {
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      // In UI mode with visible input, keep native paste for CoreBox input.
      if (uiMode && !inputHidden) {
        return
      }
      handlePaste({ overrideDismissed: true })
      event.preventDefault()
      return
    }

    // Skip CoreBox's own navigation when in UI mode (already forwarded)
    if (uiMode && FORWARD_KEYS.has(event.key)) {
      return
    }

    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const key = event.key
      const index = key === '0' ? 9 : Number.parseInt(key, 10) - 1
      if (!Number.isNaN(index) && index >= 0 && index < 10) {
        if (res.value[index]) {
          boxOptions.focus = index
          event.preventDefault()
        }
      }
    }

    if (event.key === 'Enter') {
      if (event.isComposing || event.keyCode === 229) {
        return
      }
      select.value = boxOptions.focus
      const target = res.value[boxOptions.focus]

      handleExecute(target)
    } else if (event.key === 'ArrowDown') {
      const isGrid = boxOptions.layout?.mode === 'grid'
      const cols = resolveVisibleGridColumns(boxOptions)
      const sections = boxOptions.layout?.sections

      if (isGrid && sections && sections.length > 0) {
        // Section-aware grid navigation uses the same visible column count as BoxGrid.
        const nextIndex = navigateGridDown(boxOptions.focus, cols, sections, res.value.length)
        boxOptions.focus = nextIndex
      } else {
        const step = isGrid ? cols : 1
        const nextIndex = boxOptions.focus + step

        if (nextIndex < res.value.length) {
          boxOptions.focus = nextIndex
        } else if (res.value.length <= 20) {
          boxOptions.focus = isGrid ? boxOptions.focus % cols : 0
        }
      }
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      const isGrid = boxOptions.layout?.mode === 'grid'
      const cols = resolveVisibleGridColumns(boxOptions)
      const sections = boxOptions.layout?.sections

      if (isGrid && sections && sections.length > 0) {
        // Section-aware grid navigation uses the same visible column count as BoxGrid.
        const prevIndex = navigateGridUp(boxOptions.focus, cols, sections)
        boxOptions.focus = prevIndex
      } else {
        const step = isGrid ? cols : 1
        const prevIndex = boxOptions.focus - step

        if (prevIndex >= 0) {
          boxOptions.focus = prevIndex
        } else if (res.value.length <= 20) {
          const lastRowStart = Math.floor((res.value.length - 1) / cols) * cols
          const targetCol = boxOptions.focus % cols
          const targetIndex = Math.min(lastRowStart + targetCol, res.value.length - 1)
          boxOptions.focus = isGrid ? targetIndex : res.value.length - 1
        }
      }
      event.preventDefault()
    } else if (event.key === 'ArrowLeft') {
      // Meta+Left: show calculation history (check first to ensure it works in all modes)
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        devLog('[useKeyboard] Dispatching corebox:show-calculation-history event')
        window.dispatchEvent(new CustomEvent('corebox:show-calculation-history'))
        event.preventDefault()
        return
      }
      const isGrid = boxOptions.layout?.mode === 'grid'
      // Grid mode: move left
      if (isGrid) {
        if (boxOptions.focus > 0) {
          boxOptions.focus -= 1
        }
        event.preventDefault()
        return
      }
    } else if (event.key === 'ArrowRight') {
      const isGrid = boxOptions.layout?.mode === 'grid'
      // Grid mode: move right
      if (isGrid && !event.metaKey) {
        if (boxOptions.focus < res.value.length - 1) {
          boxOptions.focus += 1
        }
        event.preventDefault()
        return
      }
      // Meta+Right: hide calculation history
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        if (window.__coreboxHistoryVisible) {
          window.dispatchEvent(new CustomEvent('corebox:hide-calculation-history'))
          event.preventDefault()
          return
        }
      }
    } else if (event.key === 'Tab') {
      if (res.value[boxOptions.focus]) {
        const completion =
          res.value[boxOptions.focus].render.completion ??
          res.value[boxOptions.focus].render.basic?.title ??
          ''
        searchVal.value = completion

        if (inputEl.value) {
          requestAnimationFrame(() => {
            inputEl.value!.setSelectionRange(completion.length, completion.length)
          })
        }
      }
      event.preventDefault()
    } else if (event.key === 'd' || event.key === 'D') {
      /**
       * Command/Ctrl+D: Detach current item to DivisionBox
       *
       * This allows users to "pop out" the currently focused item into
       * an independent DivisionBox window for persistent access.
       *
       * With Shift: Opens Flow selector to transfer data to another plugin
       */
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (event.repeat) {
          event.preventDefault()
          return
        }

        const activeFeature = resolveActiveFeatureItem(activeActivations.value)
        const currentItem = activeFeature ?? res.value[boxOptions.focus]

        if (event.shiftKey) {
          if (!currentItem) {
            event.preventDefault()
            return
          }
          // Command+Shift+D: Flow transfer to another plugin
          window.dispatchEvent(
            new CustomEvent('corebox:flow-item', {
              detail: { item: currentItem, query: searchVal.value }
            })
          )
        } else {
          // Command+D: Detach to DivisionBox
          if (!activeFeature) {
            event.preventDefault()
            return
          }
          window.dispatchEvent(
            new CustomEvent(COREBOX_DETACH_EVENT, {
              detail: { item: activeFeature, query: searchVal.value }
            })
          )
        }
        event.preventDefault()
        return
      }
    } else if (event.key === 'Escape') {
      /**
       * ESC key strict sequential handling (UPDATED):
       * 1. Close MetaOverlay if visible
       * 2. Clear clipboard/file attachments
       * 3. Deactivate active providers (attachUIView)
       * 4. Clear input query
       * 5. Handle mode transitions
       * 6. Hide CoreBox window
       */

      await handleCoreBoxEscapeKey({
        event,
        isMetaOverlayVisible: async () => {
          const response = await transport.send(MetaOverlayEvents.ui.isVisible)
          return response?.visible === true
        },
        hideMetaOverlay: () => transport.send(MetaOverlayEvents.ui.hide),
        boxOptions,
        clipboardOptions,
        clearClipboard,
        activeCount: activeActivations.value?.length ?? 0,
        handleExit,
        searchVal
      })
    }

    if (boxOptions.focus < 0) {
      boxOptions.focus = 0
    } else if (boxOptions.focus > res.value.length - 1) {
      boxOptions.focus = res.value.length - 1
    }

    scrollActiveItemIntoView()
  }

  /**
   * Bring the focused row or tile into the scroll viewport, above the sticky footer. Runs after
   * every handled key, and CoreBox calls it again when the grid re-wraps: the preview pane
   * squeezing the row can push the item just selected below the fold after the key was handled.
   */
  function scrollActiveItemIntoView(): void {
    requestAnimationFrame(() => {
      if (boxOptions.focus < 0 || boxOptions.focus >= itemRefs.value.length) {
        return
      }

      const activeItemComponent = itemRefs.value[boxOptions.focus]
      if (!activeItemComponent) {
        return
      }

      const activeEl =
        activeItemComponent instanceof HTMLElement ? activeItemComponent : activeItemComponent.$el
      if (!activeEl) {
        return
      }
      const sb = scrollbar.value

      if (activeEl && sb) {
        const scrollInfo = sb.getScrollInfo()
        const scrollTop = scrollInfo.scrollTop
        const viewport = getScrollViewport(activeEl)
        const viewportRect = viewport?.getBoundingClientRect()
        const itemRect = activeEl.getBoundingClientRect()

        const containerHeight = viewportRect?.height ?? scrollInfo.clientHeight
        const footerInset = getFooterInset()
        const effectiveHeight = Math.max(1, containerHeight - footerInset)

        const itemTop = viewportRect
          ? itemRect.top - viewportRect.top
          : activeEl.offsetTop - scrollTop
        const itemBottom = viewportRect
          ? itemRect.bottom - viewportRect.top
          : activeEl.offsetTop + activeEl.offsetHeight - scrollTop

        if (itemTop < 0) {
          sb.scrollTo(0, Math.max(0, scrollTop + itemTop))
        } else if (itemBottom > effectiveHeight) {
          sb.scrollTo(0, Math.max(0, scrollTop + itemBottom - effectiveHeight))
        }
      }
    })
  }

  /**
   * Use capture phase (true) to ensure keyboard events are handled
   * before input element's event handlers. This fixes the issue where
   * keyboard events don't reach the global handler when input has focus.
   *
   * Event propagation phases:
   * 1. Capture phase (document → input) - WE LISTEN HERE
   * 2. Target phase (input itself)
   * 3. Bubble phase (input → document)
   */
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', forgetEnterPress)
  window.addEventListener('focus', forgetEnterPress)

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', forgetEnterPress)
    window.removeEventListener('focus', forgetEnterPress)
  })

  return { scrollActiveItemIntoView }
}
