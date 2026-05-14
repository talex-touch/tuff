<script setup lang="ts">
import type {
  OmniPanelContextPayload,
  OmniPanelDesktopContextCapsule,
  OmniPanelFeatureExecuteResponse,
  OmniPanelFeatureItemPayload,
  OmniPanelFeatureListResponse
} from '../../../../shared/events/omni-panel'
import type { IntelligenceInvokeResult } from '@talex-touch/tuff-intelligence'
import { createIntelligenceClient } from '@talex-touch/tuff-intelligence'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { TxButton } from '@talex-touch/tuffex'
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
import {
  buildOmniPanelAiInvokeRequest,
  isOmniPanelAiAction,
  normalizeOmniPanelAiResult,
  resolveOmniPanelAiInput,
  type OmniPanelAiActionId
} from './ai-actions'
import { filterOmniPanelFeatures } from './filter-features'
import { ensureValidFocusIndex, resolveFocusedItem, resolveNextFocusIndex } from './interaction'
import { createRendererLogger } from '../../utils/renderer-log'

const { t } = useI18n()
const transport = useTuffTransport()
const intelligence = createIntelligenceClient(transport)
const omniPanelLog = createRendererLogger('OmniPanel')
const ACTION_GRID_COLUMNS = 3

const selectedText = ref('')
const hasSelection = ref(false)
const source = ref('manual')
const selectionSupportLevel = ref<'supported' | 'best_effort' | 'unsupported' | undefined>(
  undefined
)
const selectionIssueCode = ref<'disabled' | 'empty' | 'failed' | 'unsupported' | undefined>(
  undefined
)
const selectionIssueMessage = ref('')
const contextCapsule = ref<OmniPanelDesktopContextCapsule | undefined>(undefined)
const loading = ref(false)
const executingId = ref<string | null>(null)
const searchKeyword = ref('')
const features = ref<OmniPanelFeatureItemPayload[]>([])
const focusedIndex = ref(-1)
const searchBarRef = ref<InstanceType<typeof OmniPanelSearchBar> | null>(null)
const replaceClipboardConfirming = ref(false)
let previousFocusedElement: HTMLElement | null = null

interface AiPreviewState {
  featureId: OmniPanelAiActionId
  title: string
  capabilityId: string
  inputText: string
  resultText: string
  provider: string
  model: string
  traceId: string
  latency: number
  status: 'running' | 'done' | 'error'
  error?: string
}

const aiPreview = ref<AiPreviewState | null>(null)

const executeCodeMessageMap: Record<string, string> = {
  FEATURE_UNAVAILABLE: 'corebox.omniPanel.featureUnavailable',
  SELECTION_REQUIRED: 'corebox.omniPanel.selectionRequired',
  COREBOX_UNAVAILABLE: 'corebox.omniPanel.coreboxUnavailable',
  FEATURE_EXECUTION_FAILED: 'corebox.omniPanel.executeFailed',
  INTERNAL_ERROR: 'corebox.omniPanel.executeFailed'
}

const footerHint = computed(() => {
  if (!hasSelection.value) {
    if (selectionIssueCode.value === 'unsupported') {
      const base = t('corebox.omniPanel.selectionUnavailable')
      return selectionIssueMessage.value ? `${base} · ${selectionIssueMessage.value}` : base
    }
    if (selectionIssueCode.value === 'failed' || selectionIssueCode.value === 'disabled') {
      const base = t('corebox.omniPanel.selectionCaptureFailed')
      return selectionIssueMessage.value ? `${base} · ${selectionIssueMessage.value}` : base
    }
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
    omniPanelLog.error('Failed to load features', error)
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

  if (isOmniPanelAiAction(item.id)) {
    await executeAiFeature(item, item.id)
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
    omniPanelLog.error('Failed to execute feature', error)
    toast.error(t('corebox.omniPanel.executeFailed'))
  } finally {
    executingId.value = null
  }
}

async function executeAiFeature(
  item: OmniPanelFeatureItemPayload,
  actionId: OmniPanelAiActionId
): Promise<void> {
  const inputText = resolveOmniPanelAiInput(selectedText.value, contextCapsule.value)
  if (!inputText) {
    toast.error(t('corebox.omniPanel.selectionRequired'))
    return
  }

  executingId.value = item.id
  replaceClipboardConfirming.value = false

  const request = buildOmniPanelAiInvokeRequest({
    actionId,
    inputText,
    source: source.value,
    capsule: contextCapsule.value
  })
  aiPreview.value = {
    featureId: actionId,
    title: item.title,
    capabilityId: request.capabilityId,
    inputText,
    resultText: '',
    provider: '',
    model: '',
    traceId: '',
    latency: 0,
    status: 'running'
  }

  try {
    const result = (await intelligence.invoke(
      request.capabilityId,
      request.payload,
      request.options
    )) as IntelligenceInvokeResult<unknown>
    const preview = normalizeOmniPanelAiResult(result)
    aiPreview.value = {
      featureId: actionId,
      title: item.title,
      capabilityId: request.capabilityId,
      inputText,
      resultText: preview.text,
      provider: preview.provider,
      model: preview.model,
      traceId: preview.traceId,
      latency: preview.latency,
      status: 'done'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('corebox.omniPanel.executeFailed')
    omniPanelLog.error('Failed to execute OmniPanel AI feature', error)
    aiPreview.value = {
      featureId: actionId,
      title: item.title,
      capabilityId: request.capabilityId,
      inputText,
      resultText: '',
      provider: '',
      model: '',
      traceId: '',
      latency: 0,
      status: 'error',
      error: message
    }
    toast.error(message)
  } finally {
    executingId.value = null
  }
}

async function retryAiPreview(): Promise<void> {
  const current = aiPreview.value
  if (!current) return
  const item = features.value.find((feature) => feature.id === current.featureId)
  if (!item) return
  await executeAiFeature(item, current.featureId)
}

async function copyAiResult(): Promise<void> {
  const text = aiPreview.value?.resultText?.trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('corebox.omniPanel.aiCopied'))
  } catch (error) {
    omniPanelLog.error('Failed to copy OmniPanel AI result', error)
    toast.error(t('corebox.omniPanel.aiCopyFailed'))
  }
}

async function replaceClipboardWithAiResult(): Promise<void> {
  const text = aiPreview.value?.resultText?.trim()
  if (!text) return

  if (!replaceClipboardConfirming.value) {
    replaceClipboardConfirming.value = true
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    replaceClipboardConfirming.value = false
    toast.success(t('corebox.omniPanel.aiClipboardReplaced'))
  } catch (error) {
    omniPanelLog.error('Failed to replace clipboard with OmniPanel AI result', error)
    toast.error(t('corebox.omniPanel.aiCopyFailed'))
  }
}

function clearAiPreview(): void {
  aiPreview.value = null
  replaceClipboardConfirming.value = false
}

function handleContext(payload: OmniPanelContextPayload): void {
  selectedText.value = payload.text || ''
  hasSelection.value = payload.hasSelection
  source.value = payload.source || 'manual'
  selectionSupportLevel.value = payload.selectionSupportLevel
  selectionIssueCode.value = payload.selectionIssueCode
  selectionIssueMessage.value = payload.selectionIssueMessage || ''
  contextCapsule.value = payload.capsule
  clearAiPreview()
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
  window.addEventListener('blur', closePanel)
  await loadFeatures()
  focusSearchBar()
})

onBeforeUnmount(() => {
  disposeContext()
  disposeFeatureRefresh()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('blur', closePanel)
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

    <section v-if="aiPreview" class="OmniPanelAiPreview" :class="`is-${aiPreview.status}`">
      <header class="OmniPanelAiPreview__header">
        <div>
          <h2 class="OmniPanelAiPreview__title">{{ aiPreview.title }}</h2>
          <p class="OmniPanelAiPreview__meta">
            {{ aiPreview.capabilityId }}
            <span v-if="aiPreview.provider"> / {{ aiPreview.provider }}</span>
            <span v-if="aiPreview.model"> / {{ aiPreview.model }}</span>
          </p>
        </div>
        <button class="OmniPanelAiPreview__close" type="button" @click="clearAiPreview">
          x
        </button>
      </header>
      <div v-if="aiPreview.status === 'running'" class="OmniPanelAiPreview__state">
        {{ t('corebox.omniPanel.aiRunning') }}
      </div>
      <div v-else-if="aiPreview.status === 'error'" class="OmniPanelAiPreview__error">
        {{ aiPreview.error || t('corebox.omniPanel.executeFailed') }}
      </div>
      <pre v-else class="OmniPanelAiPreview__result">{{ aiPreview.resultText }}</pre>
      <footer class="OmniPanelAiPreview__footer">
        <span class="OmniPanelAiPreview__trace">
          {{ aiPreview.traceId || t('corebox.omniPanel.aiNoTrace') }}
        </span>
        <div class="OmniPanelAiPreview__actions">
          <TxButton
            size="sm"
            variant="ghost"
            :disabled="aiPreview.status === 'running'"
            @click="retryAiPreview"
          >
            {{ t('corebox.omniPanel.aiRetry') }}
          </TxButton>
          <TxButton
            size="sm"
            variant="ghost"
            :disabled="aiPreview.status !== 'done'"
            @click="copyAiResult"
          >
            {{ t('corebox.omniPanel.aiCopy') }}
          </TxButton>
          <TxButton
            size="sm"
            :variant="replaceClipboardConfirming ? 'flat' : 'ghost'"
            :disabled="aiPreview.status !== 'done'"
            @click="replaceClipboardWithAiResult"
          >
            {{
              replaceClipboardConfirming
                ? t('corebox.omniPanel.aiConfirmReplaceClipboard')
                : t('corebox.omniPanel.aiReplaceClipboard')
            }}
          </TxButton>
        </div>
      </footer>
    </section>

    <div class="OmniPanel__divider" />
    <p class="OmniPanel__hint">{{ footerHint }}</p>
  </div>
</template>

<style scoped lang="scss">
.OmniPanel {
  width: 100%;
  height: 100vh;
  min-height: 0;
  padding: 8px;
  color: var(--tx-text-color-primary);
  background: var(--tx-bg-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

.OmniPanel__state {
  border: 1px dashed color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11px;
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
  font-size: 10px;
  color: var(--tx-text-color-secondary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.OmniPanelAiPreview {
  min-height: 0;
  max-height: 116px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  padding: 8px;
  background: var(--tx-fill-color-light);
}

.OmniPanelAiPreview__header,
.OmniPanelAiPreview__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.OmniPanelAiPreview__title {
  margin: 0;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 650;
}

.OmniPanelAiPreview__meta,
.OmniPanelAiPreview__trace {
  margin: 0;
  font-size: 9px;
  color: var(--tx-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.OmniPanelAiPreview__close {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 6px;
  color: var(--tx-text-color-secondary);
  background: transparent;
  cursor: pointer;
}

.OmniPanelAiPreview__result,
.OmniPanelAiPreview__state,
.OmniPanelAiPreview__error {
  flex: 1;
  min-height: 0;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 10px;
  line-height: 1.45;
  color: var(--tx-text-color-primary);
}

.OmniPanelAiPreview__error {
  color: var(--tx-color-danger);
}

.OmniPanelAiPreview__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
</style>
