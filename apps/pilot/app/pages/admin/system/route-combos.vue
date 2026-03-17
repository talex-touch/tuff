<script setup lang="ts">
import {
  buildRouteComboPayload,
  createEmptyRouteCombo,
  createEmptyRouteComboRoute,
  fetchPilotRoutingSettings,
  normalizeRouteCombo,
  savePilotRoutingSettings,
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

function mapFromSettings(rows: RouteComboFormItem[]): RouteComboFormItem[] {
  return rows.map(item => normalizeRouteCombo({
    ...item,
    routes: [...item.routes],
  }))
}

async function fetchSettings() {
  loading.value = true
  try {
    const data = await fetchPilotRoutingSettings()
    routeCombos.value = mapFromSettings(data.routeCombos)
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载 Route Combos 失败')
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

function validateDialogForm(): RouteComboFormItem | null {
  const next = normalizeRouteCombo(dialog.form)
  if (!next.id) {
    ElMessage.warning('Route Combo ID 不能为空')
    return null
  }
  if (!next.name) {
    ElMessage.warning('Route Combo 名称不能为空')
    return null
  }
  for (const route of next.routes) {
    if (!normalizeText(route.channelId)) {
      ElMessage.warning('每条 Route 必须填写 channelId')
      return null
    }
  }

  const exists = routeCombos.value.some(item => item.id === next.id)
  if (dialog.mode === 'new' && exists) {
    ElMessage.warning(`Route Combo ID 已存在：${next.id}`)
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
        ElMessage.error('待编辑 Route Combo 不存在，请刷新后重试')
        return
      }
      next.splice(index, 1, valid)
    }

    const saved = await savePilotRoutingSettings({
      routeCombos: buildRouteComboPayload(next),
    })
    routeCombos.value = mapFromSettings(saved.routeCombos)
    dialog.visible = false
    ElMessage.success('Route Combos 保存成功')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存 Route Combos 失败')
  }
  finally {
    dialog.submitting = false
    saving.value = false
  }
}

async function deleteCombo(item: RouteComboFormItem) {
  const remain = routeCombos.value.filter(row => row.id !== item.id)
  if (remain.length <= 0) {
    ElMessage.warning('至少保留一个 Route Combo')
    return
  }

  saving.value = true
  try {
    const saved = await savePilotRoutingSettings({
      routeCombos: buildRouteComboPayload(remain),
    })
    routeCombos.value = mapFromSettings(saved.routeCombos)
    ElMessage.success('Route Combo 已删除')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除 Route Combo 失败')
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
          新增 Route Combo
        </el-button>
      </div>

      <el-table v-loading="loading || saving" border table-layout="auto" :data="routeCombos" style="width: 100%">
        <el-table-column prop="id" label="Combo ID" min-width="180" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="description" label="描述" min-width="240" />
        <el-table-column label="LangGraph" min-width="240">
          <template #default="{ row }">
            <div class="combo-meta-row">
              <span>assistant: {{ row.langgraphAssistantId || '-' }}</span>
              <span>profile: {{ row.graphProfile || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Route 数" width="110">
          <template #default="{ row }">
            {{ row.routes.length }}
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
    :title="dialog.mode === 'new' ? '新增 Route Combo' : '编辑 Route Combo'"
    width="1080px"
    :close-on-click-modal="false"
  >
    <el-form label-width="150px">
      <el-form-item label="Combo ID" required>
        <el-input v-model="dialog.form.id" :disabled="dialog.mode === 'edit'" placeholder="default-auto" />
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="dialog.form.name" placeholder="Default Auto" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="dialog.form.description" placeholder="默认自动路由组合" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="LangGraph assistant_id">
            <el-input v-model="dialog.form.langgraphAssistantId" placeholder="assistant-xxx" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="graphProfile">
            <el-input v-model="dialog.form.graphProfile" placeholder="default" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="fallbackComboId">
            <el-input v-model="dialog.form.fallbackRouteComboId" placeholder="fallback-auto" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="启用">
        <el-switch v-model="dialog.form.enabled" />
      </el-form-item>

      <el-divider content-position="left">
        Routes
      </el-divider>

      <div class="route-toolbar">
        <el-button type="primary" plain size="small" @click="addRoute">
          新增 Route
        </el-button>
      </div>

      <el-table border table-layout="auto" :data="dialog.form.routes" style="width: 100%">
        <el-table-column label="channelId" min-width="150">
          <template #default="{ row }">
            <el-input v-model="row.channelId" placeholder="default" />
          </template>
        </el-table-column>
        <el-table-column label="modelId" min-width="150">
          <template #default="{ row }">
            <el-input v-model="row.modelId" placeholder="quota-auto" />
          </template>
        </el-table-column>
        <el-table-column label="providerModel" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.providerModel" placeholder="gpt-5.4" />
          </template>
        </el-table-column>
        <el-table-column label="priority" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.priority" :min="1" :max="9999" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="weight" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.weight" :min="1" :max="1000" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="timeoutMs" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.timeoutMs" :min="3000" :max="600000" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="retries" width="100">
          <template #default="{ row }">
            <el-input-number v-model="row.maxRetries" :min="0" :max="5" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="circuit" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.circuitBreakerThreshold" :min="1" :max="10" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="enabled" width="90">
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
