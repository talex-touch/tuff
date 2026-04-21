<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  tryUsePluginInfo,
  useChannel,
  useClipboard,
  usePluginStorage,
} from '@talex-touch/utils/plugin/sdk'
import translationShared from '../shared/translation-shared.cjs'

type ProviderStatus = 'pending' | 'success' | 'error'
type WidgetStatus = 'idle' | 'running' | 'complete' | 'error'
type FocusArea = 'providers' | 'history'

interface ProviderState {
  id: string
  name: string
  status: ProviderStatus
  translatedText?: string
  from?: string
  to?: string
  provider?: string
  model?: string
  error?: string
}

interface TranslationWidgetPayload {
  requestId?: string
  query?: string
  detectedLang?: string
  targetLang?: string
  status?: WidgetStatus
  providers?: ProviderState[]
  error?: string
  updatedAt?: number
}

interface HistoryResult {
  providerId: string
  providerName: string
  text: string
  from?: string
  to?: string
  provider?: string
  model?: string
}

interface HistoryItem {
  id: number
  text: string
  timestamp: number
  results?: HistoryResult[]
}

const props = defineProps<{
  item: any
  payload?: Record<string, unknown>
}>()

const PROVIDER_ERROR_PREVIEW_LENGTH = 220
const { getProviderOrderIndex } = translationShared as any

const pluginInfo = tryUsePluginInfo() ?? { name: 'Preview' }
const hasRuntime = ref(Boolean(tryUsePluginInfo()?.name))
let storage: ReturnType<typeof usePluginStorage> | null = null
let channel: ReturnType<typeof useChannel> | null = null
let clipboard: ReturnType<typeof useClipboard> | null = null
let disposeKeyChannel: (() => void) | null = null

try {
  storage = usePluginStorage()
} catch {
  storage = null
}

try {
  channel = useChannel()
  clipboard = useClipboard()
} catch {
  channel = null
  clipboard = null
}

const pluginName = computed(() => (typeof pluginInfo.name === 'string' ? pluginInfo.name : ''))
const history = ref<HistoryItem[]>([])
const lastSavedRequestId = ref<string | null>(null)
const focusedArea = ref<FocusArea>('providers')
const selectedProviderId = ref<string | null>(null)
const selectedHistoryId = ref<number | null>(null)
const expandedProviderErrorIds = ref<Set<string>>(new Set())

function normalizeProviderStatus(value: unknown): ProviderStatus {
  if (value === 'success' || value === 'error' || value === 'pending') {
    return value
  }
  return 'pending'
}

function normalizeWidgetStatus(value: unknown): WidgetStatus {
  if (value === 'running' || value === 'complete' || value === 'error' || value === 'idle') {
    return value
  }
  return 'idle'
}

function safeReadRecordValue(record: Record<string, unknown>, key: string): unknown {
  try {
    return record[key]
  }
  catch {
    return undefined
  }
}

function safeReadRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = safeReadRecordValue(record, key)
  return typeof value === 'string' ? value : undefined
}

function normalizeProviders(input: unknown): ProviderState[] {
  if (!Array.isArray(input)) {
    return []
  }

  const normalized: ProviderState[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const provider = entry as Record<string, unknown>
    const id = safeReadRecordString(provider, 'id') || ''
    const name = safeReadRecordString(provider, 'name') || id || 'Unknown'

    normalized.push({
      id,
      name,
      status: normalizeProviderStatus(safeReadRecordValue(provider, 'status')),
      translatedText: safeReadRecordString(provider, 'translatedText'),
      from: safeReadRecordString(provider, 'from'),
      to: safeReadRecordString(provider, 'to'),
      provider: safeReadRecordString(provider, 'provider'),
      model: safeReadRecordString(provider, 'model'),
      error: safeReadRecordString(provider, 'error'),
    })
  }

  return normalized
}

function buildHistoryResults(inputProviders: unknown): HistoryResult[] {
  const results: HistoryResult[] = []

  for (const provider of normalizeProviders(inputProviders)) {
    if (provider.status !== 'success' || !provider.translatedText) {
      continue
    }

    results.push({
      providerId: provider.id,
      providerName: provider.name,
      text: provider.translatedText,
      from: provider.from,
      to: provider.to,
      provider: provider.provider,
      model: provider.model,
    })
  }

  return results
}

function normalizeWidgetPayload(input: unknown): TranslationWidgetPayload | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const payload = input as Record<string, unknown>
  return {
    requestId: safeReadRecordString(payload, 'requestId'),
    query: safeReadRecordString(payload, 'query'),
    detectedLang: safeReadRecordString(payload, 'detectedLang'),
    targetLang: safeReadRecordString(payload, 'targetLang'),
    status: normalizeWidgetStatus(safeReadRecordValue(payload, 'status')),
    providers: normalizeProviders(safeReadRecordValue(payload, 'providers')),
    error: safeReadRecordString(payload, 'error'),
    updatedAt: (() => {
      const updatedAt = safeReadRecordValue(payload, 'updatedAt')
      return typeof updatedAt === 'number' ? updatedAt : undefined
    })(),
  }
}

function safeReadItemCustomData(item: any): unknown {
  if (!item || typeof item !== 'object') {
    return undefined
  }

  try {
    const renderValue = (item as Record<string, unknown>).render
    if (!renderValue || typeof renderValue !== 'object') {
      return undefined
    }
    const customValue = (renderValue as Record<string, unknown>).custom
    if (!customValue || typeof customValue !== 'object') {
      return undefined
    }
    return (customValue as Record<string, unknown>).data
  }
  catch {
    return undefined
  }
}

function normalizeHistory(input: unknown): HistoryItem[] {
  if (!Array.isArray(input)) {
    return []
  }

  const normalized: HistoryItem[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const item = entry as Record<string, unknown>
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (!text) {
      continue
    }

    const timestamp = typeof item.timestamp === 'number' ? item.timestamp : Date.now()
    const id = typeof item.id === 'number' ? item.id : timestamp
    normalized.push({
      id,
      text,
      timestamp,
      results: Array.isArray(item.results) ? item.results as HistoryResult[] : undefined,
    })
  }

  return normalized
}

const resolvedPayload = computed<TranslationWidgetPayload | null>(() => {
  if (props.payload && typeof props.payload === 'object') {
    return normalizeWidgetPayload(props.payload)
  }

  const custom = safeReadItemCustomData(props.item)
  if (custom && typeof custom === 'object') {
    return normalizeWidgetPayload(custom)
  }

  return null
})

const status = computed<WidgetStatus>(() => resolvedPayload.value?.status || 'idle')
const query = computed(() => resolvedPayload.value?.query?.trim() || '')
const providers = computed(() => resolvedPayload.value?.providers || [])
const orderedProviders = computed(() => {
  const statusPriority: Record<ProviderStatus, number> = {
    pending: 0,
    success: 1,
    error: 2,
  }

  return [...providers.value].sort((left, right) => {
    const priorityDiff = statusPriority[left.status] - statusPriority[right.status]
    if (priorityDiff !== 0) {
      return priorityDiff
    }
    return getProviderOrderIndex(left.id) - getProviderOrderIndex(right.id)
  })
})

const selectedProvider = computed(() => {
  return orderedProviders.value.find(provider => provider.id === selectedProviderId.value) || null
})

const selectedHistoryItem = computed(() => {
  return history.value.find(item => item.id === selectedHistoryId.value) || null
})

const errorMessage = computed(() => resolvedPayload.value?.error || '')
const hasResults = computed(() => providers.value.some(provider => provider.status === 'success'))

const statusLabel = computed(() => {
  switch (status.value) {
    case 'running':
      return '翻译中'
    case 'complete':
      return '翻译完成'
    case 'error':
      return '翻译失败'
    default:
      return '等待输入'
  }
})

function ensureProviderSelection(): void {
  if (!orderedProviders.value.length) {
    selectedProviderId.value = null
    return
  }

  const exists = orderedProviders.value.some(provider => provider.id === selectedProviderId.value)
  if (!exists) {
    selectedProviderId.value = orderedProviders.value[0].id
  }
}

function ensureHistorySelection(): void {
  if (!history.value.length) {
    selectedHistoryId.value = null
    return
  }

  const exists = history.value.some(item => item.id === selectedHistoryId.value)
  if (!exists) {
    selectedHistoryId.value = history.value[0].id
  }
}

function focusArea(area: FocusArea): void {
  focusedArea.value = area
  if (area === 'providers') {
    ensureProviderSelection()
  }
  else {
    ensureHistorySelection()
  }
}

function moveProviderSelection(direction: -1 | 1): void {
  if (!orderedProviders.value.length) {
    return
  }

  ensureProviderSelection()

  const currentIndex = orderedProviders.value.findIndex(provider => provider.id === selectedProviderId.value)
  const normalizedIndex = currentIndex < 0 ? 0 : currentIndex
  const nextIndex = (normalizedIndex + direction + orderedProviders.value.length) % orderedProviders.value.length
  selectedProviderId.value = orderedProviders.value[nextIndex].id
}

function moveHistorySelection(direction: -1 | 1): void {
  if (!history.value.length) {
    return
  }

  ensureHistorySelection()

  const currentIndex = history.value.findIndex(item => item.id === selectedHistoryId.value)
  const normalizedIndex = currentIndex < 0 ? 0 : currentIndex
  const nextIndex = (normalizedIndex + direction + history.value.length) % history.value.length
  selectedHistoryId.value = history.value[nextIndex].id
}

function normalizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

function isErrorExpanded(providerId: string): boolean {
  return expandedProviderErrorIds.value.has(providerId)
}

function hasProviderErrorDetail(provider: ProviderState): boolean {
  if (!provider.error) {
    return false
  }
  return normalizeErrorMessage(provider.error).length > PROVIDER_ERROR_PREVIEW_LENGTH
}

function getProviderErrorText(provider: ProviderState): string {
  const source = provider.error?.trim() || '翻译失败'
  if (isErrorExpanded(provider.id)) {
    return source
  }

  const normalized = normalizeErrorMessage(source)
  if (normalized.length <= PROVIDER_ERROR_PREVIEW_LENGTH) {
    return normalized
  }
  return `${normalized.slice(0, PROVIDER_ERROR_PREVIEW_LENGTH)}...`
}

function toggleProviderError(providerId: string): void {
  const next = new Set(expandedProviderErrorIds.value)
  if (next.has(providerId)) {
    next.delete(providerId)
  }
  else {
    next.add(providerId)
  }
  expandedProviderErrorIds.value = next
}

function getProviderCopyText(provider: ProviderState | null): string {
  if (!provider) {
    return ''
  }
  if (provider.status === 'success') {
    return provider.translatedText?.trim() || ''
  }
  if (provider.status === 'error') {
    return provider.error?.trim() || ''
  }
  return ''
}

function handleWidgetKeydown(event: {
  key?: string
  metaKey?: boolean
  ctrlKey?: boolean
  repeat?: boolean
}): void {
  const key = event.key || ''
  const hasModifier = Boolean(event.metaKey || event.ctrlKey)

  if (hasModifier && key === 'ArrowLeft') {
    focusArea('history')
    return
  }

  if (hasModifier && key === 'ArrowRight') {
    focusArea('providers')
    return
  }

  if (key === 'ArrowUp') {
    if (focusedArea.value === 'providers') {
      moveProviderSelection(-1)
    }
    else {
      moveHistorySelection(-1)
    }
    return
  }

  if (key === 'ArrowDown') {
    if (focusedArea.value === 'providers') {
      moveProviderSelection(1)
    }
    else {
      moveHistorySelection(1)
    }
    return
  }

  if (key === 'Enter') {
    if (event.repeat) {
      return
    }

    if (focusedArea.value === 'providers') {
      const copyText = getProviderCopyText(selectedProvider.value)
      if (copyText) {
        copyResult(copyText).catch((err) => {
          void err
        })
      }
      return
    }

    const historyItem = selectedHistoryItem.value
    if (historyItem) {
      useHistoryItem(historyItem.text).catch((err) => {
        void err
      })
    }
  }
}

async function loadHistory(): Promise<void> {
  try {
    if (!storage) {
      history.value = []
      return
    }
    const saved = await storage.getFile('history')
    history.value = normalizeHistory(saved)
  }
  catch (error) {
    void error
    history.value = []
  }
}

async function saveHistory(): Promise<void> {
  try {
    if (!storage) {
      return
    }
    await storage.setFile('history', history.value)
  }
  catch (error) {
    void error
  }
}

function addToHistory(text: string, results: HistoryResult[]): void {
  if (!text.trim()) {
    return
  }

  const item: HistoryItem = {
    id: Date.now(),
    text: text.trim(),
    timestamp: Date.now(),
    results,
  }

  const nextHistory: HistoryItem[] = [item]
  for (const existing of history.value) {
    if (existing.text === item.text) {
      continue
    }
    nextHistory.push(existing)
    if (nextHistory.length >= 10) {
      break
    }
  }

  history.value = nextHistory
  ensureHistorySelection()

  saveHistory().catch((err) => {
    void err
  })
}

function removeHistoryItem(id: number): void {
  const nextHistory: HistoryItem[] = []
  for (const item of history.value) {
    if (item.id !== id) {
      nextHistory.push(item)
    }
  }

  if (nextHistory.length !== history.value.length) {
    history.value = nextHistory
    ensureHistorySelection()
    saveHistory().catch((err) => {
      void err
    })
  }
}

function clearHistory(): void {
  history.value = []
  ensureHistorySelection()
  saveHistory().catch((err) => {
    void err
  })
}

function isPayloadComplete(payload: TranslationWidgetPayload): boolean {
  if (payload.status === 'complete' || payload.status === 'error') {
    return true
  }
  if (!payload.providers?.length) {
    return false
  }
  return payload.providers.every(provider => provider.status !== 'pending')
}

watch(
  () => resolvedPayload.value,
  (payload) => {
    if (!payload || !payload.requestId) {
      return
    }
    if (!payload.query) {
      return
    }
    if (!isPayloadComplete(payload)) {
      return
    }
    if (payload.requestId === lastSavedRequestId.value) {
      ensureProviderSelection()
      return
    }

    const results = buildHistoryResults(payload.providers)

    if (results.length === 0) {
      return
    }

    lastSavedRequestId.value = payload.requestId || null
    addToHistory(payload.query, results)
    ensureProviderSelection()
  },
)

watch(
  () => orderedProviders.value.length,
  () => {
    ensureProviderSelection()
    if (expandedProviderErrorIds.value.size > 0) {
      const validIds = new Set<string>()
      for (const provider of orderedProviders.value) {
        validIds.add(provider.id)
      }
      const next = new Set<string>()
      for (const providerId of expandedProviderErrorIds.value) {
        if (validIds.has(providerId)) {
          next.add(providerId)
        }
      }
      expandedProviderErrorIds.value = next
    }
  },
  { immediate: true },
)

watch(
  () => history.value.length,
  () => {
    ensureHistorySelection()
    if (!history.value.length && focusedArea.value === 'history') {
      focusedArea.value = 'providers'
    }
  },
  { immediate: true },
)

async function useHistoryItem(text: string): Promise<void> {
  if (!text.trim()) {
    return
  }

  try {
    if (!channel) {
      return
    }
    await channel.send('core-box:set-query', { value: text })
  }
  catch (error) {
    void error
  }
}

async function copyResult(text: string): Promise<void> {
  if (!text) {
    return
  }
  try {
    if (!clipboard) {
      return
    }
    await clipboard.writeText(text)
  }
  catch (error) {
    void error
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function providerStatusLabel(provider: ProviderState): string {
  if (provider.status === 'success') {
    return '已完成'
  }
  if (provider.status === 'error') {
    return '失败'
  }
  return '翻译中'
}

onMounted(() => {
  hasRuntime.value = Boolean(tryUsePluginInfo()?.name)
  focusArea('providers')

  if (channel) {
    disposeKeyChannel = channel.regChannel('core-box:key-event', (eventData: any) => {
      handleWidgetKeydown(eventData?.data || {})
    })
  }

  loadHistory().catch((err) => {
    void err
  })
})

onBeforeUnmount(() => {
  disposeKeyChannel?.()
  disposeKeyChannel = null
})
</script>

<template>
  <div class="TranslationWidget" :data-plugin="pluginName">
    <aside class="TranslationWidget__history" :class="{ 'is-focused': focusedArea === 'history' }">
      <div class="TranslationWidget__history-header">
        <span>历史记录</span>
        <button
          v-if="history.length"
          class="TranslationWidget__history-clear"
          type="button"
          @click="clearHistory"
        >
          清空
        </button>
      </div>
      <div v-if="history.length" class="TranslationWidget__history-list">
        <div
          v-for="historyItem in history"
          :key="historyItem.id"
          class="TranslationWidget__history-item"
          :class="{ 'is-selected': selectedHistoryId === historyItem.id }"
        >
          <button
            class="TranslationWidget__history-main"
            type="button"
            @click="selectedHistoryId = historyItem.id; focusArea('history'); useHistoryItem(historyItem.text)"
          >
            <div class="TranslationWidget__history-text" :title="historyItem.text">
              {{ historyItem.text }}
            </div>
            <div class="TranslationWidget__history-meta">
              <span>{{ formatTime(historyItem.timestamp) }}</span>
              <span>{{ historyItem.results?.length || 0 }} 个结果</span>
            </div>
          </button>
          <button
            class="TranslationWidget__history-remove"
            type="button"
            @click.stop="removeHistoryItem(historyItem.id)"
          >
            ×
          </button>
        </div>
      </div>
      <div v-else class="TranslationWidget__history-empty">
        暂无记录
      </div>
    </aside>

    <section class="TranslationWidget__detail">
      <header class="TranslationWidget__detail-header">
        <div class="TranslationWidget__query">
          <div class="TranslationWidget__query-label">
            当前输入
          </div>
          <div class="TranslationWidget__query-text">
            {{ query || '请输入要翻译的文本' }}
          </div>
        </div>
        <div v-if="!hasRuntime" class="TranslationWidget__runtime-hint">
          预览模式
        </div>
        <div class="TranslationWidget__status" :class="`is-${status}`">
          {{ statusLabel }}
        </div>
      </header>

      <div v-if="status === 'idle'" class="TranslationWidget__placeholder">
        输入文本后将展示翻译详情与多源结果
      </div>

      <div
        v-else
        class="TranslationWidget__providers"
        :class="{ 'is-focused': focusedArea === 'providers' }"
      >
        <div v-if="errorMessage" class="TranslationWidget__error">
          {{ errorMessage }}
        </div>

        <div
          v-for="provider in orderedProviders"
          :key="provider.id"
          class="TranslationWidget__provider"
          :class="{ 'is-selected': selectedProviderId === provider.id }"
          @click="selectedProviderId = provider.id; focusArea('providers')"
        >
          <div class="TranslationWidget__provider-header">
            <span class="TranslationWidget__provider-name">{{ provider.name }}</span>
            <span class="TranslationWidget__provider-status" :class="`is-${provider.status}`">
              {{ providerStatusLabel(provider) }}
            </span>
            <button
              v-if="getProviderCopyText(provider)"
              class="TranslationWidget__copy"
              type="button"
              @click.stop="copyResult(getProviderCopyText(provider))"
            >
              {{ provider.status === 'error' ? '复制错误' : '复制' }}
            </button>
          </div>
          <div class="TranslationWidget__provider-body">
            <template v-if="provider.status === 'success'">
              {{ provider.translatedText }}
            </template>
            <template v-else-if="provider.status === 'error'">
              {{ getProviderErrorText(provider) }}
            </template>
            <template v-else>
              翻译中...
            </template>
          </div>
          <div v-if="provider.status === 'error' && hasProviderErrorDetail(provider)" class="TranslationWidget__provider-error-action">
            <button class="TranslationWidget__provider-toggle" type="button" @click.stop="toggleProviderError(provider.id)">
              {{ isErrorExpanded(provider.id) ? '收起详情' : '查看详情' }}
            </button>
          </div>
          <div v-if="provider.status !== 'pending'" class="TranslationWidget__provider-meta">
            <span v-if="provider.from || provider.to">
              {{ provider.from || 'auto' }} → {{ provider.to || '' }}
            </span>
            <span v-if="provider.provider || provider.model">
              {{ provider.provider }}{{ provider.model ? `/${provider.model}` : '' }}
            </span>
          </div>
        </div>

        <div v-if="!orderedProviders.length && !hasResults" class="TranslationWidget__placeholder">
          当前没有可用的翻译源
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.TranslationWidget {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  padding: 16px;
  border-radius: 18px;
  background: var(--tx-bg-color);
  border: 1px solid var(--tx-border-color);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
  min-height: 280px;
}

.TranslationWidget__history {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--tx-border-color);
  padding-right: 12px;
  border-radius: 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.TranslationWidget__history.is-focused {
  border-color: rgba(64, 158, 255, 0.45);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.14);
}

.TranslationWidget__history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.TranslationWidget__history-clear {
  border: none;
  background: transparent;
  color: var(--tx-color-primary);
  font-size: 12px;
  cursor: pointer;
}

.TranslationWidget__history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
  max-height: 420px;
}

.TranslationWidget__history-item {
  position: relative;
  border: 1px solid rgba(64, 158, 255, 0.16);
  background: rgba(64, 158, 255, 0.06);
  border-radius: 12px;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.TranslationWidget__history-main {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 32px 10px 10px;
  text-align: left;
  cursor: pointer;
}

.TranslationWidget__history-item:hover {
  border-color: rgba(64, 158, 255, 0.42);
  background: rgba(64, 158, 255, 0.14);
}

.TranslationWidget__history-item.is-selected {
  border-color: rgba(64, 158, 255, 0.58);
  background: rgba(64, 158, 255, 0.2);
}

.TranslationWidget__history-text {
  font-size: 13px;
  color: var(--tx-text-color-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.TranslationWidget__history-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.TranslationWidget__history-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.7);
  color: var(--tx-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 999px;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  padding: 0;
}

.TranslationWidget__history-empty {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  padding: 8px 0;
}

.TranslationWidget__detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.TranslationWidget__detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.TranslationWidget__query-label {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.TranslationWidget__query-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  margin-top: 2px;
}

.TranslationWidget__status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(64, 158, 255, 0.15);
  color: var(--tx-color-primary);
}

.TranslationWidget__runtime-hint {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color-lighter);
}

.TranslationWidget__status.is-error {
  background: rgba(245, 108, 108, 0.15);
  color: var(--tx-color-danger);
}

.TranslationWidget__providers {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 460px;
  overflow: auto;
  padding: 2px 4px 2px 2px;
  border-radius: 12px;
  border: 1px solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.TranslationWidget__providers.is-focused {
  border-color: rgba(64, 158, 255, 0.45);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.12);
}

.TranslationWidget__provider {
  border-radius: 14px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-bg-color-overlay);
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.TranslationWidget__provider:hover {
  border-color: rgba(64, 158, 255, 0.36);
}

.TranslationWidget__provider.is-selected {
  border-color: rgba(64, 158, 255, 0.58);
  background: rgba(64, 158, 255, 0.08);
}

.TranslationWidget__provider-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.TranslationWidget__provider-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.TranslationWidget__provider-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  background: rgba(100, 116, 139, 0.14);
  flex-shrink: 0;
}

.TranslationWidget__provider-status.is-success {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.14);
}

.TranslationWidget__provider-status.is-error {
  color: var(--tx-color-danger, #ef4444);
  background: rgba(239, 68, 68, 0.14);
}

.TranslationWidget__provider-status.is-pending {
  color: #6b7280;
  background: rgba(107, 114, 128, 0.14);
}

.TranslationWidget__copy {
  margin-left: auto;
  border: 1px solid rgba(64, 158, 255, 0.28);
  background: rgba(64, 158, 255, 0.14);
  color: var(--tx-color-primary);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.TranslationWidget__provider-body {
  font-size: 13px;
  color: var(--tx-text-color-primary);
  line-height: 1.5;
  min-height: 20px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.TranslationWidget__provider-error-action {
  margin-top: 6px;
}

.TranslationWidget__provider-toggle {
  border: none;
  background: transparent;
  color: var(--tx-color-primary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.TranslationWidget__provider-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  margin-top: 6px;
}

.TranslationWidget__placeholder {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  padding: 8px 0;
}

.TranslationWidget__error {
  font-size: 12px;
  color: var(--tx-color-danger);
  background: rgba(245, 108, 108, 0.12);
  border: 1px solid rgba(245, 108, 108, 0.28);
  border-radius: 10px;
  padding: 8px 10px;
}

@media (max-width: 640px) {
  .TranslationWidget {
    grid-template-columns: 1fr;
  }

  .TranslationWidget__history {
    border-right: none;
    padding-right: 0;
    border-bottom: 1px solid var(--tx-border-color);
    padding-bottom: 12px;
  }
}
</style>
