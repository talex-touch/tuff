<script setup lang="ts">
import type {
  OmniPanelContextPayload,
  OmniPanelFeatureExecuteResponse,
  OmniPanelFeatureItemPayload,
  OmniPanelFeatureListResponse
} from '../../../../shared/events/omni-panel'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import {
  omniPanelContextEvent,
  omniPanelFeatureExecuteEvent,
  omniPanelFeatureListEvent,
  omniPanelFeatureRefreshEvent,
  omniPanelHideEvent
} from '../../../../shared/events/omni-panel'
import OmniPanelActionList from './components/OmniPanelActionList.vue'
import OmniPanelSearchBar from './components/OmniPanelSearchBar.vue'
import { filterOmniPanelFeatures } from './filter-features'
import { ensureValidFocusIndex, resolveFocusedItem, resolveNextFocusIndex } from './interaction'

const { t } = useI18n()
const transport = useTuffTransport()
const ACTION_GRID_COLUMNS = 3

const selectedText = ref('')
const hasSelection = ref(false)
const source = ref('manual')
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

const footerHint = computed(() => {
  if (!hasSelection.value) {
    return t('corebox.omniPanel.selectionCount', { count: 0 })
  }

  const trimmed = selectedText.value.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return t('corebox.omniPanel.selectionCount', { count: 0 })
  }

  const preview = trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed
  return t('corebox.omniPanel.selectionPreview', { preview })
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
    toast.error(t('corebox.omniPanel.loadFailed'))
  } finally {
    loading.value = false
  }
}

function resolveExecuteErrorMessage(response?: OmniPanelFeatureExecuteResponse): string {
  const fallback = t('corebox.omniPanel.executeFailed')
  if (!response) return fallback
  if (response.error) return response.error
  if (response.code && executeCodeMessageMap[response.code]) {
    return t(executeCodeMessageMap[response.code])
  }
  return fallback
}

async function executeFeature(item: OmniPanelFeatureItemPayload): Promise<void> {
  if (executingId.value) return
  if (item.unavailable) {
    toast.error(item.unavailableReason?.message || t('corebox.omniPanel.featureUnavailable'))
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
    toast.error(t('corebox.omniPanel.executeFailed'))
  } finally {
    executingId.value = null
  }
}

function handleContext(payload: OmniPanelContextPayload): void {
  selectedText.value = payload.text || ''
  hasSelection.value = payload.hasSelection
  source.value = payload.source || 'manual'
}

function focusSearchBar(): void {
  searchBarRef.value?.focusInput()
}

function moveFocus(direction: 'up' | 'down' | 'left' | 'right'): void {
  focusedIndex.value = resolveNextFocusIndex(
    focusedIndex.value,
    direction,
    filteredFeatures.value.length,
    ACTION_GRID_COLUMNS
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

  if (key === 'ArrowRight') {
    event.preventDefault()
    moveFocus('right')
    return
  }

  if (key === 'ArrowLeft') {
    event.preventDefault()
    moveFocus('left')
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
    <OmniPanelSearchBar
      ref="searchBarRef"
      v-model="searchKeyword"
      :placeholder="t('corebox.omniPanel.searchPlaceholder')"
    />

    <div class="OmniPanel__divider" />

    <div v-if="loading" class="OmniPanel__state">
      {{ t('corebox.omniPanel.loading') }}
    </div>
    <div v-else-if="filteredFeatures.length === 0" class="OmniPanel__state">
      {{ t('corebox.omniPanel.empty') }}
    </div>
    <OmniPanelActionList
      v-else
      :items="filteredFeatures"
      :focused-index="focusedIndex"
      :executing-id="executingId"
      @focus="(index) => (focusedIndex = index)"
      @execute="executeFeature"
    />

    <div class="OmniPanel__divider" />
    <p class="OmniPanel__hint">{{ footerHint }}</p>
  </div>
</template>

<style scoped lang="scss">
.OmniPanel {
  width: 100%;
  min-height: 100vh;
  padding: 12px;
  color: var(--tx-text-color-primary);
  background: var(--tx-bg-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.OmniPanel__state {
  border: 1px dashed color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color-light);
}

.OmniPanel__divider {
  width: 100%;
  height: 1px;
  background: color-mix(in srgb, var(--tx-border-color) 76%, transparent);
}

.OmniPanel__hint {
  margin: 0;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
