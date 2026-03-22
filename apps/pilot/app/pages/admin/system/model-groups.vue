<script setup lang="ts">
import type {
  ChannelModelOptionIndex,
  ModelBindingFormItem,
  PilotCapabilityMeta,
  PilotModelTemplateId,
  RouteComboFormItem,
} from '~/composables/usePilotRoutingAdmin'
import { isPilotRouteComboIdValid } from '~~/shared/pilot-capability-meta'
import {
  applyModelGroupTemplate,
  buildModelGroupPayload,
  BUILTIN_TOOL_OPTIONS,
  createEmptyBinding,
  createEmptyChannelModelOptionIndex,
  createEmptyModelGroup,
  fetchPilotChannelModelOptionIndex,
  fetchPilotRoutingSettings,
  ICON_TYPE_OPTIONS,
  MODEL_SOURCE_OPTIONS,
  normalizeModelGroup,
  PILOT_CAPABILITY_GROUP_LABELS,
  PILOT_CAPABILITY_META,
  PILOT_MODEL_TEMPLATE_PRESETS,
  savePilotRoutingSettings,
  syncPilotChannelModels,
} from '~/composables/usePilotRoutingAdmin'

definePageMeta({
  name: 'ModelGroups',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type ModelGroupFormItem = ReturnType<typeof createEmptyModelGroup>
const PROTECTED_MODEL_GROUP_IDS = new Set(['quota-auto'])

const loading = ref(false)
const saving = ref(false)
const syncing = ref(false)
const modelGroups = ref<ModelGroupFormItem[]>([])
const routeCombos = ref<RouteComboFormItem[]>([])
const channelModelIndex = ref<ChannelModelOptionIndex>(createEmptyChannelModelOptionIndex())
const modelGroupsTableRef = ref<any>(null)
const selectedModelGroupIds = ref<string[]>([])
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  pageSizes: [10, 20, 50, 100],
})

const dialog = reactive<{
  visible: boolean
  mode: 'new' | 'edit'
  submitting: boolean
  sourceId: string
  form: ModelGroupFormItem
}>({
  visible: false,
  mode: 'new',
  submitting: false,
  sourceId: '',
  form: createEmptyModelGroup(),
})

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function summarizeCapabilities(item: ModelGroupFormItem): string {
  const labels: string[] = []
  if (item.thinkingSupported) {
    labels.push(item.thinkingDefaultEnabled ? '思考（默认开）' : '思考')
  }
  for (const capability of PILOT_CAPABILITY_META) {
    if (item.capabilities[capability.id]) {
      labels.push(`${capability.label}(${capability.id})`)
    }
  }
  return labels.length > 0 ? labels.join(' / ') : '无'
}

function mapFromSettings(rows: ModelGroupFormItem[]): ModelGroupFormItem[] {
  return rows.map(item => normalizeModelGroup({
    ...item,
    bindings: [...item.bindings],
  }))
}

const pagedModelGroups = computed(() => {
  const start = (pagination.currentPage - 1) * pagination.pageSize
  return modelGroups.value.slice(start, start + pagination.pageSize)
})

const selectedModelGroupCount = computed(() => {
  if (selectedModelGroupIds.value.length <= 0) {
    return 0
  }
  const idSet = new Set(modelGroups.value.map(item => item.id))
  return selectedModelGroupIds.value.filter(id => idSet.has(id)).length
})

const selectedProtectedModelGroupIds = computed(() => {
  const selectedSet = new Set(selectedModelGroupIds.value)
  return modelGroups.value
    .filter(item => selectedSet.has(item.id) && isProtectedModelGroupId(item.id))
    .map(item => item.id)
})

const selectedDeletableModelGroupCount = computed(() => {
  return Math.max(0, selectedModelGroupCount.value - selectedProtectedModelGroupIds.value.length)
})

const routeComboIdSet = computed(() => new Set(routeCombos.value.map(item => normalizeText(item.id))))

const routeComboOptions = computed(() => {
  const options = routeCombos.value.map(item => ({
    value: item.id,
    label: `${item.name} (${item.id})`,
    disabled: item.enabled === false,
  }))
  const currentId = normalizeText(dialog.form.defaultRouteComboId)
  if (currentId && !routeComboIdSet.value.has(currentId)) {
    options.unshift({
      value: currentId,
      label: `${currentId}（已失效，请替换）`,
      disabled: true,
    })
  }
  return options
})

const routeComboInvalid = computed(() => {
  const currentId = normalizeText(dialog.form.defaultRouteComboId)
  return !isPilotRouteComboIdValid(currentId, routeComboIdSet.value)
})

interface CapabilitySection {
  key: keyof typeof PILOT_CAPABILITY_GROUP_LABELS
  label: string
  items: PilotCapabilityMeta[]
}

const capabilitySections = computed<CapabilitySection[]>(() => {
  const groupOrder: CapabilitySection['key'][] = ['retrieval', 'image', 'audio', 'video']
  return groupOrder.map((group) => {
    return {
      key: group,
      label: PILOT_CAPABILITY_GROUP_LABELS[group],
      items: PILOT_CAPABILITY_META.filter(item => item.group === group),
    }
  }).filter(section => section.items.length > 0)
})

function isProtectedModelGroupId(id: string): boolean {
  return PROTECTED_MODEL_GROUP_IDS.has(normalizeText(id).toLowerCase())
}

function syncSelectionToTableRows() {
  const table = modelGroupsTableRef.value
  if (!table) {
    return
  }
  const selectedSet = new Set(selectedModelGroupIds.value)
  table.clearSelection()
  for (const row of pagedModelGroups.value) {
    if (selectedSet.has(row.id)) {
      table.toggleRowSelection(row, true)
    }
  }
}

function keepPaginationInRange() {
  const maxPage = Math.max(1, Math.ceil(modelGroups.value.length / pagination.pageSize))
  if (pagination.currentPage > maxPage) {
    pagination.currentPage = maxPage
  }
}

async function fetchSettings() {
  loading.value = true
  try {
    const [data, modelIndex] = await Promise.all([
      fetchPilotRoutingSettings(),
      fetchPilotChannelModelOptionIndex(),
    ])
    modelGroups.value = mapFromSettings(data.modelCatalog)
    routeCombos.value = data.routeCombos
    channelModelIndex.value = modelIndex
    keepPaginationInRange()
    await nextTick()
    syncSelectionToTableRows()
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载模型组失败')
  }
  finally {
    loading.value = false
  }
}

function openCreateDialog() {
  dialog.mode = 'new'
  dialog.sourceId = ''
  dialog.form = createEmptyModelGroup()
  applyTemplatePreset('general-chat')
  dialog.visible = true
}

function openEditDialog(item: ModelGroupFormItem) {
  dialog.mode = 'edit'
  dialog.sourceId = item.id
  dialog.form = normalizeModelGroup({
    ...item,
    bindings: [...item.bindings],
  })
  dialog.visible = true
}

function applyTemplatePreset(templateId: PilotModelTemplateId) {
  applyModelGroupTemplate(dialog.form, templateId)
}

function addBinding() {
  dialog.form.bindings.push(createEmptyBinding())
}

function removeBinding(index: number) {
  dialog.form.bindings.splice(index, 1)
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
  legacyStatus?: 'disabled' | 'missing'
}): string {
  const baseLabel = normalizeText(input.label) || normalizeText(input.modelId)
  const format = normalizeText(input.format)
  const withFormat = format ? `${baseLabel} (${format})` : baseLabel
  if (input.legacyStatus === 'disabled') {
    return `${withFormat}（已禁用）`
  }
  if (input.legacyStatus === 'missing') {
    return `${withFormat}（不存在）`
  }
  return withFormat
}

function resolveBindingProviderModelOptions(row: ModelBindingFormItem): Array<{
  value: string
  label: string
  disabled?: boolean
}> {
  const channelId = normalizeText(row.channelId)
  if (!channelId) {
    return []
  }

  const enabledOptions = channelModelIndex.value.enabledModelOptionsByChannel[channelId] || []
  const allOptions = channelModelIndex.value.allModelOptionsByChannel[channelId] || []
  const options: Array<{ value: string, label: string, disabled?: boolean }> = enabledOptions.map(item => ({
    value: item.modelId,
    label: resolveProviderModelOptionLabel({
      modelId: item.modelId,
      label: item.label,
      format: item.format,
    }),
  }))

  const currentModelId = normalizeText(row.providerModel)
  if (!currentModelId || options.some(item => item.value === currentModelId)) {
    return options
  }

  const legacy = allOptions.find(item => item.modelId === currentModelId)
  options.unshift({
    value: currentModelId,
    label: resolveProviderModelOptionLabel({
      modelId: currentModelId,
      label: legacy?.label || currentModelId,
      format: legacy?.format,
      legacyStatus: legacy ? 'disabled' : 'missing',
    }),
    disabled: true,
  })
  return options
}

function onBindingChannelChanged(row: ModelBindingFormItem) {
  row.providerModel = ''
}

function validateDialogForm(): ModelGroupFormItem | null {
  const next = normalizeModelGroup(dialog.form)
  if (!next.id) {
    ElMessage.warning('模型组 ID 不能为空')
    return null
  }
  if (!next.name) {
    ElMessage.warning('模型组名称不能为空')
    return null
  }
  if (!next.iconValue) {
    ElMessage.warning('请配置模型组 icon')
    return null
  }
  for (const binding of next.bindings) {
    if (!normalizeText(binding.channelId) || !normalizeText(binding.providerModel)) {
      ElMessage.warning('模型映射必须填写 channelId 和 providerModel')
      return null
    }
  }
  if (!isPilotRouteComboIdValid(next.defaultRouteComboId, routeComboIdSet.value)) {
    ElMessage.warning('默认 Route Combo 不存在，请选择有效组合')
    return null
  }

  const exists = modelGroups.value.some(item => item.id === next.id)
  if (dialog.mode === 'new' && exists) {
    ElMessage.warning(`模型组 ID 已存在：${next.id}`)
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
    const next = mapFromSettings(modelGroups.value)
    if (dialog.mode === 'new') {
      next.push(valid)
    }
    else {
      const index = next.findIndex(item => item.id === dialog.sourceId)
      if (index < 0) {
        ElMessage.error('待编辑模型组不存在，请刷新后重试')
        return
      }
      next.splice(index, 1, valid)
    }

    const saved = await savePilotRoutingSettings({
      modelCatalog: buildModelGroupPayload(next),
    })
    modelGroups.value = mapFromSettings(saved.modelCatalog)
    routeCombos.value = saved.routeCombos
    keepPaginationInRange()
    dialog.visible = false
    ElMessage.success('模型组保存成功')
    await nextTick()
    syncSelectionToTableRows()
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存模型组失败')
  }
  finally {
    dialog.submitting = false
    saving.value = false
  }
}

async function deleteGroup(item: ModelGroupFormItem) {
  if (isProtectedModelGroupId(item.id)) {
    ElMessage.warning(`模型组 ${item.id} 为系统保留项，不能删除`)
    return
  }

  const remain = modelGroups.value.filter(row => row.id !== item.id)
  if (remain.length <= 0) {
    ElMessage.warning('至少保留一个模型组')
    return
  }

  saving.value = true
  try {
    const saved = await savePilotRoutingSettings({
      modelCatalog: buildModelGroupPayload(remain),
    })
    modelGroups.value = mapFromSettings(saved.modelCatalog)
    routeCombos.value = saved.routeCombos
    selectedModelGroupIds.value = selectedModelGroupIds.value.filter(id => id !== item.id)
    keepPaginationInRange()
    ElMessage.success('模型组已删除')
    await nextTick()
    syncSelectionToTableRows()
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除模型组失败')
  }
  finally {
    saving.value = false
  }
}

function handleSelectionChange(selection: ModelGroupFormItem[]) {
  const currentPageIdSet = new Set(pagedModelGroups.value.map(item => item.id))
  const next = selectedModelGroupIds.value.filter(id => !currentPageIdSet.has(id))
  for (const row of selection) {
    next.push(row.id)
  }
  selectedModelGroupIds.value = Array.from(new Set(next))
}

async function deleteSelectedGroups() {
  const selectedCount = selectedDeletableModelGroupCount.value
  if (selectedCount <= 0) {
    ElMessage.warning('请先选择可删除的模型组')
    return
  }

  const selectedIdSet = new Set(selectedModelGroupIds.value)
  const deletableSelectedIdSet = new Set(
    modelGroups.value
      .filter(item => selectedIdSet.has(item.id) && !isProtectedModelGroupId(item.id))
      .map(item => item.id),
  )
  if (deletableSelectedIdSet.size <= 0) {
    ElMessage.warning('所选模型组均为系统保留项，不能删除')
    return
  }
  const remain = modelGroups.value.filter(item => !deletableSelectedIdSet.has(item.id))
  if (remain.length <= 0) {
    ElMessage.warning('至少保留一个模型组')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定删除已选择的 ${selectedCount} 个模型组吗？`,
      '批量删除模型组',
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

  saving.value = true
  try {
    const saved = await savePilotRoutingSettings({
      modelCatalog: buildModelGroupPayload(remain),
    })
    modelGroups.value = mapFromSettings(saved.modelCatalog)
    routeCombos.value = saved.routeCombos
    selectedModelGroupIds.value = selectedModelGroupIds.value.filter(id => !deletableSelectedIdSet.has(id))
    keepPaginationInRange()
    if (selectedProtectedModelGroupIds.value.length > 0) {
      ElMessage.warning(`已跳过系统保留模型组：${selectedProtectedModelGroupIds.value.join(', ')}`)
    }
    ElMessage.success(`已删除 ${selectedCount} 个模型组`)
    await nextTick()
    syncSelectionToTableRows()
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量删除模型组失败')
  }
  finally {
    saving.value = false
  }
}

async function syncModels() {
  syncing.value = true
  try {
    const result = await syncPilotChannelModels()
    await fetchSettings()
    ElMessage.success([
      '同步完成',
      `渠道 ${result.successChannels}/${result.totalChannels}`,
      `发现模型 ${result.discoveredModelCount}`,
      `失败 ${result.failedChannels}`,
    ].join(' | '))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '同步渠道模型失败')
  }
  finally {
    syncing.value = false
  }
}

onMounted(() => {
  fetchSettings()
})

watch(() => pagination.pageSize, () => {
  pagination.currentPage = 1
})

watch(() => [pagination.currentPage, pagination.pageSize, modelGroups.value.length], async () => {
  keepPaginationInRange()
  await nextTick()
  syncSelectionToTableRows()
})

watch(() => modelGroups.value, (rows) => {
  const validIds = new Set(rows.map(item => item.id))
  selectedModelGroupIds.value = selectedModelGroupIds.value.filter(id => validIds.has(id))
}, { deep: false })

watch(() => dialog.form.thinkingSupported, (enabled) => {
  if (!enabled) {
    dialog.form.thinkingDefaultEnabled = false
  }
})

watch(() => dialog.form.capabilities.websearch, (enabled) => {
  if (enabled) {
    return
  }
  dialog.form.builtinTools = dialog.form.builtinTools.filter(tool => tool !== 'websearch')
})
</script>

<template>
  <el-container class="ModelGroupsPage">
    <el-main>
      <div class="model-groups-toolbar">
        <el-button :loading="loading" @click="fetchSettings">
          刷新
        </el-button>
        <el-button :loading="syncing" @click="syncModels">
          {{ syncing ? '同步中...' : '同步渠道模型' }}
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="selectedDeletableModelGroupCount <= 0 || loading || saving"
          @click="deleteSelectedGroups"
        >
          批量删除{{ selectedDeletableModelGroupCount > 0 ? `(${selectedDeletableModelGroupCount})` : '' }}
        </el-button>
        <el-button type="primary" @click="openCreateDialog">
          新增模型组
        </el-button>
      </div>

      <el-table
        ref="modelGroupsTableRef"
        v-loading="loading || saving"
        border
        table-layout="auto"
        :data="pagedModelGroups"
        row-key="id"
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" :reserve-selection="true" width="46" />
        <el-table-column prop="id" label="组 ID" min-width="170" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column label="Icon" width="160">
          <template #default="{ row }">
            <el-tag size="small">
              {{ row.iconType }}
            </el-tag>
            <span class="icon-value">{{ row.iconValue }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="120" />
        <el-table-column label="模型映射" width="120">
          <template #default="{ row }">
            {{ row.bindings.length }} 条
          </template>
        </el-table-column>
        <el-table-column label="评分(Q/S/C)" width="180">
          <template #default="{ row }">
            {{ row.qualityScore }} / {{ row.speedScore }} / {{ row.costScore }}
          </template>
        </el-table-column>
        <el-table-column label="能力" min-width="220">
          <template #default="{ row }">
            {{ summarizeCapabilities(row) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
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
            <el-button
              text
              type="danger"
              :disabled="isProtectedModelGroupId(row.id)"
              @click="deleteGroup(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="model-groups-pagination">
        <el-pagination
          v-model:current-page="pagination.currentPage"
          v-model:page-size="pagination.pageSize"
          :disabled="loading || saving"
          :page-sizes="pagination.pageSizes"
          :total="modelGroups.length"
          layout="total, sizes, prev, pager, next, jumper"
        />
      </div>
    </el-main>
  </el-container>

  <el-dialog
    v-model="dialog.visible"
    :title="dialog.mode === 'new' ? '新增模型组' : '编辑模型组'"
    width="980px"
    :close-on-click-modal="false"
  >
    <el-form label-width="140px">
      <el-form-item label="模型组 ID" required>
        <el-input v-model="dialog.form.id" :disabled="dialog.mode === 'edit'" placeholder="quota-auto" />
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="dialog.form.name" placeholder="Quota Auto" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="dialog.form.description" placeholder="速度优先自动路由" />
      </el-form-item>
      <el-form-item label="模板预设">
        <div class="template-presets">
          <el-button
            v-for="preset in PILOT_MODEL_TEMPLATE_PRESETS"
            :key="preset.id"
            size="small"
            plain
            @click="applyTemplatePreset(preset.id)"
          >
            {{ preset.label }}
          </el-button>
        </div>
        <div class="form-helper">
          应用后会覆盖“推理策略 + 能力矩阵”，你仍可继续手动微调。
        </div>
      </el-form-item>

      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="来源">
            <el-select v-model="dialog.form.source" style="width: 100%">
              <el-option v-for="source in MODEL_SOURCE_OPTIONS" :key="source.value" :label="source.label" :value="source.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="Icon 类型" required>
            <el-select v-model="dialog.form.iconType" style="width: 100%">
              <el-option v-for="icon in ICON_TYPE_OPTIONS" :key="icon.value" :label="icon.label" :value="icon.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="Icon 值" required>
            <el-input v-model="dialog.form.iconValue" placeholder="i-carbon-flow-data" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="质量分">
            <el-input-number v-model="dialog.form.qualityScore" :min="0" :max="100" controls-position="right" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="速度分">
            <el-input-number v-model="dialog.form.speedScore" :min="0" :max="100" controls-position="right" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="成本分">
            <el-input-number v-model="dialog.form.costScore" :min="0" :max="100" controls-position="right" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="Tags（逗号分隔）">
        <el-input v-model="dialog.form.tags" placeholder="auto,routing,cost" />
      </el-form-item>

      <el-form-item label="默认 Route Combo">
        <el-select
          v-model="dialog.form.defaultRouteComboId"
          filterable
          clearable
          placeholder="留空则使用 routing policy 的默认组合"
          style="width: 100%"
        >
          <el-option
            v-for="option in routeComboOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
            :disabled="option.disabled"
          />
        </el-select>
        <div v-if="routeComboInvalid" class="form-warning">
          当前 Route Combo 已失效，请替换为有效值后再保存。
        </div>
      </el-form-item>

      <el-divider content-position="left">
        运行状态
      </el-divider>

      <el-form-item label="可用性">
        <el-space wrap>
          <el-switch v-model="dialog.form.enabled" inline-prompt active-text="启用" inactive-text="禁用" />
          <el-switch v-model="dialog.form.visible" inline-prompt active-text="可见" inactive-text="隐藏" />
        </el-space>
      </el-form-item>

      <el-divider content-position="left">
        推理策略
      </el-divider>

      <el-form-item label="Thinking">
        <el-space wrap>
          <el-switch
            v-model="dialog.form.thinkingSupported"
            inline-prompt
            active-text="支持"
            inactive-text="不支持"
          />
          <el-switch
            v-model="dialog.form.thinkingDefaultEnabled"
            :disabled="!dialog.form.thinkingSupported"
            inline-prompt
            active-text="默认开"
            inactive-text="默认关"
          />
        </el-space>
      </el-form-item>

      <el-divider content-position="left">
        能力矩阵
      </el-divider>

      <div class="capability-matrix">
        <div
          v-for="section in capabilitySections"
          :key="section.key"
          class="capability-section"
        >
          <div class="capability-section-title">
            {{ section.label }}
          </div>
          <div class="capability-list">
            <el-checkbox
              v-for="capability in section.items"
              :key="capability.id"
              v-model="dialog.form.capabilities[capability.id]"
            >
              <span class="capability-label">{{ capability.label }}</span>
              <span class="capability-key">{{ capability.id }}</span>
              <el-tag
                v-if="capability.experimental"
                class="capability-tag"
                size="small"
                type="warning"
                effect="plain"
              >
                实验中
              </el-tag>
            </el-checkbox>
          </div>
        </div>
      </div>

      <el-divider content-position="left">
        工具权限
      </el-divider>

      <el-form-item label="内置工具">
        <el-checkbox-group v-model="dialog.form.builtinTools">
          <el-checkbox
            v-for="tool in BUILTIN_TOOL_OPTIONS"
            :key="tool.value"
            :value="tool.value"
            :disabled="tool.value === 'websearch' && !dialog.form.capabilities.websearch"
          >
            {{ tool.label }}
          </el-checkbox>
        </el-checkbox-group>
        <div v-if="!dialog.form.capabilities.websearch" class="form-helper">
          已关闭“联网检索”，websearch 工具会自动移除。
        </div>
      </el-form-item>

      <el-divider content-position="left">
        模型映射（渠道模型列表）
      </el-divider>

      <div class="binding-toolbar">
        <el-button type="primary" plain size="small" @click="addBinding">
          新增映射
        </el-button>
      </div>

      <el-table border table-layout="auto" :data="dialog.form.bindings" style="width: 100%">
        <el-table-column label="channelId" min-width="180">
          <template #default="{ row }">
            <el-select
              v-model="row.channelId"
              filterable
              clearable
              placeholder="选择渠道"
              style="width: 100%"
              @change="() => onBindingChannelChanged(row)"
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
        <el-table-column label="providerModel" min-width="220">
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
                v-for="option in resolveBindingProviderModelOptions(row)"
                :key="option.value"
                :label="option.label"
                :value="option.value"
                :disabled="option.disabled === true"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="priority" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.priority" :min="1" :max="9999" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="weight" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.weight" :min="1" :max="1000" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="enabled" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ $index }">
            <el-button text type="danger" @click="removeBinding($index)">
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
.model-groups-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.model-groups-pagination {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.binding-toolbar {
  margin-bottom: 8px;
}

.icon-value {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
}

.template-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.form-helper {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.form-warning {
  margin-top: 6px;
  color: var(--el-color-danger);
  font-size: 12px;
}

.capability-matrix {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.capability-section {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 10px;
}

.capability-section-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.capability-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.capability-label {
  margin-right: 6px;
}

.capability-key {
  color: var(--el-text-color-secondary);
  font-family: Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
}

.capability-tag {
  margin-left: 6px;
}

@media (max-width: 1024px) {
  .capability-matrix {
    grid-template-columns: 1fr;
  }
}
</style>
