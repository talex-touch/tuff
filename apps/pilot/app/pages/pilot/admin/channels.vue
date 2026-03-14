<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  layout: 'pilot',
})

type PilotChannelAdapter = 'legacy' | 'openai'
type PilotChannelTransport = 'responses' | 'chat.completions'
type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls'

interface ChannelFormItem {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  model: string
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  timeoutMs: number
  builtinTools: PilotBuiltinTool[]
  enabled: boolean
}

interface ChannelCatalogResponse {
  defaultChannelId?: string
  channels?: Array<Partial<ChannelFormItem>>
}

const CHANNEL_TOOL_OPTIONS: Array<{ value: PilotBuiltinTool, label: string }> = [
  { value: 'write_todos', label: 'write_todos' },
  { value: 'read_file', label: 'read_file' },
  { value: 'write_file', label: 'write_file' },
  { value: 'edit_file', label: 'edit_file' },
  { value: 'ls', label: 'ls' },
]

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const defaultChannelId = ref('')
const channels = ref<ChannelFormItem[]>([])
let channelSequence = 0

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function createDefaultChannelId(): string {
  channelSequence += 1
  return `channel-${Date.now().toString(36)}-${channelSequence}`
}

function toTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 90_000
  }
  return Math.min(Math.max(Math.floor(parsed), 3_000), 10 * 60 * 1000)
}

function toAdapter(value: unknown): PilotChannelAdapter {
  return normalizeText(value).toLowerCase() === 'openai' ? 'openai' : 'legacy'
}

function toTransport(value: unknown, adapter: PilotChannelAdapter): PilotChannelTransport {
  if (adapter === 'legacy') {
    return 'responses'
  }
  return normalizeText(value).toLowerCase() === 'chat.completions' ? 'chat.completions' : 'responses'
}

function normalizeTools(value: unknown): PilotBuiltinTool[] {
  if (!Array.isArray(value)) {
    return ['write_todos']
  }
  const list = value
    .map(item => normalizeText(item))
    .filter(item => CHANNEL_TOOL_OPTIONS.some(option => option.value === item)) as PilotBuiltinTool[]
  if (list.length <= 0) {
    return ['write_todos']
  }
  return Array.from(new Set(list))
}

function createEmptyChannel(): ChannelFormItem {
  const id = createDefaultChannelId()
  return {
    id,
    name: id,
    baseUrl: '',
    apiKey: '',
    apiKeyMasked: '',
    model: 'gpt-5.2',
    adapter: 'legacy',
    transport: 'responses',
    timeoutMs: 90_000,
    builtinTools: ['write_todos'],
    enabled: true,
  }
}

function normalizeChannelFormItem(raw: Partial<ChannelFormItem>): ChannelFormItem {
  const id = normalizeText(raw.id) || createDefaultChannelId()
  const adapter = toAdapter(raw.adapter)
  return {
    id,
    name: normalizeText(raw.name) || id,
    baseUrl: normalizeText(raw.baseUrl),
    apiKey: '',
    apiKeyMasked: normalizeText(raw.apiKeyMasked),
    model: normalizeText(raw.model) || 'gpt-5.2',
    adapter,
    transport: toTransport(raw.transport, adapter),
    timeoutMs: toTimeoutMs(raw.timeoutMs),
    builtinTools: normalizeTools(raw.builtinTools),
    enabled: raw.enabled !== false,
  }
}

function applyCatalog(data: ChannelCatalogResponse) {
  const mapped = Array.isArray(data.channels)
    ? data.channels.map(item => normalizeChannelFormItem(item || {}))
    : []
  channels.value = mapped

  if (channels.value.length <= 0) {
    channels.value = [createEmptyChannel()]
  }

  const incomingDefault = normalizeText(data.defaultChannelId)
  const fallbackDefault = channels.value.find(item => item.enabled)?.id || channels.value[0]?.id || ''
  defaultChannelId.value = channels.value.some(item => item.id === incomingDefault)
    ? incomingDefault
    : fallbackDefault
}

function syncChannelModel(item: ChannelFormItem) {
  item.adapter = toAdapter(item.adapter)
  item.transport = toTransport(item.transport, item.adapter)
}

function addChannel() {
  const next = createEmptyChannel()
  channels.value.push(next)
  if (!defaultChannelId.value) {
    defaultChannelId.value = next.id
  }
}

function removeChannel(index: number) {
  const removed = channels.value[index]
  channels.value.splice(index, 1)
  if (channels.value.length <= 0) {
    const next = createEmptyChannel()
    channels.value = [next]
  }

  if (!defaultChannelId.value || defaultChannelId.value === removed?.id) {
    defaultChannelId.value = channels.value.find(item => item.enabled)?.id || channels.value[0]?.id || ''
  }
}

function toggleBuiltinTool(item: ChannelFormItem, tool: PilotBuiltinTool, checked: boolean) {
  const source = new Set(item.builtinTools)
  if (checked) {
    source.add(tool)
  }
  else {
    source.delete(tool)
  }
  if (source.size <= 0) {
    source.add('write_todos')
  }
  item.builtinTools = Array.from(source)
}

function validateBeforeSave(): string {
  if (channels.value.length <= 0) {
    return '请至少配置一个渠道。'
  }

  const idSet = new Set<string>()
  for (const item of channels.value) {
    const id = normalizeText(item.id)
    if (!id) {
      return '渠道 ID 不能为空。'
    }
    if (idSet.has(id)) {
      return `渠道 ID 重复：${id}`
    }
    idSet.add(id)

    if (!normalizeText(item.baseUrl)) {
      return `渠道 ${id} 缺少 Base URL。`
    }
    if (!normalizeText(item.model)) {
      return `渠道 ${id} 缺少模型名称。`
    }
  }

  if (!normalizeText(defaultChannelId.value)) {
    return '请选择默认渠道。'
  }

  if (!channels.value.some(item => item.id === defaultChannelId.value)) {
    return '默认渠道不存在，请重新选择。'
  }

  return ''
}

async function loadCatalog() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const payload = await $fetch<{ data?: ChannelCatalogResponse }>('/api/pilot/admin/channels', {
      headers: {
        Accept: 'application/json',
      },
    })
    applyCatalog(payload?.data || {})
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载渠道配置失败'
  }
  finally {
    loading.value = false
  }
}

async function saveCatalog() {
  errorMessage.value = ''
  successMessage.value = ''
  const validation = validateBeforeSave()
  if (validation) {
    errorMessage.value = validation
    return
  }

  saving.value = true
  try {
    const payload = await $fetch<{ data?: ChannelCatalogResponse }>('/api/pilot/admin/channels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: {
        defaultChannelId: defaultChannelId.value,
        channels: channels.value.map(item => ({
          id: normalizeText(item.id),
          name: normalizeText(item.name),
          baseUrl: normalizeText(item.baseUrl),
          apiKey: normalizeText(item.apiKey),
          model: normalizeText(item.model),
          adapter: item.adapter,
          transport: toTransport(item.transport, item.adapter),
          timeoutMs: toTimeoutMs(item.timeoutMs),
          builtinTools: normalizeTools(item.builtinTools),
          enabled: item.enabled,
        })),
      },
    })
    applyCatalog(payload?.data || {})
    successMessage.value = '渠道配置已保存。'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存渠道配置失败'
  }
  finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadCatalog()
})
</script>

<template>
  <main class="pilot-admin-channels">
    <section class="pilot-admin-channels__panel">
      <header class="pilot-admin-channels__header">
        <h1>Pilot 渠道配置</h1>
        <div class="pilot-admin-channels__links">
          <a href="/pilot/admin/storage">存储配置</a>
          <a href="/">返回聊天页</a>
        </div>
      </header>

      <p class="pilot-admin-channels__desc">
        配置可用模型渠道。默认渠道用于未指定 channel_id 的请求。
      </p>

      <div v-if="loading" class="pilot-admin-channels__hint">
        正在加载渠道配置...
      </div>

      <form v-else class="pilot-admin-channels__form" @submit.prevent="saveCatalog">
        <label class="pilot-admin-channels__field">
          <span>默认渠道</span>
          <select v-model="defaultChannelId">
            <option v-for="item in channels" :key="item.id" :value="item.id">
              {{ item.name || item.id }} ({{ item.id }})
            </option>
          </select>
        </label>

        <div class="pilot-admin-channels__cards">
          <article
            v-for="(item, index) in channels"
            :key="`${item.id}-${index}`"
            class="pilot-admin-channels__card"
          >
            <header class="pilot-admin-channels__card-header">
              <h2>渠道 {{ index + 1 }}</h2>
              <button type="button" @click="removeChannel(index)">
                删除
              </button>
            </header>

            <div class="pilot-admin-channels__card-grid">
              <label class="pilot-admin-channels__field">
                <span>渠道 ID</span>
                <input v-model="item.id" placeholder="default">
              </label>

              <label class="pilot-admin-channels__field">
                <span>显示名称</span>
                <input v-model="item.name" placeholder="Default Channel">
              </label>

              <label class="pilot-admin-channels__field">
                <span>Base URL</span>
                <input v-model="item.baseUrl" placeholder="https://api.openai.com/v1" type="url">
              </label>

              <label class="pilot-admin-channels__field">
                <span>模型</span>
                <input v-model="item.model" placeholder="gpt-5.2">
              </label>

              <label class="pilot-admin-channels__field">
                <span>Adapter</span>
                <select v-model="item.adapter" @change="syncChannelModel(item)">
                  <option value="legacy">
                    legacy
                  </option>
                  <option value="openai">
                    openai
                  </option>
                </select>
              </label>

              <label class="pilot-admin-channels__field">
                <span>Transport</span>
                <select v-model="item.transport" :disabled="item.adapter === 'legacy'" @change="syncChannelModel(item)">
                  <option value="responses">
                    responses
                  </option>
                  <option value="chat.completions">
                    chat.completions
                  </option>
                </select>
              </label>

              <label class="pilot-admin-channels__field">
                <span>Timeout (ms)</span>
                <input v-model.number="item.timeoutMs" type="number" min="3000" max="600000" step="1000">
              </label>

              <label class="pilot-admin-channels__field pilot-admin-channels__field--checkbox">
                <input v-model="item.enabled" type="checkbox">
                <span>启用该渠道</span>
              </label>

              <label class="pilot-admin-channels__field pilot-admin-channels__field--full">
                <span>
                  API Key
                  <template v-if="item.apiKeyMasked">
                    (已保存: {{ item.apiKeyMasked }}，留空则保持不变)
                  </template>
                </span>
                <input v-model="item.apiKey" type="password" autocomplete="new-password" placeholder="sk-...">
              </label>

              <fieldset class="pilot-admin-channels__tools pilot-admin-channels__field--full">
                <legend>内置工具</legend>
                <label
                  v-for="tool in CHANNEL_TOOL_OPTIONS"
                  :key="tool.value"
                  class="pilot-admin-channels__tool-item"
                >
                  <input
                    :checked="item.builtinTools.includes(tool.value)"
                    type="checkbox"
                    @change="toggleBuiltinTool(item, tool.value, ($event.target as HTMLInputElement).checked)"
                  >
                  <span>{{ tool.label }}</span>
                </label>
              </fieldset>
            </div>
          </article>
        </div>

        <div class="pilot-admin-channels__actions">
          <button type="button" class="pilot-admin-channels__ghost-btn" @click="addChannel">
            新增渠道
          </button>
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中...' : '保存配置' }}
          </button>
        </div>

        <p v-if="errorMessage" class="pilot-admin-channels__error">
          {{ errorMessage }}
        </p>
        <p v-if="successMessage" class="pilot-admin-channels__success">
          {{ successMessage }}
        </p>
      </form>
    </section>
  </main>
</template>

<style scoped>
.pilot-admin-channels {
  min-height: 100dvh;
  padding: 24px 16px;
  background: var(--tx-bg-color-page);
  color: var(--tx-text-color-primary);
}

.pilot-admin-channels__panel {
  width: min(980px, 100%);
  margin: 0 auto;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 88%, transparent);
  padding: 18px;
}

.pilot-admin-channels__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.pilot-admin-channels__header h1 {
  margin: 0;
  font-size: 20px;
}

.pilot-admin-channels__links {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.pilot-admin-channels__desc {
  margin: 10px 0 18px;
  color: var(--tx-text-color-secondary);
}

.pilot-admin-channels__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pilot-admin-channels__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pilot-admin-channels__field--checkbox {
  flex-direction: row;
  align-items: center;
}

.pilot-admin-channels__field--checkbox input {
  width: auto;
}

.pilot-admin-channels__field--full {
  grid-column: 1 / -1;
}

.pilot-admin-channels__field input,
.pilot-admin-channels__field select {
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 42%, transparent);
  color: var(--tx-text-color-primary);
}

.pilot-admin-channels__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pilot-admin-channels__card {
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--tx-fill-color-lighter) 40%, transparent);
}

.pilot-admin-channels__card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.pilot-admin-channels__card-header h2 {
  margin: 0;
  font-size: 15px;
}

.pilot-admin-channels__card-header button {
  border: 1px solid color-mix(in srgb, var(--tx-color-danger) 45%, transparent);
  border-radius: 8px;
  padding: 6px 10px;
  background: transparent;
  color: var(--tx-color-danger);
  cursor: pointer;
}

.pilot-admin-channels__card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pilot-admin-channels__tools {
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pilot-admin-channels__tools legend {
  padding: 0 6px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.pilot-admin-channels__tool-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pilot-admin-channels__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.pilot-admin-channels__actions button {
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  background: color-mix(in srgb, var(--tx-color-primary) 88%, transparent);
  color: #fff;
  cursor: pointer;
}

.pilot-admin-channels__actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pilot-admin-channels__actions .pilot-admin-channels__ghost-btn {
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 42%, transparent);
  color: var(--tx-text-color-primary);
}

.pilot-admin-channels__hint,
.pilot-admin-channels__error,
.pilot-admin-channels__success {
  margin: 0;
  font-size: 13px;
}

.pilot-admin-channels__error {
  color: var(--tx-color-danger);
}

.pilot-admin-channels__success {
  color: var(--tx-color-success);
}

@media (max-width: 900px) {
  .pilot-admin-channels {
    padding: 14px 12px;
  }

  .pilot-admin-channels__panel {
    padding: 14px;
  }

  .pilot-admin-channels__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .pilot-admin-channels__links {
    flex-wrap: wrap;
  }

  .pilot-admin-channels__card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
