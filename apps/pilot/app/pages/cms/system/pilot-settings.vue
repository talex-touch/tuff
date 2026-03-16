<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

definePageMeta({
  name: 'Pilot 设置',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
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

interface StorageForm {
  attachmentProvider: 'auto' | 'memory' | 's3'
  attachmentPublicBaseUrl: string
  minioEndpoint: string
  minioBucket: string
  minioRegion: string
  minioForcePathStyle: boolean
  minioPublicBaseUrl: string
  minioAccessKey: string
  minioAccessKeyMasked: string
  minioSecretKey: string
  minioSecretKeyMasked: string
  hasMinioAccessKey: boolean
  hasMinioSecretKey: boolean
  clearMinioAccessKey: boolean
  clearMinioSecretKey: boolean
}

interface PilotSettingsResponse {
  settings?: {
    channels?: {
      defaultChannelId?: string
      channels?: Array<Partial<ChannelFormItem>>
    }
    storage?: Partial<StorageForm>
  }
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

const storage = reactive<StorageForm>({
  attachmentProvider: 'auto',
  attachmentPublicBaseUrl: '',
  minioEndpoint: '',
  minioBucket: '',
  minioRegion: 'us-east-1',
  minioForcePathStyle: true,
  minioPublicBaseUrl: '',
  minioAccessKey: '',
  minioAccessKeyMasked: '',
  minioSecretKey: '',
  minioSecretKeyMasked: '',
  hasMinioAccessKey: false,
  hasMinioSecretKey: false,
  clearMinioAccessKey: false,
  clearMinioSecretKey: false,
})

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

function applyChannelSettings(payload: PilotSettingsResponse['settings']) {
  const rows = Array.isArray(payload?.channels?.channels)
    ? payload?.channels?.channels
    : []
  const mapped = rows.map(item => normalizeChannelFormItem(item || {}))
  channels.value = mapped.length > 0 ? mapped : [createEmptyChannel()]

  const incomingDefault = normalizeText(payload?.channels?.defaultChannelId)
  const fallbackDefault = channels.value.find(item => item.enabled)?.id || channels.value[0]?.id || ''
  defaultChannelId.value = channels.value.some(item => item.id === incomingDefault)
    ? incomingDefault
    : fallbackDefault
}

function applyStorageSettings(payload: PilotSettingsResponse['settings']) {
  const next = payload?.storage || {}
  storage.attachmentProvider = (next.attachmentProvider as StorageForm['attachmentProvider']) || 'auto'
  storage.attachmentPublicBaseUrl = normalizeText(next.attachmentPublicBaseUrl)
  storage.minioEndpoint = normalizeText(next.minioEndpoint)
  storage.minioBucket = normalizeText(next.minioBucket)
  storage.minioRegion = normalizeText(next.minioRegion) || 'us-east-1'
  storage.minioForcePathStyle = next.minioForcePathStyle !== false
  storage.minioPublicBaseUrl = normalizeText(next.minioPublicBaseUrl)
  storage.minioAccessKeyMasked = normalizeText(next.minioAccessKeyMasked)
  storage.minioSecretKeyMasked = normalizeText(next.minioSecretKeyMasked)
  storage.hasMinioAccessKey = Boolean(next.hasMinioAccessKey)
  storage.hasMinioSecretKey = Boolean(next.hasMinioSecretKey)
  storage.minioAccessKey = ''
  storage.minioSecretKey = ''
  storage.clearMinioAccessKey = false
  storage.clearMinioSecretKey = false
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
    if (!normalizeText(item.apiKey) && !normalizeText(item.apiKeyMasked)) {
      return `渠道 ${id} 缺少 API Key。`
    }
  }

  if (!normalizeText(defaultChannelId.value)) {
    return '请选择默认渠道。'
  }

  if (!channels.value.some(item => item.id === defaultChannelId.value)) {
    return '默认渠道不存在，请重新选择。'
  }

  if (storage.attachmentProvider === 's3' && !normalizeText(storage.minioEndpoint)) {
    return 'attachmentProvider=s3 时需要填写 MinIO Endpoint。'
  }

  return ''
}

async function loadSettings() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const payload = await $fetch<PilotSettingsResponse>('/api/pilot/admin/settings', {
      headers: {
        accept: 'application/json',
      },
    })
    applyChannelSettings(payload.settings)
    applyStorageSettings(payload.settings)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载 Pilot 设置失败'
  }
  finally {
    loading.value = false
  }
}

async function saveSettings() {
  errorMessage.value = ''
  successMessage.value = ''
  const validation = validateBeforeSave()
  if (validation) {
    errorMessage.value = validation
    return
  }

  saving.value = true
  try {
    const payload = await $fetch<PilotSettingsResponse>('/api/pilot/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: {
        channels: {
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
        storage: {
          attachmentProvider: storage.attachmentProvider,
          attachmentPublicBaseUrl: storage.attachmentPublicBaseUrl,
          minioEndpoint: storage.minioEndpoint,
          minioBucket: storage.minioBucket,
          minioAccessKey: storage.minioAccessKey,
          clearMinioAccessKey: storage.clearMinioAccessKey,
          minioSecretKey: storage.minioSecretKey,
          clearMinioSecretKey: storage.clearMinioSecretKey,
          minioRegion: storage.minioRegion,
          minioForcePathStyle: storage.minioForcePathStyle,
          minioPublicBaseUrl: storage.minioPublicBaseUrl,
        },
      },
    })

    applyChannelSettings(payload.settings)
    applyStorageSettings(payload.settings)
    successMessage.value = 'Pilot Settings 保存成功。'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败'
  }
  finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<template>
  <main class="pilot-settings-page">
    <section v-loading="loading" class="pilot-settings-panel">
      <header class="pilot-settings-header">
        <h1>Pilot Settings</h1>
        <p>统一管理 Channels 与 Storage（配置 SoT 仍为 pilot_admin_settings）</p>
      </header>

      <form class="pilot-settings-form" @submit.prevent="saveSettings">
        <section class="pilot-section">
          <h2>Channels</h2>
          <label class="pilot-field">
            <span>默认渠道</span>
            <select v-model="defaultChannelId">
              <option v-for="item in channels" :key="item.id" :value="item.id">
                {{ item.name || item.id }} ({{ item.id }})
              </option>
            </select>
          </label>

          <div class="pilot-channel-list">
            <article v-for="(item, index) in channels" :key="`${item.id}-${index}`" class="pilot-channel-card">
              <header class="pilot-channel-header">
                <h3>渠道 {{ index + 1 }}</h3>
                <button type="button" @click="removeChannel(index)">
                  删除
                </button>
              </header>

              <div class="pilot-channel-grid">
                <label class="pilot-field">
                  <span>渠道 ID</span>
                  <input v-model="item.id" placeholder="default">
                </label>

                <label class="pilot-field">
                  <span>显示名称</span>
                  <input v-model="item.name" placeholder="Default Channel">
                </label>

                <label class="pilot-field">
                  <span>Base URL</span>
                  <input v-model="item.baseUrl" type="url" placeholder="https://api.openai.com/v1">
                </label>

                <label class="pilot-field">
                  <span>模型</span>
                  <input v-model="item.model" placeholder="gpt-5.2">
                </label>

                <label class="pilot-field">
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

                <label class="pilot-field">
                  <span>Transport</span>
                  <select v-model="item.transport">
                    <option value="responses">
                      responses
                    </option>
                    <option v-if="item.adapter === 'openai'" value="chat.completions">
                      chat.completions
                    </option>
                  </select>
                </label>

                <label class="pilot-field">
                  <span>Timeout (ms)</span>
                  <input v-model.number="item.timeoutMs" type="number" min="3000" max="600000" step="1000">
                </label>

                <label class="pilot-field">
                  <span>API Key {{ item.apiKeyMasked ? `(当前：${item.apiKeyMasked})` : '' }}</span>
                  <input v-model="item.apiKey" autocomplete="off" placeholder="留空则保持不变">
                </label>

                <label class="pilot-field pilot-field--checkbox">
                  <input v-model="item.enabled" type="checkbox">
                  <span>启用该渠道</span>
                </label>
              </div>

              <div class="pilot-tools">
                <span>内置工具</span>
                <label v-for="tool in CHANNEL_TOOL_OPTIONS" :key="tool.value">
                  <input
                    :checked="item.builtinTools.includes(tool.value)"
                    type="checkbox"
                    @change="toggleBuiltinTool(item, tool.value, ($event.target as HTMLInputElement).checked)"
                  >
                  <span>{{ tool.label }}</span>
                </label>
              </div>
            </article>
          </div>

          <button type="button" class="pilot-add-btn" @click="addChannel">
            + 新增渠道
          </button>
        </section>

        <section class="pilot-section">
          <h2>Storage</h2>

          <label class="pilot-field">
            <span>附件存储 Provider</span>
            <select v-model="storage.attachmentProvider">
              <option value="auto">
                auto（优先 MinIO，失败回退）
              </option>
              <option value="memory">
                memory
              </option>
              <option value="s3">
                s3/minio
              </option>
            </select>
          </label>

          <label class="pilot-field">
            <span>附件公网 Base URL（可选）</span>
            <input v-model="storage.attachmentPublicBaseUrl" placeholder="https://pilot.example.com" type="url">
          </label>

          <label class="pilot-field">
            <span>MinIO Endpoint</span>
            <input v-model="storage.minioEndpoint" placeholder="https://minio.example.com" type="url">
          </label>

          <label class="pilot-field">
            <span>Bucket</span>
            <input v-model="storage.minioBucket" placeholder="pilot-attachments">
          </label>

          <label class="pilot-field">
            <span>Access Key {{ storage.hasMinioAccessKey ? `(当前：${storage.minioAccessKeyMasked || '已设置'})` : '' }}</span>
            <input v-model="storage.minioAccessKey" autocomplete="off" placeholder="留空则保持不变">
          </label>

          <label class="pilot-field pilot-field--checkbox">
            <input v-model="storage.clearMinioAccessKey" type="checkbox">
            <span>清空已保存 Access Key</span>
          </label>

          <label class="pilot-field">
            <span>Secret Key {{ storage.hasMinioSecretKey ? `(当前：${storage.minioSecretKeyMasked || '已设置'})` : '' }}</span>
            <input v-model="storage.minioSecretKey" type="password" autocomplete="new-password" placeholder="留空则保持不变">
          </label>

          <label class="pilot-field pilot-field--checkbox">
            <input v-model="storage.clearMinioSecretKey" type="checkbox">
            <span>清空已保存 Secret Key</span>
          </label>

          <label class="pilot-field">
            <span>Region</span>
            <input v-model="storage.minioRegion" placeholder="us-east-1">
          </label>

          <label class="pilot-field pilot-field--checkbox">
            <input v-model="storage.minioForcePathStyle" type="checkbox">
            <span>Force Path Style</span>
          </label>

          <label class="pilot-field">
            <span>MinIO Public Base URL（可选）</span>
            <input v-model="storage.minioPublicBaseUrl" placeholder="https://files.example.com/pilot-attachments" type="url">
          </label>
        </section>

        <p v-if="errorMessage" class="pilot-error">
          {{ errorMessage }}
        </p>
        <p v-if="successMessage" class="pilot-success">
          {{ successMessage }}
        </p>

        <button type="submit" class="pilot-submit" :disabled="saving">
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.pilot-settings-page {
  padding: 18px;
}

.pilot-settings-panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #ececec;
  padding: 18px;
}

.pilot-settings-header h1 {
  margin: 0;
  font-size: 20px;
}

.pilot-settings-header p {
  margin: 8px 0 0;
  color: #666;
}

.pilot-settings-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 14px;
}

.pilot-section {
  border: 1px solid #efefef;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pilot-section h2 {
  margin: 0;
  font-size: 16px;
}

.pilot-channel-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pilot-channel-card {
  border: 1px solid #ececec;
  border-radius: 8px;
  padding: 10px;
}

.pilot-channel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.pilot-channel-header h3 {
  margin: 0;
  font-size: 14px;
}

.pilot-channel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pilot-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pilot-field input,
.pilot-field select {
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 8px;
}

.pilot-field--checkbox {
  flex-direction: row;
  align-items: center;
}

.pilot-tools {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.pilot-tools label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pilot-add-btn,
.pilot-submit,
.pilot-channel-header button {
  width: fit-content;
  border: 1px solid #d8d8d8;
  border-radius: 6px;
  padding: 6px 12px;
  background: #fff;
  cursor: pointer;
}

.pilot-submit {
  background: #111827;
  color: #fff;
  border-color: #111827;
}

.pilot-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pilot-error {
  color: #d03050;
  margin: 0;
}

.pilot-success {
  color: #2d8a34;
  margin: 0;
}

@media (max-width: 900px) {
  .pilot-channel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
