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
import CoreBoxRender from '~/components/render/CoreBoxRender.vue'
import PreviewHistoryPanel from '~/components/render/custom/PreviewHistoryPanel.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '../../modules/box/adapter'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'
import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
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
  data: {}
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
  loading,
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

const shouldShowAiSuggestion = computed(() => {
  if (loading.value) return false
  if (res.value.length > 0) return false
  if (boxOptions.mode !== BoxMode.INPUT && boxOptions.mode !== BoxMode.COMMAND) return false
  if (activeActivations.value && activeActivations.value.length > 0) return false

  const trimmed = searchVal.value.trim()
  if (!trimmed.length) return false
  const lower = trimmed.toLowerCase()
  if (lower === 'ai' || lower.startsWith('ai ')) return false

  return true
})

const aiSuggestionTitle = computed(() => t('coreBox.intelligence.suggestionTitle'))
const aiSuggestionDescription = computed(() => t('coreBox.intelligence.suggestionDesc'))
const aiSuggestionAction = computed(() => t('coreBox.intelligence.suggestionAction'))

function handleAskAiSuggestion(): void {
  const current = searchVal.value.trim()
  const suggestion = current ? `ai ${current}` : 'ai '

  if (searchVal.value !== suggestion) {
    searchVal.value = suggestion
  } else {
    void handleSearchImmediate()
  }

  focusMainInput()
}

useVisibility(
  boxOptions,
  searchVal,
  clipboardOptions,
  handleAutoFill,
  handlePaste,
  clearClipboard,
  boxInputRef,
  deactivateAllProviders
)
const itemRefs = ref<HTMLElement[]>([])

watch(res, () => {
  itemRefs.value = []
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

function focusMainInput(): void {
  boxInputRef.value?.focus?.()
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
  window.addEventListener('mousedown', handleGlobalMouseDown)
  window.addEventListener('keydown', handleHistoryKeydown, true)
})

onBeforeUnmount(() => {
  cleanupClipboard()
  window.removeEventListener('corebox:show-calculation-history', handleHistoryEvent)
  window.removeEventListener('corebox:hide-calculation-history', handleHistoryHideEvent)
  window.removeEventListener('corebox:copy-preview', handleCopyPreviewEvent)
  window.removeEventListener('corebox:focus-input', handleFocusInputEvent)
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
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>

  <div class="CoreBox" @paste="() => handlePaste({ overrideDismissed: true })">
    <PrefixPart
      :providers="activeActivations"
      @close="handleExit"
      @deactivate-provider="deactivateProvider"
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
        <CoreBoxRender
          v-for="(item, index) in res"
          :key="index"
          :ref="(el) => setItemRef(el, index)"
          :active="boxOptions.focus === index"
          :item="item"
          :index="index"
          @trigger="handleItemTrigger(index, item)"
        />
      </TouchScroll>
      <div v-if="shouldShowAiSuggestion" class="CoreBoxRes-Empty CoreBoxRes-AI">
        <div class="AiSuggestion">
          <div class="AiSuggestion-Icon">🤖</div>
          <div class="AiSuggestion-Body">
            <h3 class="AiSuggestion-Title">
              {{ aiSuggestionTitle }}
            </h3>
            <p class="AiSuggestion-Description">
              {{ aiSuggestionDescription }}
            </p>
          </div>
          <button class="AiSuggestion-Action" type="button" @click="handleAskAiSuggestion">
            {{ aiSuggestionAction }}
          </button>
        </div>
      </div>
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

.CoreBoxRes-Empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 24px;
  color: var(--el-text-color-secondary);
  text-align: center;

  .placeholder-graphic {
    width: 120px;
    height: 120px;
    opacity: 0.28;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .subtitle {
    font-size: 12px;
  }
}

.CoreBoxRes-AI {
  background: var(--el-bg-color);
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  padding: 24px;
  color: var(--el-text-color-primary);

  .AiSuggestion {
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: 520px;
  }

  .AiSuggestion-Icon {
    font-size: 36px;
    line-height: 1;
  }

  .AiSuggestion-Body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
  }

  .AiSuggestion-Title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--el-text-color-primary);
  }

  .AiSuggestion-Description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .AiSuggestion-Action {
    border: none;
    background: var(--el-color-primary);
    color: #fff;
    padding: 10px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(79, 70, 229, 0.2);
    }
  }
}

.CoreBoxFooter-Sticky {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

.CoreBoxRes-Main > .scroll-area > .CoreBoxRender:last-child {
  margin-bottom: 40px;
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
