<script setup lang="ts">
import { endHttp } from '~/composables/api/axios'

definePageMeta({
  name: 'Channels',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type PilotChannelAdapter = 'legacy' | 'openai'
type PilotChannelTransport = 'responses' | 'chat.completions'
type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls' | 'websearch'

interface ChannelModelFormItem {
  id: string
  label: string
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

const loading = ref(false)
const saving = ref(false)
const channels = ref<ChannelFormItem[]>([])
const defaultChannelId = ref('')
let channelSequence = 0
let channelModelSequence = 0

const dialog = reactive<{
  visible: boolean
  mode: 'new' | 'edit'
  submitting: boolean
  sourceId: string
  form: ChannelFormItem
}>({
  visible: false,
  mode: 'new',
  submitting: false,
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
    enabled: raw.enabled !== false,
    thinkingSupported: raw.thinkingSupported !== false,
    thinkingDefaultEnabled: raw.thinkingDefaultEnabled === true,
  }
}

function createEmptyChannelModel(id = ''): ChannelModelFormItem {
  return normalizeChannelModel({
    id: normalizeText(id) || createDefaultChannelModelId(),
    label: normalizeText(id) || 'gpt-5.2',
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
    model: firstModel.id,
    defaultModelId: firstModel.id,
    models: [firstModel],
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
  const models = Array.isArray(raw.models) && raw.models.length > 0
    ? raw.models.map(item => normalizeChannelModel(item || {}))
    : [createEmptyChannelModel(normalizeText(raw.defaultModelId || raw.model || 'gpt-5.2'))]
  const item: ChannelFormItem = {
    id,
    name: normalizeText(raw.name) || id,
    baseUrl: normalizeText(raw.baseUrl),
    apiKey: normalizeText(raw.apiKey),
    apiKeyMasked: normalizeText(raw.apiKeyMasked),
    model: normalizeText(raw.model),
    defaultModelId: normalizeText(raw.defaultModelId) || normalizeText(raw.model),
    models,
    adapter,
    transport: toTransport(raw.transport, adapter),
    timeoutMs: toTimeoutMs(raw.timeoutMs),
    builtinTools: normalizeTools(raw.builtinTools),
    enabled: raw.enabled !== false,
  }
  ensureDefaultModelId(item)
  return item
}

function resolveDefaultChannelId(list: ChannelFormItem[], preferred?: string): string {
  const preferredId = normalizeText(preferred)
  if (preferredId && list.some(item => item.id === preferredId)) {
    return preferredId
  }

  const current = normalizeText(defaultChannelId.value)
  if (current && list.some(item => item.id === current)) {
    return current
  }

  const enabled = list.find(item => item.enabled)
  if (enabled) {
    return enabled.id
  }
  return list[0]?.id || ''
}

function applyChannelSettings(payload: any) {
  const incoming = Array.isArray(payload?.channels) ? payload.channels : []
  const mapped = incoming.map((item: any) => normalizeChannelFormItem(item || {}))
  channels.value = mapped
  defaultChannelId.value = resolveDefaultChannelId(mapped, payload?.defaultChannelId)
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
  const ordered = [...list].sort((a, b) => a.id.localeCompare(b.id))
  return {
    defaultChannelId: resolveDefaultChannelId(ordered),
    channels: ordered.map(item => ({
      id: item.id,
      name: item.name,
      baseUrl: item.baseUrl,
      apiKey: item.apiKey,
      model: item.defaultModelId,
      defaultModelId: item.defaultModelId,
      models: item.models.map(model => ({
        id: model.id,
        label: model.label,
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

async function saveChannels(nextChannels: ChannelFormItem[], preferredDefault = ''): Promise<boolean> {
  const resolvedDefault = resolveDefaultChannelId(nextChannels, preferredDefault)
  saving.value = true
  try {
    const res: any = await endHttp.post('admin/settings', {
      channels: {
        ...buildSavePayload(nextChannels),
        defaultChannelId: resolvedDefault,
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
      defaultChannelId.value = resolveDefaultChannelId(channels.value, resolvedDefault)
    }

    ElMessage.success('Channels 保存成功')
    return true
  }
  finally {
    saving.value = false
  }
}

function openCreateDialog() {
  dialog.mode = 'new'
  dialog.sourceId = ''
  dialog.form = createEmptyChannel()
  dialog.visible = true
}

function openEditDialog(row: ChannelFormItem) {
  dialog.mode = 'edit'
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

function onAdapterChange() {
  dialog.form.adapter = toAdapter(dialog.form.adapter)
  dialog.form.transport = toTransport(dialog.form.transport, dialog.form.adapter)
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

    const preferredDefault = dialog.mode === 'new' && !defaultChannelId.value
      ? valid.id
      : defaultChannelId.value
    const saved = await saveChannels(next, preferredDefault)
    if (saved) {
      dialog.visible = false
    }
  }
  finally {
    dialog.submitting = false
  }
}

async function setDefaultChannel(id: string) {
  const nextId = normalizeText(id)
  if (!nextId || nextId === defaultChannelId.value) {
    return
  }
  const next = channels.value.map(item => normalizeChannelFormItem(item))
  await saveChannels(next, nextId)
}

function resolveEnabledModelList(row: ChannelFormItem): string {
  const enabled = row.models.filter(item => item.enabled)
  if (enabled.length <= 0) {
    return '-'
  }
  return enabled.map(item => item.label || item.id).join(', ')
}

function resolveModelList(row: ChannelFormItem): string {
  if (row.models.length <= 0) {
    return '-'
  }
  return row.models.map(item => item.label || item.id).join(', ')
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
        <el-table-column label="模型列表" min-width="220">
          <template #default="{ row }">
            {{ resolveModelList(row) }}
          </template>
        </el-table-column>
        <el-table-column label="启用模型" min-width="220">
          <template #default="{ row }">
            {{ resolveEnabledModelList(row) }}
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
            <el-tag :type="row.enabled ? 'success' : 'danger'">
              {{ row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="默认" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.id === defaultChannelId" type="success">
              默认
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="190">
          <template #default="{ row }">
            <el-button text type="primary" @click="openEditDialog(row)">
              编辑
            </el-button>
            <el-button text :disabled="row.id === defaultChannelId" @click="setDefaultChannel(row.id)">
              设为默认
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-main>
  </el-container>

  <el-dialog
    v-model="dialog.visible"
    :title="dialog.mode === 'new' ? '新增渠道' : '编辑渠道'"
    width="980px"
    :close-on-click-modal="false"
  >
    <el-form label-width="130px">
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
        <el-col :span="8">
          <el-form-item label="适配器">
            <el-select v-model="dialog.form.adapter" style="width: 100%" @change="onAdapterChange">
              <el-option label="legacy" value="legacy" />
              <el-option label="openai" value="openai" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="传输协议">
            <el-select v-model="dialog.form.transport" style="width: 100%" :disabled="dialog.form.adapter === 'legacy'">
              <el-option label="responses" value="responses" />
              <el-option label="chat.completions" value="chat.completions" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
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
      </div>

      <el-table border table-layout="auto" :data="dialog.form.models" style="width: 100%">
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
      <el-button type="primary" :loading="dialog.submitting || saving" @click="submitDialog">
        保存
      </el-button>
    </template>
  </el-dialog>
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
}
</style>
