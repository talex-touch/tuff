<script setup lang="ts" name="CoreBox">
// import EmptySearchStatus from '~/assets/svg/EmptySearchStatus.svg'
import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import type { CalculationHistoryEntry } from '~/components/render/custom/PreviewHistoryPanel.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TouchScroll from '~/components/base/TouchScroll.vue'

import TuffIcon from '~/components/base/TuffIcon.vue'
import TuffItemAddon from '~/components/render/addon/TuffItemAddon.vue'
import CoreBoxFooter from '~/components/render/CoreBoxFooter.vue'
import BoxGrid from '~/components/render/BoxGrid.vue'
import CoreBoxRender from '~/components/render/CoreBoxRender.vue'
import PreviewHistoryPanel from '~/components/render/custom/PreviewHistoryPanel.vue'
import FlowSelector from '~/components/flow/FlowSelector.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '../../modules/box/adapter'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'
import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
import { useFocus } from '../../modules/box/adapter/hooks/useFocus'
import { useKeyboard } from '../../modules/box/adapter/hooks/useKeyboard'
import { useSearch } from '../../modules/box/adapter/hooks/useSearch'
import { useVisibility } from '../../modules/box/adapter/hooks/useVisibility'
import BoxInput from './BoxInput.vue'
import PrefixPart from './PrefixPart.vue'
import TagSection from './tag/TagSection.vue'

declare global {
  interface Window {
    __coreboxHistoryVisible?: boolean
  }
}

const scrollbar = ref()
const boxInputRef = ref()
const boxOptions = reactive<IBoxOptions>({
  lastHidden: -1,
  mode: BoxMode.INPUT,
  focus: 0,
  file: { buffer: null, paths: [] },
  data: {},
  layout: undefined
})

// Create shared clipboard state
const clipboardOptions = reactive<any>({
  last: null,
  detectedAt: null,
  lastClearedTimestamp: null
})

const { t } = useI18n()

const {
  searchVal,
  select,
  res,
  activeItem,
  activeActivations,
  handleExecute,
  handleExit,
  handleSearchImmediate,
  deactivateProvider,
  deactivateAllProviders
  // cancelSearch
} = useSearch(boxOptions, clipboardOptions)

function handleClipboardChange() {
  // Force immediate search when clipboard changes (paste or clear)
  handleSearchImmediate()
}

const {
  handlePaste,
  handleAutoFill,
  clearClipboard,
  resetAutoPasteState,
  cleanup: cleanupClipboard
} = useClipboard(boxOptions, clipboardOptions, handleClipboardChange, searchVal)

const completionDisplay = computed(() => {
  if (
    !searchVal.value.trim() ||
    !activeItem.value ||
    boxOptions.mode === BoxMode.FEATURE ||
    !activeItem.value.render
  ) {
    return ''
  }

  const completion =
    activeItem.value.render.completion ?? activeItem.value.render.basic?.title ?? ''

  if (completion.startsWith(searchVal.value)) {
    return completion.substring(searchVal.value.length)
  }

  return completion
})


const { cleanup: cleanupVisibility } = useVisibility({
  boxOptions,
  searchVal,
  clipboardOptions,
  handleAutoFill,
  handlePaste,
  boxInputRef,
  deactivateAllProviders
})
const itemRefs = ref<HTMLElement[]>([])

// Track result batch changes for animation
const resultBatchKey = ref(0)
const renderedItemIds = ref<Set<string>>(new Set())
const newItemIds = ref<Set<string>>(new Set())
let lastResultIds: Set<string> = new Set()

/**
 * Compute eased stagger delay for item animation
 * Front items enter quickly, later items have progressively longer delays
 */
function getStaggerDelay(index: number, total: number): number {
  const baseDelay = 0.025 // 25ms base
  const maxDelay = 0.055 // 55ms max per item
  // Ease-in curve: delay increases as index grows
  const progress = total > 1 ? index / (total - 1) : 0
  const eased = progress * progress // quadratic ease-in
  const delay = baseDelay + eased * (maxDelay - baseDelay)
  return index * delay
}

/**
 * Compute overlap ratio between two ID sets
 */
function computeOverlapRatio(oldIds: Set<string>, newIds: Set<string>): number {
  if (oldIds.size === 0 && newIds.size === 0) return 1
  if (oldIds.size === 0 || newIds.size === 0) return 0
  let overlap = 0
  for (const id of newIds) {
    if (oldIds.has(id)) overlap++
  }
  return overlap / Math.max(oldIds.size, newIds.size)
}

watch(res, (newRes) => {
  itemRefs.value = []
  const currentIds = new Set(newRes.map((item) => item.id))
  const overlapRatio = computeOverlapRatio(lastResultIds, currentIds)

  // Determine if this is a major change (< 30% overlap) or incremental update
  const isMajorChange = overlapRatio < 0.3 && lastResultIds.size > 0
  const isFromEmpty = lastResultIds.size === 0 && currentIds.size > 0

  if (isMajorChange) {
    // Major change (different results): trigger container transition + staggered items
    resultBatchKey.value++
    renderedItemIds.value = new Set(currentIds)
    newItemIds.value = new Set()
  } else if (isFromEmpty) {
    // From empty: all items are new, animate them with stagger
    renderedItemIds.value = new Set(currentIds)
    newItemIds.value = new Set(currentIds)
    // Clear flags after animation
    setTimeout(() => {
      newItemIds.value = new Set()
    }, 500)
  } else {
    // Incremental update: only animate new items
    const newIds = new Set<string>()
    for (const id of currentIds) {
      if (!renderedItemIds.value.has(id)) {
        newIds.add(id)
        renderedItemIds.value.add(id)
      }
    }
    newItemIds.value = newIds

    // Clear new item flags after animation completes
    if (newIds.size > 0) {
      setTimeout(() => {
        newItemIds.value = new Set()
      }, 320)
    }

    // Clean up removed items from renderedItemIds
    for (const id of renderedItemIds.value) {
      if (!currentIds.has(id)) {
        renderedItemIds.value.delete(id)
      }
    }
  }

  lastResultIds = currentIds
})

function setItemRef(el: any, index: number) {
  if (el) {
    itemRefs.value[index] = el
  }
}

useKeyboard(
  boxOptions,
  res,
  select,
  scrollbar,
  searchVal,
  handleExecute,
  handleExit,
  computed(() => boxInputRef.value?.inputEl),
  clipboardOptions,
  clearClipboard,
  activeActivations,
  handlePaste,
  itemRefs
)
useChannel(boxOptions, res, searchVal)

const historyPanelRef = ref<InstanceType<typeof PreviewHistoryPanel> | null>(null)
const historyActiveIndex = ref(-1)

const previewHistory = reactive<{
  visible: boolean
  loading: boolean
  items: CalculationHistoryEntry[]
}>({
  visible: false,
  loading: false,
  items: []
})

function broadcastHistoryVisibility(visible: boolean): void {
  window.__coreboxHistoryVisible = visible
  window.dispatchEvent(
    new CustomEvent('corebox:history-visibility-change', {
      detail: { visible }
    })
  )
}

function ensureHistorySelection(preferStart = false): void {
  if (!previewHistory.visible || !previewHistory.items.length) {
    historyActiveIndex.value = -1
    return
  }

  if (preferStart || historyActiveIndex.value < 0) {
    historyActiveIndex.value = 0
    return
  }

  if (historyActiveIndex.value > previewHistory.items.length - 1) {
    historyActiveIndex.value = previewHistory.items.length - 1
  }
}

watch(
  () => previewHistory.visible,
  (visible) => {
    broadcastHistoryVisibility(visible)
    if (!visible) {
      historyActiveIndex.value = -1
    } else {
      ensureHistorySelection(true)
    }
  },
  { immediate: true }
)

watch(
  () => previewHistory.items.length,
  () => {
    ensureHistorySelection()
  }
)

const { focusWindowAndInput, focusInput } = useFocus({ boxInputRef })

function focusMainInput(): void {
  focusInput()
}

function handleFocusInputEvent(): void {
  focusMainInput()
}

async function loadPreviewHistory(): Promise<void> {
  previewHistory.loading = true
  try {
    const response = await touchChannel.send('clipboard:query', {
      category: 'preview',
      limit: 20
    })
    previewHistory.items = response?.data ?? []
    ensureHistorySelection()
  } catch (error) {
    console.error('[CoreBox] Failed to load calculation history:', error)
    toast.error('加载最近处理失败')
  } finally {
    previewHistory.loading = false
  }
}

function openPreviewHistory(): void {
  if (!previewHistory.visible) {
    previewHistory.visible = true
  }
  void loadPreviewHistory()
}

function shrinkPreviewHistory(options?: { focusInput?: boolean }): void {
  if (!previewHistory.visible) return
  previewHistory.visible = false
  historyActiveIndex.value = -1
  if (options?.focusInput ?? true) {
    focusMainInput()
  }
}

function applyPreviewHistory(entry: CalculationHistoryEntry): void {
  const expression = entry.meta?.expression ?? entry.meta?.payload?.title ?? entry.content ?? ''
  if (!expression) return
  searchVal.value = expression
  shrinkPreviewHistory({ focusInput: false })
  focusMainInput()
}

function applyHistorySelection(): void {
  if (historyActiveIndex.value < 0) return
  const entry = previewHistory.items[historyActiveIndex.value]
  if (entry) {
    applyPreviewHistory(entry)
  }
}

function handleHistoryEvent(): void {
  openPreviewHistory()
}

function handleHistoryHideEvent(): void {
  shrinkPreviewHistory()
}

function handleCopyPreviewEvent(event: Event): void {
  const detail = (event as CustomEvent<{ value: string }>).detail
  const value = detail?.value
  if (!value) return
  touchChannel
    .send('clipboard:write-text', { text: value })
    .then(() => {
      toast.success('结果已复制')
    })
    .catch((error) => {
      console.error('[CoreBox] Failed to copy preview result:', error)
      toast.error('复制失败')
    })
}

function isClickInsideHistory(target: EventTarget | null): boolean {
  const el = historyPanelRef.value?.$el as HTMLElement | undefined
  return !!(el && target instanceof Node && el.contains(target))
}

function handleGlobalMouseDown(event: MouseEvent): void {
  if (event.button !== 0 || !previewHistory.visible) return
  if (!document.body.classList.contains('core-box')) return
  if (isClickInsideHistory(event.target)) return
  shrinkPreviewHistory()
}

function handleHistoryKeydown(event: KeyboardEvent): void {
  if (!previewHistory.visible) return
  if (!document.body.classList.contains('core-box')) return

  const key = event.key
  if (key === 'Escape') {
    shrinkPreviewHistory()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (key === 'ArrowDown') {
    if (previewHistory.items.length) {
      if (historyActiveIndex.value < 0) {
        historyActiveIndex.value = 0
      } else if (historyActiveIndex.value < previewHistory.items.length - 1) {
        historyActiveIndex.value += 1
      }
    }
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (key === 'ArrowUp') {
    if (previewHistory.items.length) {
      if (historyActiveIndex.value === -1) {
        historyActiveIndex.value = previewHistory.items.length - 1
      } else if (historyActiveIndex.value > 0) {
        historyActiveIndex.value -= 1
      }
    }
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (key === 'Enter') {
    if (historyActiveIndex.value >= 0) {
      applyHistorySelection()
      event.preventDefault()
      event.stopPropagation()
    }
  }
}

function handleHistoryContextMenu(event: MouseEvent): void {
  if (!document.body.classList.contains('core-box')) return
  if (previewHistory.visible) return
  event.preventDefault()
  openPreviewHistory()
}

// Handle UI mode exit event from main process (ESC pressed in plugin UI view)
const unregUIModeExited = touchChannel.regChannel('core-box:ui-mode-exited', () => {
  console.debug('[CoreBox] UI mode exited from main process, deactivating providers')
  deactivateAllProviders().catch((error) => {
    console.error('[CoreBox] Failed to deactivate providers on UI mode exit:', error)
  })
})

// Handle global shortcut: Detach to DivisionBox (Command+D)
const unregDetachShortcut = touchChannel.regChannel('flow:trigger-detach', () => {
  const currentItem = res.value[boxOptions.focus]
  if (currentItem) {
    handleDetachItem(new CustomEvent('corebox:detach-item', {
      detail: { item: currentItem, query: searchVal.value }
    }))
  }
})

// Handle global shortcut: Flow Transfer (Command+Shift+D)
const unregFlowShortcut = touchChannel.regChannel('flow:trigger-transfer', () => {
  const currentItem = res.value[boxOptions.focus]
  if (currentItem) {
    handleFlowItem(new CustomEvent('corebox:flow-item', {
      detail: { item: currentItem, query: searchVal.value }
    }))
  }
})

/**
 * Handle Command+D: Detach item to DivisionBox
 * Opens the current item in an independent DivisionBox window
 */
async function handleDetachItem(event: Event): Promise<void> {
  const detail = (event as CustomEvent<{ item: TuffItem; query: string }>).detail
  if (!detail?.item) return

  const item = detail.item
  console.log('[CoreBox] Detaching item to DivisionBox:', item.id)

  try {
    // Build DivisionBox config from item
    const config = {
      url: buildDivisionBoxUrl(item, detail.query),
      title: item.render?.basic?.title || 'Detached Item',
      icon: resolveItemIcon(item),
      size: 'medium' as const,
      keepAlive: true,
      pluginId: item.source?.id
    }

    const response = await touchChannel.send('division-box:open', config)
    if (response?.success) {
      toast.success(t('corebox.detached', '已分离到独立窗口'))
    } else {
      throw new Error(response?.error?.message || 'Failed to open DivisionBox')
    }
  } catch (error) {
    console.error('[CoreBox] Failed to detach item:', error)
    toast.error(t('corebox.detachFailed', '分离失败'))
  }
}

// Flow Selector state
const flowSelectorVisible = ref(false)
const flowSelectorPayload = ref<any>(null)
const flowSelectorSessionId = ref<string>('')

/**
 * Handle Command+Shift+D: Flow transfer to another plugin
 * Opens the Flow selector to transfer data to another plugin
 */
async function handleFlowItem(event: Event): Promise<void> {
  const detail = (event as CustomEvent<{ item: TuffItem; query: string }>).detail
  if (!detail?.item) return

  const item = detail.item
  console.log('[CoreBox] Flow transfer item:', item.id)

  try {
    const payload = {
      type: 'json' as const,
      data: {
        item,
        query: detail.query
      },
      context: {
        sourcePluginId: item.source?.id || 'corebox',
        sourceFeatureId: item.meta?.featureId
      }
    }

    // Open Flow selector panel
    flowSelectorPayload.value = payload
    flowSelectorVisible.value = true
  } catch (error) {
    console.error('[CoreBox] Failed to initiate flow:', error)
    toast.error(t('corebox.flowFailed', '流转失败'))
  }
}

/**
 * Handle Flow selector close
 */
function handleFlowSelectorClose(): void {
  flowSelectorVisible.value = false
  flowSelectorPayload.value = null
  flowSelectorSessionId.value = ''
}

/**
 * Handle Flow target selection
 */
async function handleFlowTargetSelect(targetId: string): Promise<void> {
  if (!flowSelectorPayload.value) return

  try {
    const response = await touchChannel.send('flow:dispatch', {
      senderId: 'corebox',
      payload: flowSelectorPayload.value,
      options: {
        preferredTarget: targetId,
        skipSelector: true
      }
    })

    if (response?.success) {
      toast.success(t('corebox.flowSent', '已发送到目标插件'))
    } else {
      throw new Error(response?.error?.message || 'Flow dispatch failed')
    }
  } catch (error) {
    console.error('[CoreBox] Failed to dispatch flow:', error)
    toast.error(t('corebox.flowFailed', '流转失败'))
  } finally {
    handleFlowSelectorClose()
  }
}

/**
 * Build DivisionBox URL from TuffItem
 */
function buildDivisionBoxUrl(item: TuffItem, query: string): string {
  // Plugin items with webcontent interaction
  if (item.meta?.interaction?.type === 'webcontent' && item.meta.interaction.path) {
    const pluginId = item.source?.id
    return `plugin://${pluginId}/${item.meta.interaction.path}`
  }

  // Plugin items with index interaction
  if (item.meta?.interaction?.type === 'index') {
    const pluginId = item.source?.id
    return `plugin://${pluginId}/index.html`
  }

  // URL items
  if (item.kind === 'url' && item.meta?.web?.url) {
    return item.meta.web.url
  }

  // File items - open in preview
  if (item.kind === 'file' && item.meta?.file?.path) {
    return `file://${item.meta.file.path}`
  }

  // Default: use a generic detached view
  const params = new URLSearchParams({
    itemId: item.id,
    query: query || '',
    source: item.source?.id || ''
  })
  return `tuff://detached?${params.toString()}`
}

/**
 * Resolve icon from TuffItem
 */
function resolveItemIcon(item: TuffItem): string | undefined {
  const icon = item.render?.basic?.icon
  if (!icon) return undefined
  if (typeof icon === 'string') return icon
  if (typeof icon === 'object' && 'value' in icon) return icon.value
  return undefined
}

onMounted(() => {
  /**
   * Reset autopaste state on CoreBox open
   * Prevents clipboard items from previous sessions affecting current session
   */
  resetAutoPasteState()

  window.addEventListener('corebox:show-calculation-history', handleHistoryEvent)
  window.addEventListener('corebox:hide-calculation-history', handleHistoryHideEvent)
  window.addEventListener('corebox:copy-preview', handleCopyPreviewEvent)
  window.addEventListener('corebox:focus-input', handleFocusInputEvent)
  window.addEventListener('corebox:detach-item', handleDetachItem)
  window.addEventListener('corebox:flow-item', handleFlowItem)
  window.addEventListener('mousedown', handleGlobalMouseDown)
  window.addEventListener('keydown', handleHistoryKeydown, true)
})

onBeforeUnmount(() => {
  cleanupClipboard()
  cleanupVisibility()
  unregUIModeExited()
  unregDetachShortcut()
  unregFlowShortcut()
  window.removeEventListener('corebox:show-calculation-history', handleHistoryEvent)
  window.removeEventListener('corebox:hide-calculation-history', handleHistoryHideEvent)
  window.removeEventListener('corebox:copy-preview', handleCopyPreviewEvent)
  window.removeEventListener('corebox:focus-input', handleFocusInputEvent)
  window.removeEventListener('corebox:detach-item', handleDetachItem)
  window.removeEventListener('corebox:flow-item', handleFlowItem)
  window.removeEventListener('mousedown', handleGlobalMouseDown)
  window.removeEventListener('keydown', handleHistoryKeydown, true)
})

function handleTogglePin(): void {
  appSetting.tools.autoHide = !appSetting.tools.autoHide
}

function handleItemTrigger(index: number, item: TuffItem): void {
  if (item.kind === 'file') {
    if (boxOptions.focus !== index) {
      boxOptions.focus = index
      return
    }
  }

  handleExecute(item)
}

const addon = computed(() => {
  if (!activeItem.value) return undefined

  const item = activeItem.value

  if (item.kind === 'file') {
    return 'preview'
  }

  return undefined
})

const pinIcon = computed<ITuffIcon>(() => ({
  type: 'class',
  value: appSetting.tools.autoHide ? 'i-ri-pushpin-2-line' : 'i-ri-pushpin-2-fill',
  status: 'normal'
}))

const isGridMode = computed(() => boxOptions.layout?.mode === 'grid')

function handleGridSelect(index: number, item: TuffItem): void {
  handleItemTrigger(index, item)
}

async function handleDeactivateProvider(id?: string): Promise<void> {
  await deactivateProvider(id)
  await focusWindowAndInput()
}
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>

  <div class="CoreBox" @paste="() => handlePaste({ overrideDismissed: true })">
    <PrefixPart
      :providers="activeActivations"
      @close="handleExit"
      @deactivate-provider="handleDeactivateProvider"
    />

    <BoxInput ref="boxInputRef" v-model="searchVal" :box-options="boxOptions">
      <template #completion>
        <div class="text-sm truncate" v-html="completionDisplay" />
      </template>
    </BoxInput>

    <TagSection :box-options="boxOptions" :clipboard-options="clipboardOptions" />

    <div class="CoreBox-Configure">
      <TuffIcon :icon="pinIcon" alt="固定 CoreBox" @click="handleTogglePin" />
    </div>
  </div>

  <div class="CoreBoxRes flex" @contextmenu="handleHistoryContextMenu">
    <div class="CoreBoxRes-Main" :class="{ compressed: !!addon }">
      <TouchScroll ref="scrollbar" no-padding class="scroll-area">
        <Transition name="result-switch" mode="out-in">
          <BoxGrid
            v-if="isGridMode"
            :key="'grid-' + resultBatchKey"
            :items="res"
            :layout="boxOptions.layout"
            :focus="boxOptions.focus"
            @select="handleGridSelect"
          />
          <div v-else :key="'list-' + resultBatchKey" class="item-list">
            <CoreBoxRender
              v-for="(item, index) in res"
              :key="item.id || index"
              :ref="(el) => setItemRef(el, index)"
              :active="boxOptions.focus === index"
              :item="item"
              :index="index"
              :class="{ 'is-new-item': newItemIds.has(item.id) }"
              :style="{
                '--stagger-delay': getStaggerDelay(index, res.length) + 's'
              }"
              @trigger="handleItemTrigger(index, item)"
            />
          </div>
        </Transition>
      </TouchScroll>
      <CoreBoxFooter :display="!!res.length" :item="activeItem" class="CoreBoxFooter-Sticky" />
    </div>
    <TuffItemAddon :type="addon" :item="activeItem" />
    <PreviewHistoryPanel
      ref="historyPanelRef"
      :visible="previewHistory.visible"
      :loading="previewHistory.loading"
      :items="previewHistory.items"
      :active-index="historyActiveIndex"
      @apply="applyPreviewHistory"
    />
  </div>

  <!-- Flow Selector Panel -->
  <FlowSelector
    :visible="flowSelectorVisible"
    :session-id="flowSelectorSessionId"
    :payload="flowSelectorPayload"
    @close="handleFlowSelectorClose"
    @select="handleFlowTargetSelect"
  />
</template>

<style lang="scss">
.core-box {
  .CoreBoxRes {
    display: flex !important;
  }
}

.CoreBox-Configure {
  display: flex;
  padding: 0 0.5rem;

  cursor: pointer;
  font-size: 1.25em;

  .cancel-button {
    color: var(--el-color-danger);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.6;
    }
  }
}

div.CoreBoxRes {
  position: absolute;
  display: none;

  flex-direction: row;

  top: 60px;

  width: 100%;
  height: calc(100% - 60px);

  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--el-border-color);

  .core-box & {
    display: flex;
  }

  .CoreBoxRes-Main {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    transition: width 0.3s ease;
  }

  .CoreBoxRes-Main.compressed {
    width: 40%;
  }

  .scroll-area {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;

    padding-bottom: 44px;
  }
}


.CoreBoxFooter-Sticky {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

.CoreBoxRes-Main > .scroll-area .item-list {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.CoreBoxRes-Main > .scroll-area .item-list > .CoreBoxRender:last-child {
  margin-bottom: 40px;
}

// Result switch animation (list <-> grid, or new results)
.result-switch-enter-active {
  animation: result-enter 0.28s ease-out;
  animation-fill-mode: both;
}

.result-switch-leave-active {
  animation: result-leave 0.15s ease-in;
  animation-fill-mode: both;
}

@keyframes result-enter {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes result-leave {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-6px);
  }
}

// No animation by default for existing items
.item-list > .CoreBoxRender {
  animation: none;
}

// Animation for new items (both initial load and incremental updates)
.item-list > .CoreBoxRender.is-new-item {
  animation: item-stagger-in 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
  animation-fill-mode: both;
  animation-delay: var(--stagger-delay, 0s);
}

@keyframes item-stagger-in {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  70% {
    opacity: 1;
    transform: translateY(-2px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

div.CoreBox {
  z-index: 100000000;
  position: absolute;
  padding: 4px 8px;
  display: none;

  width: 100%;
  height: 64px;

  left: 0;
  top: 0;

  gap: 0.25rem;
  align-items: center;

  border-radius: 8px;
  box-sizing: border-box;

  .core-box & {
    display: flex;
  }
}

.core-box .AppLayout-Wrapper {
  visibility: hidden;
}

.core-box .CoreBox-Mask {
  z-index: -100;
  position: absolute;

  inset: 0;

  opacity: 0.75;
  background-color: var(--el-fill-color);
}
</style>
