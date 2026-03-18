<script setup lang="ts">
import {
  buildModelGroupPayload,
  createEmptyBinding,
  createEmptyModelGroup,
  fetchPilotRoutingSettings,
  ICON_TYPE_OPTIONS,
  MODEL_SOURCE_OPTIONS,
  normalizeModelGroup,
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

const loading = ref(false)
const saving = ref(false)
const syncing = ref(false)
const modelGroups = ref<ModelGroupFormItem[]>([])

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
    labels.push(item.thinkingDefaultEnabled ? 'thinking(默认开)' : 'thinking')
  }
  if (item.allowWebsearch) {
    labels.push('websearch')
  }
  if (item.allowImageAnalysis) {
    labels.push('image')
  }
  if (item.allowFileAnalysis) {
    labels.push('file')
  }
  return labels.length > 0 ? labels.join(' / ') : '无'
}

function mapFromSettings(rows: ModelGroupFormItem[]): ModelGroupFormItem[] {
  return rows.map(item => normalizeModelGroup({
    ...item,
    bindings: [...item.bindings],
  }))
}

async function fetchSettings() {
  loading.value = true
  try {
    const data = await fetchPilotRoutingSettings()
    modelGroups.value = mapFromSettings(data.modelCatalog)
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

function addBinding() {
  dialog.form.bindings.push(createEmptyBinding())
}

function removeBinding(index: number) {
  dialog.form.bindings.splice(index, 1)
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
    dialog.visible = false
    ElMessage.success('模型组保存成功')
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
    ElMessage.success('模型组已删除')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除模型组失败')
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

watch(() => dialog.form.thinkingSupported, (enabled) => {
  if (!enabled) {
    dialog.form.thinkingDefaultEnabled = false
  }
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
        <el-button type="primary" @click="openCreateDialog">
          新增模型组
        </el-button>
      </div>

      <el-table v-loading="loading || saving" border table-layout="auto" :data="modelGroups" style="width: 100%">
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
            <el-button text type="danger" @click="deleteGroup(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
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

      <el-form-item label="Tags(逗号分隔)">
        <el-input v-model="dialog.form.tags" placeholder="auto,routing,cost" />
      </el-form-item>

      <el-form-item label="默认 Route Combo">
        <el-input v-model="dialog.form.defaultRouteComboId" placeholder="default-auto" />
      </el-form-item>

      <el-form-item label="能力开关">
        <el-space wrap>
          <el-checkbox v-model="dialog.form.enabled">
            enabled
          </el-checkbox>
          <el-checkbox v-model="dialog.form.visible">
            visible
          </el-checkbox>
          <el-checkbox v-model="dialog.form.allowWebsearch">
            allowWebsearch
          </el-checkbox>
          <el-checkbox v-model="dialog.form.allowImageAnalysis">
            allowImageAnalysis
          </el-checkbox>
          <el-checkbox v-model="dialog.form.allowFileAnalysis">
            allowFileAnalysis
          </el-checkbox>
          <el-checkbox v-model="dialog.form.thinkingSupported">
            thinkingSupported
          </el-checkbox>
          <el-checkbox v-model="dialog.form.thinkingDefaultEnabled" :disabled="!dialog.form.thinkingSupported">
            thinkingDefaultEnabled
          </el-checkbox>
        </el-space>
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
        <el-table-column label="channelId" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.channelId" placeholder="default" />
          </template>
        </el-table-column>
        <el-table-column label="providerModel" min-width="180">
          <template #default="{ row }">
            <el-input v-model="row.providerModel" placeholder="gpt-5.4" />
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

.binding-toolbar {
  margin-bottom: 8px;
}

.icon-value {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
}
</style>
