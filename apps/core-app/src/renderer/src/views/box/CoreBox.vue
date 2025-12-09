<script setup lang="ts" name="CoreBox">
// import EmptySearchStatus from '~/assets/svg/EmptySearchStatus.svg'
import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import TouchScroll from '~/components/base/TouchScroll.vue'

import TuffIcon from '~/components/base/TuffIcon.vue'
import TuffItemAddon from '~/components/render/addon/TuffItemAddon.vue'
import CoreBoxFooter from '~/components/render/CoreBoxFooter.vue'
import BoxGrid from '~/components/render/BoxGrid.vue'
import CoreBoxRender from '~/components/render/CoreBoxRender.vue'
import PreviewHistoryPanel from '~/components/render/custom/PreviewHistoryPanel.vue'
import FlowSelector from '~/components/flow/FlowSelector.vue'
import ActionPanel from '~/components/render/ActionPanel.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '../../modules/box/adapter'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'
import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
import { useFocus } from '../../modules/box/adapter/hooks/useFocus'
import { useKeyboard } from '../../modules/box/adapter/hooks/useKeyboard'
import { useSearch } from '../../modules/box/adapter/hooks/useSearch'
import { useVisibility } from '../../modules/box/adapter/hooks/useVisibility'
import { usePreviewHistory } from '../../modules/box/adapter/hooks/usePreviewHistory'
import { useActionPanel } from '../../modules/box/adapter/hooks/useActionPanel'
import { useDetach } from '../../modules/box/adapter/hooks/useDetach'
import { windowState, isDivisionBoxMode } from '~/modules/hooks/core-box'
import BoxInput from './BoxInput.vue'
import PrefixPart from './PrefixPart.vue'
import TagSection from './tag/TagSection.vue'
import DivisionBoxHeader from './DivisionBoxHeader.vue'

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

// Check if CoreBox is in UI mode (plugin webcontent view attached)
const isUIMode = computed(() => {
  return activeActivations.value && activeActivations.value.length > 0
})

// DivisionBox mode computed properties
const isDivisionBox = computed(() => {
  const result = isDivisionBoxMode()
  console.log(
    '[CoreBox] isDivisionBox computed:',
    result,
    'windowState:',
    windowState.type,
    windowState.divisionBox?.sessionId
  )
  return result
})
const divisionBoxConfig = computed(() => windowState.divisionBox?.config)
const divisionBoxMeta = computed(() => windowState.divisionBox?.meta)

// UI visibility based on DivisionBox config
// In DivisionBox mode, wait for config to arrive before showing input
const showInput = computed(() => {
  if (!isDivisionBox.value) return true
  // Wait for config to arrive in DivisionBox mode
  if (!divisionBoxConfig.value) return false
  return divisionBoxConfig.value.ui?.showInput !== false
})

const _showResults = computed(() => {
  if (!isDivisionBox.value) return true
  return divisionBoxConfig.value?.ui?.showResults !== false
})

const inputPlaceholder = computed(() => {
  if (isDivisionBox.value && divisionBoxConfig.value?.ui?.inputPlaceholder) {
    return divisionBoxConfig.value.ui.inputPlaceholder
  }
  return undefined
})

// In DivisionBox mode, create a provider from the session meta
const divisionBoxProviders = computed(() => {
  if (!isDivisionBox.value || !divisionBoxMeta.value) return []
  
  const meta = divisionBoxMeta.value
  const iconValue = meta.icon
  
  // Build icon object - handle string or object formats
  let icon: { type: string; value: string } | undefined
  if (iconValue) {
    if (typeof iconValue === 'string') {
      icon = { type: 'class', value: iconValue }
    } else if (typeof iconValue === 'object' && 'value' in iconValue) {
      icon = iconValue as { type: string; value: string }
    }
  }
  // Default icon if none provided
  if (!icon) {
    icon = { type: 'class', value: 'i-carbon-application' }
  }
  
  return [{
    id: meta.pluginId || 'division-box',
    name: meta.title || 'DivisionBox',
    icon
  }]
})

// Merge activeActivations with divisionBoxProviders
const effectiveProviders = computed(() => {
  if (isDivisionBox.value) {
    return divisionBoxProviders.value
  }
  return activeActivations.value
})

// Initial input from DivisionBox config (reserved for future use)
const _initialInput = computed(() => {
  return divisionBoxConfig.value?.ui?.initialInput ?? ''
})

// DivisionBox header ref
const divisionBoxHeaderRef = ref()

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

const { focusWindowAndInput, focusInput } = useFocus({ boxInputRef })

// Preview History hook
const historyPanelRef = ref<InstanceType<typeof PreviewHistoryPanel> | null>(null)
const previewHistory = usePreviewHistory({
  searchVal,
  focusInput,
  panelRef: historyPanelRef
})

// Handle UI mode exit event from main process (ESC pressed in plugin UI view)
const unregUIModeExited = touchChannel.regChannel('core-box:ui-mode-exited', () => {
  console.debug('[CoreBox] UI mode exited from main process, deactivating providers')
  deactivateAllProviders().catch((error) => {
    console.error('[CoreBox] Failed to deactivate providers on UI mode exit:', error)
  })
  // Focus input after UI mode exits
  setTimeout(() => {
    boxInputRef.value?.focus()
  }, 150)
})

// Detach & Flow hooks
const detach = useDetach({
  searchVal,
  res,
  boxOptions,
  isUIMode,
  activeActivations,
  deactivateProvider
})

// Action Panel hook
const actionPanel = useActionPanel({
  detachItem: detach.detachItem
})

// Channel: focus input
const unregFocusInput = touchChannel.regChannel('corebox:focus-input', () => focusInput())

onMounted(() => {
  resetAutoPasteState()
})

onBeforeUnmount(() => {
  cleanupClipboard()
  cleanupVisibility()
  unregUIModeExited()
  unregFocusInput()
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
    <!-- DivisionBox Mode Header -->
    <template v-if="isDivisionBox">
      <DivisionBoxHeader
        ref="divisionBoxHeaderRef"
        v-model:search-val="searchVal"
        :box-options="boxOptions"
        :show-input="showInput"
        :placeholder="inputPlaceholder"
        :providers="effectiveProviders"
        @deactivate-provider="handleDeactivateProvider"
      />
    </template>

    <!-- MainBox Mode Header -->
    <template v-else>
      <PrefixPart
        :providers="activeActivations"
        @close="handleExit"
        @deactivate-provider="handleDeactivateProvider"
      />

      <BoxInput
        ref="boxInputRef"
        v-model="searchVal"
        :box-options="boxOptions"
        :class="{ 'ui-mode-hidden': isUIMode }"
        :disabled="isUIMode"
      >
        <template #completion>
          <div class="text-sm truncate" v-html="completionDisplay" />
        </template>
      </BoxInput>

      <TagSection
        v-if="!isUIMode"
        :box-options="boxOptions"
        :clipboard-options="clipboardOptions"
      />

      <div class="CoreBox-Configure">
        <TuffIcon :icon="pinIcon" alt="固定 CoreBox" @click="handleTogglePin" />
      </div>
    </template>
  </div>

  <div class="CoreBoxRes flex" @contextmenu="previewHistory.handleContextMenu">
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
      <CoreBoxFooter
        :display="!!res.length"
        :item="activeItem"
        :active-activations="activeActivations"
        :result-count="res.length"
        :is-recommendation="!searchVal && !activeActivations?.length"
        class="CoreBoxFooter-Sticky"
      />
    </div>
    <TuffItemAddon :type="addon" :item="activeItem" />
    <PreviewHistoryPanel
      ref="historyPanelRef"
      :visible="previewHistory.visible"
      :loading="previewHistory.loading"
      :items="previewHistory.items"
      :active-index="previewHistory.activeIndex"
      @apply="previewHistory.apply"
    />
  </div>

  <!-- Flow Selector Panel -->
  <FlowSelector
    :visible="detach.flowVisible"
    :session-id="detach.flowSessionId"
    :payload="detach.flowPayload"
    @close="detach.closeFlowSelector"
    @select="detach.dispatchFlow"
  />

  <!-- Action Panel (⌘K) -->
  <ActionPanel
    :visible="actionPanel.visible"
    :item="actionPanel.item"
    :is-pinned="actionPanel.isPinned"
    @close="actionPanel.close"
    @action="actionPanel.handleAction"
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

// Hide input in UI mode but keep layout
.ui-mode-hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}

// DivisionBox specific styles
.division-box {
  // Ensure CoreBox is visible in DivisionBox mode
  div.CoreBox {
    display: flex !important;
    // Remove padding - DivisionBoxHeader handles its own spacing
    padding: 0 !important;

    // Allow window dragging in DivisionBox header area
    -webkit-app-region: drag;

    // Make interactive elements clickable
    .BoxInput,
    .CoreBox-Configure,
    .PrefixPart,
    .DivisionBox-Controls,
    .DivisionBox-Input,
    .ActivatedProvidersContainer {
      -webkit-app-region: no-drag;
    }
  }

  .CoreBoxRes {
    display: flex !important;
  }
}

</style>
