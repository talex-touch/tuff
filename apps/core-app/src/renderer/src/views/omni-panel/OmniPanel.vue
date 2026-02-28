<script setup lang="ts">
import type {
  OmniPanelContextPayload,
  OmniPanelFeatureExecuteResponse,
  OmniPanelFeatureItemPayload,
  OmniPanelFeatureListResponse
} from '../../../../shared/events/omni-panel'
import { CoreBoxOmniPanelKeys } from '@talex-touch/utils/i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import {
  omniPanelContextEvent,
  omniPanelFeatureExecuteEvent,
  omniPanelFeatureListEvent,
  omniPanelFeatureRefreshEvent,
  omniPanelFeatureReorderEvent,
  omniPanelHideEvent
} from '../../../../shared/events/omni-panel'
import OmniPanelActionList from './components/OmniPanelActionList.vue'
import OmniPanelContextCard from './components/OmniPanelContextCard.vue'
import OmniPanelHeader from './components/OmniPanelHeader.vue'
import OmniPanelSearchBar from './components/OmniPanelSearchBar.vue'
import { filterOmniPanelFeatures } from './filter-features'
import { ensureValidFocusIndex, resolveFocusedItem, resolveNextFocusIndex } from './interaction'

const { t } = useI18n()
const transport = useTuffTransport()

const selectedText = ref('')
const hasSelection = ref(false)
const source = ref('manual')
const capturedAt = ref<number | null>(null)
const loading = ref(false)
const executingId = ref<string | null>(null)
const searchKeyword = ref('')
const features = ref<OmniPanelFeatureItemPayload[]>([])
const focusedIndex = ref(-1)
const searchBarRef = ref<InstanceType<typeof OmniPanelSearchBar> | null>(null)
let previousFocusedElement: HTMLElement | null = null

const executeCodeMessageMap: Record<string, string> = {
  FEATURE_UNAVAILABLE: 'corebox.omniPanel.featureUnavailable',
  SELECTION_REQUIRED: 'corebox.omniPanel.selectionRequired',
  COREBOX_UNAVAILABLE: 'corebox.omniPanel.coreboxUnavailable',
  FEATURE_EXECUTION_FAILED: 'corebox.omniPanel.executeFailed',
  INTERNAL_ERROR: 'corebox.omniPanel.executeFailed'
}

const displayText = computed(() => {
  if (hasSelection.value) return selectedText.value
  return t(
    CoreBoxOmniPanelKeys.EMPTY_SELECTION,
    '当前没有捕获到选中文本。先在任意应用中选中文本，再触发全景面板。'
  )
})

const filteredFeatures = computed(() => {
  return filterOmniPanelFeatures(features.value, searchKeyword.value)
})

watch(
  () => filteredFeatures.value.length,
  (length) => {
    focusedIndex.value = ensureValidFocusIndex(focusedIndex.value, length)
  },
  { immediate: true }
)

async function closePanel(): Promise<void> {
  await transport.send(omniPanelHideEvent)
  previousFocusedElement?.focus?.()
}

async function loadFeatures(): Promise<void> {
  loading.value = true
  try {
    const response = await transport.send(omniPanelFeatureListEvent)
    const payload = response as OmniPanelFeatureListResponse
    features.value = Array.isArray(payload?.features) ? payload.features : []
    focusedIndex.value = ensureValidFocusIndex(focusedIndex.value, features.value.length)
  } catch (error) {
    console.error('[OmniPanel] Failed to load features:', error)
    toast.error(t('corebox.omniPanel.loadFailed', '加载 OmniPanel Feature 失败，请稍后重试。'))
  } finally {
    loading.value = false
  }
}

function resolveExecuteErrorMessage(response?: OmniPanelFeatureExecuteResponse): string {
  const fallback = t('corebox.omniPanel.executeFailed', '执行失败，请稍后重试。')
  if (!response) return fallback
  if (response.error) return response.error
  if (response.code && executeCodeMessageMap[response.code]) {
    return t(executeCodeMessageMap[response.code], fallback)
  }
  return fallback
}

async function executeFeature(item: OmniPanelFeatureItemPayload): Promise<void> {
  if (executingId.value) return
  if (item.unavailable) {
    toast.error(
      item.unavailableReason?.message ||
        t('corebox.omniPanel.featureUnavailable', '该 Feature 当前不可用，请检查插件状态。')
    )
    return
  }

  executingId.value = item.id
  try {
    const response = (await transport.send(omniPanelFeatureExecuteEvent, {
      id: item.id,
      contextText: selectedText.value,
      source: source.value,
      context: {
        text: selectedText.value,
        hasSelection: hasSelection.value
      }
    })) as OmniPanelFeatureExecuteResponse

    if (!response?.success) {
      toast.error(resolveExecuteErrorMessage(response))
    }
  } catch (error) {
    console.error('[OmniPanel] Failed to execute feature:', error)
    toast.error(t('corebox.omniPanel.executeFailed', '执行失败，请稍后重试。'))
  } finally {
    executingId.value = null
  }
}

async function reorderFeature(
  item: OmniPanelFeatureItemPayload,
  direction: 'up' | 'down'
): Promise<void> {
  try {
    await transport.send(omniPanelFeatureReorderEvent, {
      id: item.id,
      direction
    })
    await loadFeatures()
  } catch (error) {
    console.error('[OmniPanel] Failed to reorder feature:', error)
    toast.error(t('corebox.omniPanel.reorderFailed', 'Feature 排序更新失败。'))
  }
}

function handleContext(payload: OmniPanelContextPayload): void {
  selectedText.value = payload.text || ''
  hasSelection.value = payload.hasSelection
  source.value = payload.source || 'manual'
  capturedAt.value = payload.capturedAt
}

function focusSearchBar(): void {
  searchBarRef.value?.focusInput()
}

function moveFocus(direction: 'up' | 'down'): void {
  focusedIndex.value = resolveNextFocusIndex(
    focusedIndex.value,
    direction,
    filteredFeatures.value.length
  )
}

async function executeFocusedFeature(): Promise<void> {
  const focused = resolveFocusedItem(filteredFeatures.value, focusedIndex.value)
  if (!focused) return
  await executeFeature(focused)
}

async function handleKeydown(event: KeyboardEvent): Promise<void> {
  const key = event.key

  if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'f') {
    event.preventDefault()
    focusSearchBar()
    return
  }

  if (key === 'Escape') {
    event.preventDefault()
    await closePanel()
    return
  }

  if (key === 'ArrowDown') {
    event.preventDefault()
    moveFocus('down')
    return
  }

  if (key === 'ArrowUp') {
    event.preventDefault()
    moveFocus('up')
    return
  }

  if (key === 'Enter') {
    event.preventDefault()
    await executeFocusedFeature()
  }
}

const disposeContext = transport.on(omniPanelContextEvent, (payload) => {
  handleContext(payload as OmniPanelContextPayload)
})

const disposeFeatureRefresh = transport.on(omniPanelFeatureRefreshEvent, async () => {
  await loadFeatures()
})

onMounted(async () => {
  previousFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  window.addEventListener('keydown', handleKeydown)
  await loadFeatures()
  focusSearchBar()
})

onBeforeUnmount(() => {
  disposeContext()
  disposeFeatureRefresh()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="OmniPanel">
    <OmniPanelHeader @close="closePanel" />

    <OmniPanelContextCard
      :text="selectedText"
      :source="source"
      :captured-at="capturedAt"
      :has-selection="hasSelection"
      :fallback-text="displayText"
    />

    <OmniPanelSearchBar
      ref="searchBarRef"
      v-model="searchKeyword"
      :placeholder="t('corebox.omniPanel.searchPlaceholder', '搜索 OmniPanel Feature')"
    />

    <div v-if="loading" class="OmniPanel__state">
      {{ t('corebox.omniPanel.loading', '正在加载 Feature...') }}
    </div>
    <div v-else-if="filteredFeatures.length === 0" class="OmniPanel__state">
      {{ t('corebox.omniPanel.empty', '当前没有可用 Feature') }}
    </div>
    <OmniPanelActionList
      v-else
      :items="filteredFeatures"
      :focused-index="focusedIndex"
      :executing-id="executingId"
      @focus="(index) => (focusedIndex = index)"
      @execute="executeFeature"
      @reorder="reorderFeature"
    />
  </div>
</template>

<style scoped lang="scss">
.OmniPanel {
  width: 100%;
  min-height: 100vh;
  padding: 22px;
  color: #eef2ff;
  background:
    radial-gradient(circle at 100% -20%, rgba(76, 139, 245, 0.3), transparent 45%),
    radial-gradient(circle at -10% 120%, rgba(45, 212, 191, 0.16), transparent 36%),
    linear-gradient(160deg, #111827 0%, #0b1220 100%);
  font-family: 'SF Pro Display', 'PingFang SC', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.OmniPanel__state {
  border: 1px dashed rgba(129, 140, 248, 0.35);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 13px;
  color: rgba(191, 219, 254, 0.92);
}
</style>
