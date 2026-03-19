<script setup lang="ts">
import { endHttp } from '~/composables/api/axios'

definePageMeta({
  name: 'Channels',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type PilotChannelAdapter = 'openai'
type PilotChannelTransport = 'responses' | 'chat.completions'
type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls' | 'websearch'

interface ChannelModelFormItem {
  id: string
  label: string
  format: string
  enabled: boolean
  thinkingSupported: boolean
  thinkingDefaultEnabled: boolean
}

interface ChannelFormItem {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  priority: number
  model: string
  defaultModelId: string
  models: ChannelModelFormItem[]
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  timeoutMs: number
  builtinTools: PilotBuiltinTool[]
  enabled: boolean
}

const TOOL_OPTIONS: Array<{ value: PilotBuiltinTool, label: string }> = [
  { value: 'write_todos', label: 'write_todos' },
  { value: 'read_file', label: 'read_file' },
  { value: 'write_file', label: 'write_file' },
  { value: 'edit_file', label: 'edit_file' },
  { value: 'ls', label: 'ls' },
  { value: 'websearch', label: 'websearch' },
]

const MODEL_FORMAT_OPTIONS = [
  'responses',
  'chat.completions',
]

const loading = ref(false)
const saving = ref(false)
const channels = ref<ChannelFormItem[]>([])
let channelSequence = 0
let channelModelSequence = 0

const dialog = reactive<{
  visible: boolean
  mode: 'new' | 'edit'
  submitting: boolean
  modelSyncing: boolean
  sourceId: string
  form: ChannelFormItem
}>({
  visible: false,
  mode: 'new',
  submitting: false,
  modelSyncing: false,
  sourceId: '',
  form: createEmptyChannel(),
})

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function createDefaultChannelId(): string {
  channelSequence += 1
  return `channel-${Date.now().toString(36)}-${channelSequence}`
}

function createDefaultChannelModelId(): string {
  channelModelSequence += 1
  return `model-${Date.now().toString(36)}-${channelModelSequence}`
}

function toTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 90_000
  }
  return Math.min(Math.max(Math.floor(parsed), 3_000), 10 * 60 * 1000)
}

function toPriority(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 100
  }
  return Math.min(Math.max(Math.floor(parsed), 1), 9999)
}

function toAdapter(_value: unknown): PilotChannelAdapter {
  return 'openai'
}

function toTransport(value: unknown): PilotChannelTransport {
  return normalizeText(value).toLowerCase() === 'chat.completions' ? 'chat.completions' : 'responses'
}

function normalizeTools(value: unknown): PilotBuiltinTool[] {
  if (!Array.isArray(value)) {
    return ['write_todos']
  }
  const list = value
    .map(item => normalizeText(item))
    .filter(item => TOOL_OPTIONS.some(option => option.value === item)) as PilotBuiltinTool[]
  if (list.length <= 0) {
    return ['write_todos']
  }
  return Array.from(new Set(list))
}

function normalizeChannelModel(raw: Partial<ChannelModelFormItem>): ChannelModelFormItem {
  const id = normalizeText(raw.id) || createDefaultChannelModelId()
  return {
    id,
    label: normalizeText(raw.label) || id,
    format: normalizeText(raw.format),
    enabled: raw.enabled !== false,
    thinkingSupported: raw.thinkingSupported !== false,
    thinkingDefaultEnabled: raw.thinkingDefaultEnabled === true,
  }
}

function createEmptyChannelModel(id = '', format = ''): ChannelModelFormItem {
  return normalizeChannelModel({
    id: normalizeText(id) || createDefaultChannelModelId(),
    label: normalizeText(id) || 'gpt-5.2',
    format: normalizeText(format),
    enabled: true,
    thinkingSupported: true,
    thinkingDefaultEnabled: false,
  })
}

function ensureDefaultModelId(item: ChannelFormItem) {
  const preferred = normalizeText(item.defaultModelId || item.model)
  if (preferred && item.models.some(model => model.id === preferred)) {
    item.defaultModelId = preferred
    item.model = preferred
    return
  }
  const fallback = item.models.find(model => model.enabled)?.id || item.models[0]?.id || 'gpt-5.2'
  item.defaultModelId = fallback
  item.model = fallback
}

function createEmptyChannel(): ChannelFormItem {
  const id = createDefaultChannelId()
  const firstModel = createEmptyChannelModel('gpt-5.2')
  return {
    id,
    name: id,
    baseUrl: '',
    apiKey: '',
    apiKeyMasked: '',
    priority: 100,
    model: firstModel.id,
    defaultModelId: firstModel.id,
    models: [firstModel],
    adapter: 'openai',
    transport: 'responses',
    timeoutMs: 90_000,
    builtinTools: ['write_todos'],
    enabled: true,
  }
}

function normalizeChannelFormItem(raw: Partial<ChannelFormItem>): ChannelFormItem {
  const id = normalizeText(raw.id) || createDefaultChannelId()
  const adapter = toAdapter(raw.adapter)
  const models = Array.isArray(raw.models) && raw.models.length > 0
    ? raw.models.map(item => normalizeChannelModel(item || {}))
    : [createEmptyChannelModel(normalizeText(raw.defaultModelId || raw.model || 'gpt-5.2'))]
  const item: ChannelFormItem = {
    id,
    name: normalizeText(raw.name) || id,
    baseUrl: normalizeText(raw.baseUrl),
    apiKey: normalizeText(raw.apiKey),
    apiKeyMasked: normalizeText(raw.apiKeyMasked),
    priority: toPriority(raw.priority),
    model: normalizeText(raw.model),
    defaultModelId: normalizeText(raw.defaultModelId) || normalizeText(raw.model),
    models,
    adapter,
    transport: toTransport(raw.transport),
    timeoutMs: toTimeoutMs(raw.timeoutMs),
    builtinTools: normalizeTools(raw.builtinTools),
    enabled: raw.enabled !== false,
  }
  ensureDefaultModelId(item)
  return item
}

function applyChannelSettings(payload: any) {
  const incoming = Array.isArray(payload?.channels) ? payload.channels : []
  const mapped = incoming.map((item: any) => normalizeChannelFormItem(item || {}))
  channels.value = mapped
}

async function fetchSettings() {
  loading.value = true
  try {
    const res: any = await endHttp.get('admin/settings')
    const payload = res?.settings?.channels
    if (!payload) {
      ElMessage.error(res?.message || '加载 Channels 失败')
      return
    }
    applyChannelSettings(payload)
  }
  finally {
    loading.value = false
  }
}

function buildSavePayload(list: ChannelFormItem[]) {
  const ordered = [...list].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    return a.id.localeCompare(b.id)
  })
  return {
    channels: ordered.map(item => ({
      id: item.id,
      name: item.name,
      baseUrl: item.baseUrl,
      apiKey: item.apiKey,
      priority: item.priority,
      model: item.defaultModelId,
      defaultModelId: item.defaultModelId,
      models: item.models.map(model => ({
        id: model.id,
        label: model.label,
        format: normalizeText(model.format) || undefined,
        enabled: model.enabled,
        thinkingSupported: model.thinkingSupported,
        thinkingDefaultEnabled: model.thinkingDefaultEnabled,
      })),
      adapter: item.adapter,
      transport: item.transport,
      timeoutMs: item.timeoutMs,
      builtinTools: item.builtinTools,
      enabled: item.enabled,
    })),
  }
}

async function saveChannels(
  nextChannels: ChannelFormItem[],
  options: {
    successMessage?: string
    silentSuccess?: boolean
  } = {},
): Promise<boolean> {
  saving.value = true
  try {
    const res: any = await endHttp.post('admin/settings', {
      channels: {
        ...buildSavePayload(nextChannels),
      },
    })
    if (!res?.ok) {
      ElMessage.error(res?.message || '保存 Channels 失败')
      return false
    }

    const payload = res?.settings?.channels
    if (payload) {
      applyChannelSettings(payload)
    }
    else {
      channels.value = nextChannels.map(item => normalizeChannelFormItem(item))
    }

    if (!options.silentSuccess) {
      ElMessage.success(options.successMessage || 'Channels 保存成功')
    }
    return true
  }
  finally {
    saving.value = false
  }
}

function openCreateDialog() {
  dialog.mode = 'new'
  dialog.modelSyncing = false
  dialog.sourceId = ''
  dialog.form = createEmptyChannel()
  dialog.visible = true
}

function openEditDialog(row: ChannelFormItem) {
  dialog.mode = 'edit'
  dialog.modelSyncing = false
  dialog.sourceId = row.id
  dialog.form = normalizeChannelFormItem({
    ...row,
    apiKey: '',
    builtinTools: [...row.builtinTools],
    models: row.models.map(model => ({
      ...model,
    })),
  })
  dialog.visible = true
}

function addDialogModel() {
  dialog.form.models.push(createEmptyChannelModel())
  ensureDefaultModelId(dialog.form)
}

function removeDialogModel(index: number) {
  dialog.form.models.splice(index, 1)
  if (dialog.form.models.length <= 0) {
    dialog.form.models.push(createEmptyChannelModel('gpt-5.2'))
  }
  ensureDefaultModelId(dialog.form)
}

function validateDialogForm(): ChannelFormItem | null {
  const next = normalizeChannelFormItem(dialog.form)
  if (!next.id) {
    ElMessage.warning('渠道 ID 不能为空')
    return null
  }
  if (!next.baseUrl) {
    ElMessage.warning('Base URL 不能为空')
    return null
  }
  if (next.models.length <= 0) {
    ElMessage.warning('请至少配置一个渠道模型')
    return null
  }
  if (!next.defaultModelId) {
    ElMessage.warning('请设置默认模型')
    return null
  }

  const modelIds = new Set<string>()
  for (const model of next.models) {
    if (!normalizeText(model.id)) {
      ElMessage.warning('模型 ID 不能为空')
      return null
    }
    if (modelIds.has(model.id)) {
      ElMessage.warning(`模型 ID 重复：${model.id}`)
      return null
    }
    modelIds.add(model.id)
  }

  if (!next.apiKey && !next.apiKeyMasked && dialog.mode === 'new') {
    ElMessage.warning('新增渠道必须填写 API Key')
    return null
  }

  if (dialog.mode === 'new' && channels.value.some(item => item.id === next.id)) {
    ElMessage.warning(`渠道 ID 已存在：${next.id}`)
    return null
  }
  return next
}

async function submitDialog() {
  const valid = validateDialogForm()
  if (!valid) {
    return
  }

  dialog.submitting = true
  try {
    const next = channels.value.map(item => normalizeChannelFormItem(item))
    if (dialog.mode === 'new') {
      next.push(valid)
    }
    else {
      const index = next.findIndex(item => item.id === dialog.sourceId)
      if (index < 0) {
        ElMessage.error('待编辑渠道不存在，请刷新后重试')
        return
      }
      next.splice(index, 1, valid)
    }

    const saved = await saveChannels(next)
    if (saved) {
      dialog.visible = false
    }
  }
  finally {
    dialog.submitting = false
  }
}

async function toggleChannelStatus(channelId: string, value: boolean) {
  const nextId = normalizeText(channelId)
  if (!nextId) {
    return
  }
  const next = channels.value.map(item => normalizeChannelFormItem(item))
  const target = next.find(item => item.id === nextId)
  if (!target || target.enabled === value) {
    return
  }
  target.enabled = value

  const saved = await saveChannels(next, {
    successMessage: value ? '渠道已启用' : '渠道已禁用',
  })
  if (!saved) {
    await fetchSettings()
  }
}

async function updateChannelPriority(channelId: string, value: unknown) {
  const nextId = normalizeText(channelId)
  if (!nextId) {
    return
  }
  const nextPriority = toPriority(value)
  const next = channels.value.map(item => normalizeChannelFormItem(item))
  const target = next.find(item => item.id === nextId)
  if (!target || target.priority === nextPriority) {
    return
  }
  target.priority = nextPriority

  const saved = await saveChannels(next, {
    successMessage: `优先级已更新为 ${nextPriority}`,
  })
  if (!saved) {
    await fetchSettings()
  }
}

async function deleteChannel(row: ChannelFormItem) {
  const id = normalizeText(row.id)
  if (!id) {
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除渠道「${row.name || id}」吗？删除后不可恢复。`,
      '删除渠道',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  }
  catch {
    return
  }

  const next = channels.value
    .map(item => normalizeChannelFormItem(item))
    .filter(item => item.id !== id)
  const saved = await saveChannels(next, {
    successMessage: '渠道已删除',
  })
  if (!saved) {
    await fetchSettings()
  }
}

async function discoverDialogModels() {
  const baseUrl = normalizeText(dialog.form.baseUrl)
  if (!baseUrl) {
    ElMessage.warning('请先填写 Base URL 再拉取模型')
    return
  }

  if (dialog.mode === 'new' && !normalizeText(dialog.form.apiKey)) {
    ElMessage.warning('新增渠道请先填写 API Key，再拉取模型')
    return
  }

  dialog.modelSyncing = true
  try {
    const payload: any = await endHttp.post('admin/channel-models/discover', {
      channelId: dialog.mode === 'edit' ? normalizeText(dialog.sourceId || dialog.form.id) : undefined,
      baseUrl,
      apiKey: normalizeText(dialog.form.apiKey),
      timeoutMs: dialog.form.timeoutMs,
    })

    const discovered = Array.isArray(payload?.models)
      ? payload.models.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : []
    if (discovered.length <= 0) {
      ElMessage.warning('未发现可用模型')
      return
    }

    const existing = new Map<string, ChannelModelFormItem>()
    for (const model of dialog.form.models) {
      const normalized = normalizeChannelModel(model)
      existing.set(normalized.id, normalized)
    }

    let appended = 0
    for (const modelId of discovered) {
      if (existing.has(modelId)) {
        continue
      }
      appended += 1
      existing.set(modelId, createEmptyChannelModel(modelId, dialog.form.transport))
    }

    dialog.form.models = Array.from(existing.values())
    ensureDefaultModelId(dialog.form)

    ElMessage.success(`模型拉取完成，共 ${discovered.length} 个，新增 ${appended} 个`)
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '拉取渠道模型失败')
  }
  finally {
    dialog.modelSyncing = false
  }
}

function resolveModelCount(row: ChannelFormItem): number {
  return Array.isArray(row.models) ? row.models.length : 0
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <el-container class="CmsChannels">
    <el-main>
      <div class="channels-toolbar">
        <el-button :loading="loading" @click="fetchSettings">
          刷新
        </el-button>
        <el-button type="primary" @click="openCreateDialog">
          新增渠道
        </el-button>
      </div>

      <el-table v-loading="loading || saving" border table-layout="auto" :data="channels" style="width: 100%">
        <el-table-column prop="id" label="ID" min-width="170" />
        <el-table-column prop="name" label="名称" min-width="130" />
        <el-table-column prop="baseUrl" label="Base URL" min-width="220" />
        <el-table-column label="优先级" width="160">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.priority"
              :min="1"
              :max="9999"
              :step="1"
              controls-position="right"
              :disabled="loading || saving"
              @change="(value) => updateChannelPriority(row.id, value)"
            />
          </template>
        </el-table-column>
        <el-table-column label="模型" min-width="180">
          <template #default="{ row }">
            <div class="model-overview-cell">
              <span>共计 {{ resolveModelCount(row) }} 个模型</span>
              <el-button text type="primary" @click="openEditDialog(row)">
                总览
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="默认模型" min-width="140">
          <template #default="{ row }">
            {{ row.defaultModelId }}
          </template>
        </el-table-column>
        <el-table-column label="适配器" width="110">
          <template #default="{ row }">
            <el-tag>{{ row.adapter }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="95">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              :disabled="loading || saving"
              @change="(value) => toggleChannelStatus(row.id, Boolean(value))"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="250">
          <template #default="{ row }">
            <el-button text type="primary" @click="openEditDialog(row)">
              编辑
            </el-button>
            <el-button text type="danger" :disabled="loading || saving" @click="deleteChannel(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-main>
  </el-container>

  <el-drawer
    v-model="dialog.visible"
    :title="dialog.mode === 'new' ? '新增渠道' : '编辑渠道'"
    size="72%"
    direction="rtl"
    :close-on-click-modal="false"
    :destroy-on-close="false"
    class="channel-editor-drawer"
  >
    <el-form label-width="130px" class="channel-editor-form">
      <el-form-item label="渠道 ID" required>
        <el-input v-model="dialog.form.id" :disabled="dialog.mode === 'edit'" placeholder="channel-main" />
      </el-form-item>
      <el-form-item label="名称">
        <el-input v-model="dialog.form.name" placeholder="显示名称" />
      </el-form-item>
      <el-form-item label="Base URL" required>
        <el-input v-model="dialog.form.baseUrl" placeholder="https://api.openai.com/v1" />
      </el-form-item>
      <el-form-item label="API Key" :required="dialog.mode === 'new'">
        <el-input
          v-model="dialog.form.apiKey"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="dialog.form.apiKeyMasked ? `留空保持不变（当前：${dialog.form.apiKeyMasked}）` : '输入 API Key'"
        />
      </el-form-item>

      <el-row :gutter="12">
        <el-col :span="6">
          <el-form-item label="适配器">
            <el-input v-model="dialog.form.adapter" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="传输协议">
            <el-select v-model="dialog.form.transport" style="width: 100%">
              <el-option label="responses" value="responses" />
              <el-option label="chat.completions" value="chat.completions" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="优先级">
            <el-input-number v-model="dialog.form.priority" :min="1" :max="9999" :step="1" controls-position="right" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="超时(ms)">
            <el-input-number v-model="dialog.form.timeoutMs" :min="3000" :max="600000" :step="1000" controls-position="right" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="默认模型" required>
        <el-select v-model="dialog.form.defaultModelId" style="width: 100%">
          <el-option v-for="model in dialog.form.models" :key="model.id" :label="model.label || model.id" :value="model.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="内置工具">
        <el-checkbox-group v-model="dialog.form.builtinTools">
          <el-checkbox v-for="tool in TOOL_OPTIONS" :key="tool.value" :value="tool.value">
            {{ tool.label }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="启用渠道">
        <el-switch v-model="dialog.form.enabled" />
      </el-form-item>

      <el-divider content-position="left">
        渠道模型列表
      </el-divider>

      <div class="channel-model-toolbar">
        <el-button type="primary" plain size="small" @click="addDialogModel">
          新增模型
        </el-button>
        <el-button
          plain
          size="small"
          :loading="dialog.modelSyncing"
          @click="discoverDialogModels"
        >
          {{ dialog.modelSyncing ? '拉取中...' : '拉取渠道模型' }}
        </el-button>
      </div>

      <el-table
        border
        table-layout="auto"
        :data="dialog.form.models"
        row-key="id"
        max-height="460"
        style="width: 100%"
      >
        <el-table-column label="Model ID" min-width="180">
          <template #default="{ row }">
            <el-input v-model="row.id" placeholder="gpt-5.4" />
          </template>
        </el-table-column>
        <el-table-column label="Label" min-width="180">
          <template #default="{ row }">
            <el-input v-model="row.label" placeholder="GPT 5.4" />
          </template>
        </el-table-column>
        <el-table-column label="格式" min-width="180">
          <template #default="{ row }">
            <el-select
              v-model="row.format"
              style="width: 100%"
              filterable
              allow-create
              clearable
              default-first-option
              placeholder="如 responses"
            >
              <el-option
                v-for="format in MODEL_FORMAT_OPTIONS"
                :key="format"
                :label="format"
                :value="format"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="thinkingSupported" width="150">
          <template #default="{ row }">
            <el-switch v-model="row.thinkingSupported" />
          </template>
        </el-table-column>
        <el-table-column label="thinkingDefaultEnabled" width="170">
          <template #default="{ row }">
            <el-switch v-model="row.thinkingDefaultEnabled" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ $index }">
            <el-button text type="danger" @click="removeDialogModel($index)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-form>

    <template #footer>
      <el-button @click="dialog.visible = false">
        取消
      </el-button>
      <el-button type="primary" :loading="dialog.submitting || saving || dialog.modelSyncing" @click="submitDialog">
        保存
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
.channels-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.channel-model-toolbar {
  margin-bottom: 8px;
  display: flex;
  gap: 8px;
}

.model-overview-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.channel-editor-form {
  padding-right: 8px;
}
</style>
