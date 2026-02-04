<script setup lang="ts" name="CoreBox">
// import EmptySearchStatus from '~/assets/svg/EmptySearchStatus.svg'
import type { IProviderActivate, ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { ComponentPublicInstance } from 'vue'
import type { IBoxOptions } from '../../modules/box/adapter'
import type { IClipboardOptions } from '../../modules/box/adapter/hooks/types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import TouchScroll from '~/components/base/TouchScroll.vue'

import TuffIcon from '~/components/base/TuffIcon.vue'
import FlowSelector from '~/components/flow/FlowSelector.vue'
import ActionPanel from '~/components/render/ActionPanel.vue'
import TuffItemAddon from '~/components/render/addon/TuffItemAddon.vue'
import BoxGrid from '~/components/render/BoxGrid.vue'
import CoreBoxFooter from '~/components/render/CoreBoxFooter.vue'
import CoreBoxRender from '~/components/render/CoreBoxRender.vue'
import PreviewHistoryPanel from '~/components/render/custom/PreviewHistoryPanel.vue'
import { appSetting } from '~/modules/channel/storage'
import { isDivisionBoxMode, windowState } from '~/modules/hooks/core-box'
import { useBatteryOptimizer } from '~/modules/hooks/useBatteryOptimizer'
import { sanitizeUserCss } from '~/modules/style/sanitizeUserCss'
import { BoxMode } from '../../modules/box/adapter'
import { useActionPanel } from '../../modules/box/adapter/hooks/useActionPanel'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'
import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
import { useDetach } from '../../modules/box/adapter/hooks/useDetach'
import { useFocus } from '../../modules/box/adapter/hooks/useFocus'
import { useKeyboard } from '../../modules/box/adapter/hooks/useKeyboard'
import { usePreviewHistory } from '../../modules/box/adapter/hooks/usePreviewHistory'
import { useSearch } from '../../modules/box/adapter/hooks/useSearch'
import { useVisibility } from '../../modules/box/adapter/hooks/useVisibility'
import { useCoreBoxTheme } from './theme'
import BoxInput from './BoxInput.vue'
import DivisionBoxHeader from './DivisionBoxHeader.vue'
import PrefixPart from './PrefixPart.vue'
import TagSection from './tag/TagSection.vue'

declare global {
  interface Window {
    __coreboxHistoryVisible?: boolean
  }
}

const scrollbar = ref()
const boxInputRef = ref()
const transport = useTuffTransport()
const focusInputEvent = defineRawEvent<void, void>('corebox:focus-input')
const boxOptions = reactive<IBoxOptions>({
  lastHidden: -1,
  mode: BoxMode.INPUT,
  focus: 0,
  file: { buffer: null, paths: [] },
  data: {},
  layout: undefined
})

// Create shared clipboard state
const clipboardOptions = reactive<IClipboardOptions>({
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

const { lowBatteryMode } = useBatteryOptimizer()

const resultTransitionName = computed(() => {
  const enabled = appSetting.animation?.resultTransition === true
  return enabled && !lowBatteryMode.value ? 'result-switch' : ''
})

function handleClipboardChange() {
  // Force immediate search when clipboard changes (paste or clear)
  handleSearchImmediate()
}

const {
  handlePaste,
  handleAutoFill,
  clearClipboard,
  resetAutoPasteState,
  autoPasteActive,
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

const shouldLog = () => appSetting.diagnostics?.verboseLogs === true
function logDebug(...args: unknown[]) {
  if (!shouldLog()) return
  console.debug(...args)
}

// Check if CoreBox is in UI mode (plugin webcontent view attached)
// Only hide results when hideResults is explicitly true (webcontent mode)
// Push mode features should show results (hideResults: false or undefined)
const isUIMode = computed(() => {
  if (!activeActivations.value?.length) return false
  // Check if any active provider has hideResults: true
  const result = activeActivations.value.some((activation) => activation.hideResults === true)
  logDebug('[CoreBox] isUIMode computed:', {
    activeActivationsCount: activeActivations.value.length,
    activations: activeActivations.value.map((a) => ({ id: a.id, hideResults: a.hideResults })),
    isUIMode: result
  })
  return result
})

// Check if input should be shown when providers are active
// Input should only be hidden/disabled when:
// - A webcontent UI view is attached (hideResults === true)
// - And NO active provider explicitly allows input (showInput === true)
// For push-mode (hideResults === false/undefined), input must remain usable.
const shouldShowInput = computed(() => {
  if (!activeActivations.value?.length) return true

  const isWebcontentMode = activeActivations.value.some((a) => a.hideResults === true)
  if (!isWebcontentMode) return true

  return activeActivations.value.some((a) => a.showInput === true)
})
const activeActivationsList = computed<IProviderActivate[]>(() => activeActivations.value ?? [])

// DivisionBox mode computed properties
const isDivisionBox = computed(() => isDivisionBoxMode())
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

const inputPlaceholder = computed(() => {
  if (isDivisionBox.value && divisionBoxConfig.value?.ui?.inputPlaceholder) {
    return divisionBoxConfig.value.ui.inputPlaceholder
  }
  return undefined
})

// In DivisionBox mode, create a provider from the session meta
const divisionBoxProviders = computed<IProviderActivate[]>(() => {
  if (!isDivisionBox.value || !divisionBoxMeta.value) return []

  const meta = divisionBoxMeta.value
  const iconValue = meta.icon

  let icon: ITuffIcon | undefined
  if (iconValue) {
    if (typeof iconValue === 'string') {
      icon = { type: 'class', value: iconValue }
    } else if (typeof iconValue === 'object' && 'value' in iconValue) {
      icon = {
        type: (iconValue as ITuffIcon).type ?? 'class',
        value: (iconValue as ITuffIcon).value
      }
    }
  }

  if (!icon) {
    icon = { type: 'class', value: 'i-carbon-application' }
  }

  return [
    {
      id: meta.pluginId || 'division-box',
      name: meta.title || 'DivisionBox',
      icon
    }
  ]
})

// Merge activeActivations with divisionBoxProviders
const effectiveProviders = computed<IProviderActivate[]>(() => {
  if (isDivisionBox.value) return divisionBoxProviders.value
  return activeActivationsList.value
})

const { cleanup: cleanupVisibility, checkAutoClear } = useVisibility({
  boxOptions,
  searchVal,
  clipboardOptions,
  handleAutoFill,
  handlePaste,
  boxInputRef,
  deactivateAllProviders
})

const featureModeEnteredAt = ref<number | null>(null)

watch(
  () => boxOptions.mode,
  (mode, prevMode) => {
    if (mode === BoxMode.FEATURE && prevMode !== BoxMode.FEATURE) {
      featureModeEnteredAt.value = Date.now()
      return
    }
    if (prevMode === BoxMode.FEATURE && mode !== BoxMode.FEATURE) {
      if (featureModeEnteredAt.value) {
        checkAutoClear(featureModeEnteredAt.value)
      }
      featureModeEnteredAt.value = null
    }
  }
)

type ItemRef = HTMLElement | ComponentPublicInstance
const itemRefs = ref<ItemRef[]>([])

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

function setItemRef(el: Element | ComponentPublicInstance | null, index: number): void {
  if (!el) return
  if (el instanceof HTMLElement) {
    itemRefs.value[index] = el
    return
  }
  if ('$el' in el) {
    itemRefs.value[index] = el as ComponentPublicInstance
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
useChannel(boxOptions, searchVal)

const { focusWindowAndInput, focusInput } = useFocus({ boxInputRef })

// Preview History hook
const historyPanelRef = ref<InstanceType<typeof PreviewHistoryPanel> | null>(null)
const previewHistory = usePreviewHistory({
  searchVal,
  focusInput,
  panelRef: historyPanelRef
})

// Handle UI mode exit event from main process (ESC pressed in plugin UI view)
const unregUIModeExited = transport.on(CoreBoxEvents.ui.uiModeExited, (payload) => {
  logDebug('[CoreBox] UI mode exited from main process, deactivating providers')
  deactivateAllProviders().catch((error) => {
    console.error('[CoreBox] Failed to deactivate providers on UI mode exit:', error)
  })

  // Reset input state if requested
  if (payload?.resetInput) {
    boxOptions.mode = BoxMode.INPUT
  }

  setTimeout(() => {
    boxInputRef.value?.focus()
  }, 150)
})

async function deactivateProviderVoid(id?: string): Promise<void> {
  await deactivateProvider(id)
}

// Detach & Flow hooks
const detach = useDetach({
  searchVal,
  res,
  boxOptions,
  isUIMode,
  activeActivations: activeActivationsList,
  deactivateProvider: deactivateProviderVoid
})

// Action Panel hook
const actionPanel = useActionPanel({
  openFlowSelector: detach.openFlowSelector,
  refreshSearch: handleSearchImmediate
})

// Channel: focus input
const unregFocusInput = transport.on(focusInputEvent, () => focusInput())

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

const { themeConfig, themeCSSVars } = useCoreBoxTheme()
const showLogo = computed(() => themeConfig.value.logo.position !== 'hidden')
const logoOrderRight = computed(() => themeConfig.value.logo.position === 'right')
const inputBorderClass = computed(() => `CoreBoxInputBorder-${themeConfig.value.input.border}`)
const inputBgClass = computed(() => `CoreBoxInputBg-${themeConfig.value.input.background}`)
const resultHoverClass = computed(
  () => `CoreBoxResultHover-${themeConfig.value.results.hoverStyle}`
)
const customCss = computed(() => sanitizeUserCss(themeConfig.value.customCSS ?? ''))
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>

  <div
    class="CoreBox-Wrapper"
    :style="themeCSSVars"
    :class="[inputBorderClass, inputBgClass, resultHoverClass]"
  >
    <component :is="'style'" v-if="customCss">{{ customCss }}</component>
    <div class="CoreBox" @paste="() => handlePaste({ overrideDismissed: true })">
      <!-- DivisionBox Mode Header -->
      <template v-if="isDivisionBox">
        <DivisionBoxHeader
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
          v-if="showLogo"
          :class="{ 'CoreBox-LogoRight': logoOrderRight }"
          :providers="activeActivations"
          @close="handleExit"
          @deactivate-provider="handleDeactivateProvider"
        />

        <BoxInput
          ref="boxInputRef"
          v-model="searchVal"
          :box-options="boxOptions"
          :class="{ 'ui-mode-hidden': !shouldShowInput }"
          :disabled="!shouldShowInput"
        >
          <template #completion>
            <div class="text-sm truncate">
              {{ completionDisplay }}
            </div>
          </template>
        </BoxInput>

        <TagSection
          v-if="!isUIMode"
          :box-options="boxOptions"
          :clipboard-options="clipboardOptions"
          :auto-paste-active="autoPasteActive"
        />

        <div class="CoreBox-Configure">
          <TuffIcon :icon="pinIcon" alt="固定 CoreBox" @click="handleTogglePin" />
        </div>
      </template>
    </div>

    <div class="CoreBoxRes flex" @contextmenu="previewHistory.handleContextMenu">
      <!-- Hide result area when plugin UI view is attached -->
      <template v-if="!isUIMode">
        <div class="CoreBoxRes-Main" :class="{ compressed: !!addon }">
          <TouchScroll ref="scrollbar" no-padding class="scroll-area">
            <div class="CoreBoxRes-ScrollContent" :class="{ 'has-footer': !!res.length }">
              <Transition :name="resultTransitionName" mode="out-in">
                <BoxGrid
                  v-if="isGridMode"
                  :key="`grid-${resultBatchKey}`"
                  :items="res"
                  :layout="boxOptions.layout"
                  :focus="boxOptions.focus"
                  @select="handleGridSelect"
                />
                <div v-else :key="`list-${resultBatchKey}`" class="item-list">
                  <CoreBoxRender
                    v-for="(item, index) in res"
                    :key="item.id || index"
                    :ref="(el) => setItemRef(el, index)"
                    :active="boxOptions.focus === index"
                    :item="item"
                    :index="index"
                    :class="{
                      'is-new-item':
                        appSetting.animation?.listItemStagger === true &&
                        !lowBatteryMode &&
                        newItemIds.has(item.id)
                    }"
                    :style="{
                      '--stagger-delay': `${getStaggerDelay(index, res.length)}s`
                    }"
                    @trigger="handleItemTrigger(index, item)"
                  />
                </div>
              </Transition>
            </div>
          </TouchScroll>
          <CoreBoxFooter
            :display="!!res.length"
            :item="activeItem ?? null"
            :active-activations="activeActivations"
            :result-count="res.length"
            :is-recommendation="!searchVal && !activeActivations?.length"
            class="CoreBoxFooter-Sticky"
          />
        </div>
        <TuffItemAddon :type="addon" :item="activeItem" />
      </template>

      <!-- Preview History Panel - Always mounted to listen to events -->
      <PreviewHistoryPanel
        ref="historyPanelRef"
        :visible="previewHistory.visible"
        :loading="previewHistory.loading"
        :items="previewHistory.items"
        :active-index="previewHistory.activeIndex"
        @apply="previewHistory.apply"
      />
    </div>
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
.CoreBox-Wrapper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.CoreBox-Wrapper.CoreBoxInputBorder-bottom .BoxInput-Wrapper input {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.CoreBox-Wrapper.CoreBoxInputBorder-full .BoxInput-Wrapper input {
  border: 1px solid var(--el-border-color-lighter);
}

.CoreBox-Wrapper.CoreBoxInputBorder-none .BoxInput-Wrapper input {
  border: none;
}

.CoreBox-Wrapper.CoreBoxInputBg-transparent .BoxInput-Wrapper input {
  background: transparent;
}

.CoreBox-Wrapper.CoreBoxInputBg-subtle .BoxInput-Wrapper input {
  background: color-mix(in srgb, var(--el-bg-color) 70%, var(--el-fill-color-light));
}

.CoreBox-Wrapper.CoreBoxInputBg-solid .BoxInput-Wrapper input {
  background: var(--el-bg-color);
}

.CoreBox-Wrapper.CoreBoxResultHover-background .BoxItem:hover {
  background: var(--el-fill-color-lighter) !important;
}

.CoreBox-Wrapper.CoreBoxResultHover-border .BoxItem:hover {
  background: transparent !important;
  box-shadow: inset 0 0 0 1px var(--el-border-color) !important;
}

.CoreBox-Wrapper.CoreBoxResultHover-scale .BoxItem:hover {
  transform: scale(1.01);
}

.CoreBox-LogoRight {
  order: 4;
}

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

  top: 64px;

  width: 100%;
  height: calc(100% - 64px);
  overflow: hidden;

  border-radius: 0 0 var(--corebox-container-radius, 8px) var(--corebox-container-radius, 8px);
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
    min-height: 0;
  }
}

.CoreBoxFooter-Sticky {
  z-index: 10;
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

.CoreBoxRes-ScrollContent {
  width: 100%;
}

.CoreBoxRes-ScrollContent.has-footer {
  padding-bottom: 72px;
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

  border-radius: var(--corebox-container-radius, 8px);
  box-shadow: var(--corebox-container-shadow, none);
  border: var(--corebox-container-border, none);
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
