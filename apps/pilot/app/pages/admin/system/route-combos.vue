<script setup lang="ts">
import type { ChannelModelOptionIndex, RouteComboRouteFormItem } from '~/composables/usePilotRoutingAdmin'
import {
  buildRouteComboPayload,
  createEmptyChannelModelOptionIndex,
  createEmptyRouteCombo,
  createEmptyRouteComboRoute,
  fetchPilotChannelModelOptionIndex,
  fetchPilotRoutingSettings,
  normalizeRouteCombo,
  savePilotRoutingSettings,
  TARGET_TYPE_OPTIONS,
} from '~/composables/usePilotRoutingAdmin'

definePageMeta({
  name: 'RouteCombos',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type RouteComboFormItem = ReturnType<typeof createEmptyRouteCombo>

const loading = ref(false)
const saving = ref(false)
const routeCombos = ref<RouteComboFormItem[]>([])
const channelModelIndex = ref<ChannelModelOptionIndex>(createEmptyChannelModelOptionIndex())

const dialog = reactive<{
  visible: boolean
  mode: 'new' | 'edit'
  submitting: boolean
  sourceId: string
  form: RouteComboFormItem
}>({
  visible: false,
  mode: 'new',
  submitting: false,
  sourceId: '',
  form: createEmptyRouteCombo(),
})

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function resolveTargetTypeLabel(value: string): string {
  return TARGET_TYPE_OPTIONS.find(item => item.value === value)?.label || value
}

function mapFromSettings(rows: RouteComboFormItem[]): RouteComboFormItem[] {
  return rows.map(item => normalizeRouteCombo({
    ...item,
    routes: [...item.routes],
  }))
}

async function fetchSettings() {
  loading.value = true
  try {
    const [data, modelIndex] = await Promise.all([
      fetchPilotRoutingSettings(),
      fetchPilotChannelModelOptionIndex(),
    ])
    routeCombos.value = mapFromSettings(data.routeCombos)
    channelModelIndex.value = modelIndex
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载路由组合失败')
  }
  finally {
    loading.value = false
  }
}

function openCreateDialog() {
  dialog.mode = 'new'
  dialog.sourceId = ''
  dialog.form = createEmptyRouteCombo()
  dialog.visible = true
}

function openEditDialog(item: RouteComboFormItem) {
  dialog.mode = 'edit'
  dialog.sourceId = item.id
  dialog.form = normalizeRouteCombo({
    ...item,
    routes: [...item.routes],
  })
  dialog.visible = true
}

function addRoute() {
  dialog.form.routes.push(createEmptyRouteComboRoute())
}

function removeRoute(index: number) {
  dialog.form.routes.splice(index, 1)
}

const channelOptions = computed(() => {
  return channelModelIndex.value.channels.map((channel) => {
    return {
      value: channel.id,
      label: channel.enabled ? channel.name : `${channel.name}（渠道已禁用）`,
    }
  })
})

function resolveProviderModelOptionLabel(input: {
  modelId: string
  label?: string
  format?: string
  targetType?: string
  legacyStatus?: 'disabled' | 'missing'
}): string {
  const baseLabel = normalizeText(input.label) || normalizeText(input.modelId)
  const format = normalizeText(input.format)
  const targetType = normalizeText(input.targetType)
  const withTarget = targetType && targetType !== 'model'
    ? `${resolveTargetTypeLabel(targetType)} / ${baseLabel}`
    : baseLabel
  const withFormat = format ? `${withTarget} (${format})` : withTarget
  if (input.legacyStatus === 'disabled') {
    return `${withFormat}（已禁用）`
  }
  if (input.legacyStatus === 'missing') {
    return `${withFormat}（不存在）`
  }
  return withFormat
}

interface RouteProviderModelOption {
  value: string
  label: string
  disabled?: boolean
}

function resolveRouteProviderModelOptions(row: RouteComboRouteFormItem): RouteProviderModelOption[] {
  const channelId = normalizeText(row.channelId)
  if (!channelId) {
    return []
  }

  const enabledOptions = channelModelIndex.value.enabledModelOptionsByChannel[channelId] || []
  const allOptions = channelModelIndex.value.allModelOptionsByChannel[channelId] || []
  const filteredEnabledOptions = enabledOptions.filter(item => item.targetType === row.providerTargetType)
  const options = filteredEnabledOptions.map(item => ({
    value: item.modelId,
    label: resolveProviderModelOptionLabel({
      modelId: item.modelId,
      label: item.label,
      format: item.format,
      targetType: item.targetType,
    }),
  }))

  const currentModelId = normalizeText(row.providerModel)
  if (!currentModelId || options.some(item => item.value === currentModelId)) {
    return options
  }

  const legacy = allOptions.find(item => item.modelId === currentModelId && item.targetType === row.providerTargetType)
  options.unshift({
    value: currentModelId,
    label: resolveProviderModelOptionLabel({
      modelId: currentModelId,
      label: legacy?.label || currentModelId,
      format: legacy?.format,
      targetType: legacy?.targetType || row.providerTargetType,
      legacyStatus: legacy ? 'disabled' : 'missing',
    }),
    disabled: true,
  })
  return options
}

function resolveRouteTargetSummary(row: Pick<RouteComboRouteFormItem, 'providerModel' | 'providerTargetType'>): string {
  const providerModel = normalizeText(row.providerModel)
  if (!providerModel) {
    return '-'
  }
  return row.providerTargetType !== 'model'
    ? `${resolveTargetTypeLabel(row.providerTargetType)} / ${providerModel}`
    : providerModel
}

function resolveRoutePreview(row: RouteComboFormItem): string {
  if (!Array.isArray(row.routes) || row.routes.length <= 0) {
    return '无'
  }
  const preview = row.routes
    .slice(0, 2)
    .map(item => resolveRouteTargetSummary(item))
    .filter(Boolean)
  if (preview.length <= 0) {
    return '无'
  }
  return row.routes.length > 2
    ? `${preview.join(' | ')} +${row.routes.length - 2}`
    : preview.join(' | ')
}

function onRouteChannelChanged(row: RouteComboRouteFormItem) {
  row.providerModel = ''
  const channel = channelModelIndex.value.channels.find(item => item.id === normalizeText(row.channelId))
  row.providerTargetType = channel?.adapter === 'coze' ? 'coze_bot' : 'model'
}

function isCozeRoute(row: RouteComboRouteFormItem): boolean {
  return channelModelIndex.value.channels.find(item => item.id === normalizeText(row.channelId))?.adapter === 'coze'
}

function validateDialogForm(): RouteComboFormItem | null {
  const next = normalizeRouteCombo(dialog.form)
  if (!next.id) {
    ElMessage.warning('路由组合 ID 不能为空')
    return null
  }
  if (!next.name) {
    ElMessage.warning('路由组合名称不能为空')
    return null
  }
  for (const route of next.routes) {
    if (!normalizeText(route.channelId)) {
      ElMessage.warning('每条路由都必须填写渠道 ID')
      return null
    }
    if (isCozeRoute(route)) {
      if (!normalizeText(route.providerModel)) {
        ElMessage.warning('Coze 路由必须显式填写目标 ID')
        return null
      }
      if (route.providerTargetType === 'model') {
        ElMessage.warning('Coze 路由必须显式选择目标类型（coze_bot / coze_workflow）')
        return null
      }
    }
  }

  const exists = routeCombos.value.some(item => item.id === next.id)
  if (dialog.mode === 'new' && exists) {
    ElMessage.warning(`路由组合 ID 已存在：${next.id}`)
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
  saving.value = true
  try {
    const next = mapFromSettings(routeCombos.value)
    if (dialog.mode === 'new') {
      next.push(valid)
    }
    else {
      const index = next.findIndex(item => item.id === dialog.sourceId)
      if (index < 0) {
        ElMessage.error('待编辑的路由组合不存在，请刷新后重试')
        return
      }
      next.splice(index, 1, valid)
    }

    const saved = await savePilotRoutingSettings({
      routeCombos: buildRouteComboPayload(next),
    })
    routeCombos.value = mapFromSettings(saved.routeCombos)
    dialog.visible = false
    ElMessage.success('路由组合保存成功')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存路由组合失败')
  }
  finally {
    dialog.submitting = false
    saving.value = false
  }
}

async function deleteCombo(item: RouteComboFormItem) {
  const remain = routeCombos.value.filter(row => row.id !== item.id)
  if (remain.length <= 0) {
    ElMessage.warning('至少保留一个路由组合')
    return
  }

  saving.value = true
  try {
    const saved = await savePilotRoutingSettings({
      routeCombos: buildRouteComboPayload(remain),
    })
    routeCombos.value = mapFromSettings(saved.routeCombos)
    ElMessage.success('路由组合已删除')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除路由组合失败')
  }
  finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <el-container class="RouteCombosPage">
    <el-main>
      <div class="route-combos-toolbar">
        <el-button :loading="loading" @click="fetchSettings">
          刷新
        </el-button>
        <el-button type="primary" @click="openCreateDialog">
          新增路由组合
        </el-button>
      </div>

      <el-table v-loading="loading || saving" border table-layout="auto" :data="routeCombos" style="width: 100%">
        <el-table-column prop="id" label="组合 ID" min-width="180" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="description" label="描述" min-width="240" />
        <el-table-column label="LangGraph 信息" min-width="240">
          <template #default="{ row }">
            <div class="combo-meta-row">
              <span>助手：{{ row.langgraphAssistantId || '-' }}</span>
              <span>配置：{{ row.graphProfile || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="路由明细" min-width="280">
          <template #default="{ row }">
            <div class="combo-meta-row">
              <span>{{ row.routes.length }} 条</span>
              <span>{{ resolveRoutePreview(row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'danger'">
              {{ row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openEditDialog(row)">
              编辑
            </el-button>
            <el-button text type="danger" @click="deleteCombo(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-main>
  </el-container>

  <el-dialog
    v-model="dialog.visible"
    :title="dialog.mode === 'new' ? '新增路由组合' : '编辑路由组合'"
    width="1080px"
    :close-on-click-modal="false"
  >
    <el-form label-width="150px">
      <el-form-item label="组合 ID" required>
        <el-input v-model="dialog.form.id" :disabled="dialog.mode === 'edit'" placeholder="default-auto" />
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="dialog.form.name" placeholder="默认自动路由" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="dialog.form.description" placeholder="默认自动路由组合" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="LangGraph 助手 ID">
            <el-input v-model="dialog.form.langgraphAssistantId" placeholder="assistant-xxx" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="图配置">
            <el-input v-model="dialog.form.graphProfile" placeholder="default" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="回退组合 ID">
            <el-input v-model="dialog.form.fallbackRouteComboId" placeholder="fallback-auto" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="启用">
        <el-switch v-model="dialog.form.enabled" />
      </el-form-item>

      <el-divider content-position="left">
        路由列表
      </el-divider>

      <div class="route-toolbar">
        <el-button type="primary" plain size="small" @click="addRoute">
          新增路由
        </el-button>
      </div>

      <el-table border table-layout="auto" :data="dialog.form.routes" style="width: 100%">
        <el-table-column label="渠道 ID" min-width="180">
          <template #default="{ row }">
            <el-select
              v-model="row.channelId"
              filterable
              clearable
              placeholder="选择渠道"
              style="width: 100%"
              @change="() => onRouteChannelChanged(row)"
            >
              <el-option
                v-for="option in channelOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="模型组 ID" min-width="150">
          <template #default="{ row }">
            <el-input v-model="row.modelId" placeholder="quota-auto" />
          </template>
        </el-table-column>
        <el-table-column label="渠道模型/目标" min-width="220">
          <template #default="{ row }">
            <el-select
              v-model="row.providerModel"
              filterable
              clearable
              :disabled="!row.channelId"
              placeholder="选择渠道模型"
              style="width: 100%"
            >
              <el-option
                v-for="option in resolveRouteProviderModelOptions(row)"
                :key="option.value"
                :label="option.label"
                :value="option.value"
                :disabled="option.disabled === true"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="目标类型" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.providerTargetType"
              style="width: 100%"
              :disabled="!isCozeRoute(row)"
              @change="() => { row.providerModel = '' }"
            >
              <el-option
                v-for="targetType in TARGET_TYPE_OPTIONS"
                :key="targetType.value"
                :label="targetType.label"
                :value="targetType.value"
                :disabled="!isCozeRoute(row) && targetType.value !== 'model'"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.priority" :min="1" :max="9999" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="权重" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.weight" :min="1" :max="1000" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="超时(ms)" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.timeoutMs" :min="3000" :max="600000" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="重试次数" width="100">
          <template #default="{ row }">
            <el-input-number v-model="row.maxRetries" :min="0" :max="5" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="熔断阈值" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.circuitBreakerThreshold" :min="1" :max="10" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ $index }">
            <el-button text type="danger" @click="removeRoute($index)">
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
.route-combos-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.route-toolbar {
  margin-bottom: 8px;
}

.combo-meta-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--el-text-color-secondary);
}
</style>
