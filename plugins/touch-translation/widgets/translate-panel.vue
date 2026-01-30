<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useChannel, useClipboard, usePluginInfo, usePluginStorage } from '@talex-touch/utils/plugin/sdk'

type ProviderStatus = 'pending' | 'success' | 'error'
type WidgetStatus = 'idle' | 'running' | 'complete' | 'error'

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

const storage = usePluginStorage()
const channel = useChannel()
const clipboard = useClipboard()
const pluginInfo = usePluginInfo('[Translation Widget] Plugin info not available')

const pluginName = computed(() => (typeof pluginInfo.name === 'string' ? pluginInfo.name : ''))
const history = ref<HistoryItem[]>([])
const lastSavedRequestId = ref<string | null>(null)

const resolvedPayload = computed<TranslationWidgetPayload | null>(() => {
  if (props.payload && typeof props.payload === 'object') {
    return props.payload as TranslationWidgetPayload
  }

  const custom = props.item?.render?.custom?.data
  if (custom && typeof custom === 'object') {
    return custom as TranslationWidgetPayload
  }

  return null
})

const status = computed<WidgetStatus>(() => resolvedPayload.value?.status || 'idle')
const query = computed(() => resolvedPayload.value?.query?.trim() || '')
const providers = computed(() => resolvedPayload.value?.providers || [])
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

async function loadHistory(): Promise<void> {
  try {
    const saved = await storage.getFile('history')
    if (Array.isArray(saved)) {
      history.value = saved
    }
  }
  catch (error) {
    void error
    history.value = []
  }
}

async function saveHistory(): Promise<void> {
  try {
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

  const existingIndex = history.value.findIndex(item => item.text === text)
  const item: HistoryItem = {
    id: Date.now(),
    text: text.trim(),
    timestamp: Date.now(),
    results,
  }

  if (existingIndex > -1) {
    history.value.splice(existingIndex, 1)
  }

  history.value.unshift(item)
  if (history.value.length > 10) {
    history.value = history.value.slice(0, 10)
  }

  saveHistory().catch((err) => {
    void err
  })
}

function removeHistoryItem(id: number): void {
  const index = history.value.findIndex(item => item.id === id)
  if (index > -1) {
    history.value.splice(index, 1)
    saveHistory().catch((err) => {
      void err
    })
  }
}

function clearHistory(): void {
  history.value = []
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
      return
    }

    const results = (payload.providers || [])
      .filter(provider => provider.status === 'success' && provider.translatedText)
      .map(provider => ({
        providerId: provider.id,
        providerName: provider.name,
        text: provider.translatedText || '',
        from: provider.from,
        to: provider.to,
        provider: provider.provider,
        model: provider.model,
      }))

    if (results.length === 0) {
      return
    }

    lastSavedRequestId.value = payload.requestId || null
    addToHistory(payload.query, results)
  },
  { deep: true },
)

async function useHistoryItem(text: string): Promise<void> {
  if (!text.trim()) {
    return
  }

  try {
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
  loadHistory().catch((err) => {
    void err
  })
})
</script>

<template>
  <div class="TranslationWidget" :data-plugin="pluginName">
    <aside class="TranslationWidget__history">
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
        <button
          v-for="historyItem in history"
          :key="historyItem.id"
          class="TranslationWidget__history-item"
          type="button"
          @click="useHistoryItem(historyItem.text)"
        >
          <div class="TranslationWidget__history-text" :title="historyItem.text">
            {{ historyItem.text }}
          </div>
          <div class="TranslationWidget__history-meta">
            <span>{{ formatTime(historyItem.timestamp) }}</span>
            <span>{{ historyItem.results?.length || 0 }} 个结果</span>
          </div>
          <button
            class="TranslationWidget__history-remove"
            type="button"
            @click.stop="removeHistoryItem(historyItem.id)"
          >
            ×
          </button>
        </button>
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
        <div class="TranslationWidget__status" :class="`is-${status}`">
          {{ statusLabel }}
        </div>
      </header>

      <div v-if="status === 'idle'" class="TranslationWidget__placeholder">
        输入文本后将展示翻译详情与多源结果
      </div>

      <div v-else class="TranslationWidget__providers">
        <div v-if="errorMessage" class="TranslationWidget__error">
          {{ errorMessage }}
        </div>

        <div
          v-for="provider in providers"
          :key="provider.id"
          class="TranslationWidget__provider"
        >
          <div class="TranslationWidget__provider-header">
            <span class="TranslationWidget__provider-name">{{ provider.name }}</span>
            <span class="TranslationWidget__provider-status" :class="`is-${provider.status}`">
              {{ providerStatusLabel(provider) }}
            </span>
            <button
              v-if="provider.status === 'success' && provider.translatedText"
              class="TranslationWidget__copy"
              type="button"
              @click="copyResult(provider.translatedText)"
            >
              复制
            </button>
          </div>
          <div class="TranslationWidget__provider-body">
            <template v-if="provider.status === 'success'">
              {{ provider.translatedText }}
            </template>
            <template v-else-if="provider.status === 'error'">
              {{ provider.error || '翻译失败' }}
            </template>
            <template v-else>
              翻译中...
            </template>
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

        <div v-if="!providers.length && !hasResults" class="TranslationWidget__placeholder">
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
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
  min-height: 280px;
}

.TranslationWidget__history {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--el-border-color);
  padding-right: 12px;
}

.TranslationWidget__history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.TranslationWidget__history-clear {
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 12px;
  cursor: pointer;
}

.TranslationWidget__history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
  max-height: 360px;
}

.TranslationWidget__history-item {
  position: relative;
  border: 1px solid transparent;
  background: rgba(64, 158, 255, 0.08);
  padding: 10px 28px 10px 10px;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.TranslationWidget__history-item:hover {
  border-color: rgba(64, 158, 255, 0.3);
  background: rgba(64, 158, 255, 0.14);
}

.TranslationWidget__history-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.TranslationWidget__history-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.TranslationWidget__history-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
}

.TranslationWidget__history-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
}

.TranslationWidget__query-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-top: 2px;
}

.TranslationWidget__status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(64, 158, 255, 0.15);
  color: var(--el-color-primary);
}

.TranslationWidget__status.is-error {
  background: rgba(245, 108, 108, 0.15);
  color: var(--el-color-danger);
}

.TranslationWidget__providers {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.TranslationWidget__provider {
  border-radius: 14px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color-overlay);
  padding: 12px;
}

.TranslationWidget__provider-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.TranslationWidget__provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.TranslationWidget__provider-status {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.TranslationWidget__provider-status.is-error {
  color: var(--el-color-danger);
}

.TranslationWidget__copy {
  margin-left: auto;
  border: none;
  background: var(--el-color-primary);
  color: #fff;
  border-radius: 999px;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}

.TranslationWidget__provider-body {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.5;
  min-height: 20px;
}

.TranslationWidget__provider-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.TranslationWidget__placeholder {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 8px 0;
}

.TranslationWidget__error {
  font-size: 12px;
  color: var(--el-color-danger);
  background: rgba(245, 108, 108, 0.12);
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
    border-bottom: 1px solid var(--el-border-color);
    padding-bottom: 12px;
  }
}
</style>
