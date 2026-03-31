<script setup lang="ts">
import type { PilotBuiltInScene } from '~~/shared/pilot-routing-scene'
import type {
  PilotLoadBalancePolicyForm,
  PilotMemoryPolicyForm,
  PilotRoutingPolicyForm,
  PilotScenePolicyFormItem,
} from '~/composables/usePilotRoutingAdmin'
import { normalizePilotScene } from '~~/shared/pilot-routing-scene'
import {
  BUILT_IN_SCENE_OPTIONS,
  fetchPilotRoutingSettings,
  savePilotRoutingSettings,
} from '~/composables/usePilotRoutingAdmin'

definePageMeta({
  name: 'RoutingPolicy',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

interface ModelGroupSummary {
  id: string
  name: string
  enabled: boolean
  scenes: string[]
}

interface RouteComboSummary {
  id: string
  name: string
  enabled: boolean
}

const BUILT_IN_SCENE_SET = new Set(BUILT_IN_SCENE_OPTIONS.map(item => item.value))

const loading = ref(false)
const saving = ref(false)
const modelGroups = ref<ModelGroupSummary[]>([])
const routeCombos = ref<RouteComboSummary[]>([])
const hiddenScenePolicies = ref<PilotScenePolicyFormItem[]>([])

const routingPolicy = reactive<PilotRoutingPolicyForm>({
  defaultModelId: 'quota-auto',
  defaultRouteComboId: 'default-auto',
  explorationRate: 0.08,
  scenePolicies: BUILT_IN_SCENE_OPTIONS.map(item => createEmptyScenePolicy(item.value)),
  intentNanoModelId: '',
  intentRouteComboId: '',
  imageGenerationModelId: '',
  imageRouteComboId: '',
})

const lbPolicy = reactive<PilotLoadBalancePolicyForm>({
  metricWindowHours: 24,
  recentRequestWindow: 200,
  circuitBreakerFailureThreshold: 3,
  circuitBreakerCooldownMs: 60_000,
  halfOpenProbeCount: 1,
})

const memoryPolicy = reactive<PilotMemoryPolicyForm>({
  enabledByDefault: true,
  allowUserDisable: true,
  allowUserClear: true,
})

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function createEmptyScenePolicy(scene: PilotBuiltInScene): PilotScenePolicyFormItem {
  return {
    scene,
    modelId: '',
    routeComboId: '',
  }
}

function cloneScenePolicy(row: PilotScenePolicyFormItem): PilotScenePolicyFormItem {
  return {
    scene: normalizePilotScene(row.scene),
    modelId: normalizeText(row.modelId),
    routeComboId: normalizeText(row.routeComboId),
  }
}

function ensureBuiltInScenePolicies(list: PilotScenePolicyFormItem[]): PilotScenePolicyFormItem[] {
  return BUILT_IN_SCENE_OPTIONS.map((item) => {
    const matched = list.find(policy => normalizePilotScene(policy.scene) === item.value)
    return matched
      ? cloneScenePolicy(matched)
      : createEmptyScenePolicy(item.value)
  })
}

function splitHiddenScenePolicies(list: PilotScenePolicyFormItem[]): PilotScenePolicyFormItem[] {
  return list
    .filter(item => !BUILT_IN_SCENE_SET.has(normalizePilotScene(item.scene) as PilotBuiltInScene))
    .map(item => cloneScenePolicy(item))
}

function syncLegacyFieldsFromBuiltInPolicies() {
  const intentPolicy = routingPolicy.scenePolicies.find(item => item.scene === 'intent_classification')
  const imagePolicy = routingPolicy.scenePolicies.find(item => item.scene === 'image_generate')
  routingPolicy.intentNanoModelId = normalizeText(intentPolicy?.modelId)
  routingPolicy.intentRouteComboId = normalizeText(intentPolicy?.routeComboId)
  routingPolicy.imageGenerationModelId = normalizeText(imagePolicy?.modelId)
  routingPolicy.imageRouteComboId = normalizeText(imagePolicy?.routeComboId)
}

function resolveBuiltInSceneLabel(scene: string): string {
  return BUILT_IN_SCENE_OPTIONS.find(item => item.value === normalizePilotScene(scene))?.label || scene
}

function resolveSceneModelOptions(scene: string, currentModelId: string) {
  const normalizedScene = normalizePilotScene(scene)
  const options = modelGroups.value.map((item) => {
    const supportsScene = item.scenes.includes(normalizedScene)
    const baseLabel = `${item.name} (${item.id})`
    return {
      value: item.id,
      label: supportsScene ? baseLabel : `${baseLabel} / 未标记 ${normalizedScene}`,
      disabled: item.enabled === false,
    }
  })

  const normalizedCurrentModelId = normalizeText(currentModelId)
  if (!normalizedCurrentModelId || options.some(item => item.value === normalizedCurrentModelId)) {
    return options
  }

  options.unshift({
    value: normalizedCurrentModelId,
    label: `${normalizedCurrentModelId}（已失效，请替换）`,
    disabled: true,
  })
  return options
}

function resolveRouteComboOptions(currentRouteComboId: string) {
  const options = routeCombos.value.map(item => ({
    value: item.id,
    label: item.enabled ? `${item.name} (${item.id})` : `${item.name} (${item.id}) / 已禁用`,
    disabled: item.enabled === false,
  }))

  const normalizedCurrentRouteComboId = normalizeText(currentRouteComboId)
  if (!normalizedCurrentRouteComboId || options.some(item => item.value === normalizedCurrentRouteComboId)) {
    return options
  }

  options.unshift({
    value: normalizedCurrentRouteComboId,
    label: `${normalizedCurrentRouteComboId}（已失效，请替换）`,
    disabled: true,
  })
  return options
}

function validateBuiltInScenePolicies(): boolean {
  const modelMap = new Map(modelGroups.value.map(item => [item.id, item]))

  for (const row of routingPolicy.scenePolicies) {
    const scene = normalizePilotScene(row.scene)
    const sceneLabel = resolveBuiltInSceneLabel(scene)
    const modelId = normalizeText(row.modelId)
    const routeComboId = normalizeText(row.routeComboId)
    if (!modelId) {
      if (routeComboId) {
        ElMessage.warning(`${sceneLabel} 已选择路由组合，但未选择模型组`)
        return false
      }
      continue
    }

    const model = modelMap.get(modelId)
    if (!model) {
      ElMessage.warning(`${sceneLabel} 绑定的模型组不存在：${modelId}`)
      return false
    }

    if (!model.scenes.includes(scene)) {
      ElMessage.warning(`${sceneLabel} 只能选择已标记该场景的模型组`)
      return false
    }
  }

  return true
}

async function fetchSettings() {
  loading.value = true
  try {
    const data = await fetchPilotRoutingSettings()
    modelGroups.value = data.modelCatalog.map(item => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled,
      scenes: [...item.scenes],
    }))
    routeCombos.value = data.routeCombos.map(item => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled,
    }))

    const scenePolicies = Array.isArray(data.routingPolicy.scenePolicies)
      ? data.routingPolicy.scenePolicies.map(item => cloneScenePolicy(item))
      : []
    routingPolicy.defaultModelId = data.routingPolicy.defaultModelId
    routingPolicy.defaultRouteComboId = data.routingPolicy.defaultRouteComboId
    routingPolicy.explorationRate = data.routingPolicy.explorationRate
    routingPolicy.scenePolicies = ensureBuiltInScenePolicies(scenePolicies)
    hiddenScenePolicies.value = splitHiddenScenePolicies(scenePolicies)
    syncLegacyFieldsFromBuiltInPolicies()

    lbPolicy.metricWindowHours = data.lbPolicy.metricWindowHours
    lbPolicy.recentRequestWindow = data.lbPolicy.recentRequestWindow
    lbPolicy.circuitBreakerFailureThreshold = data.lbPolicy.circuitBreakerFailureThreshold
    lbPolicy.circuitBreakerCooldownMs = data.lbPolicy.circuitBreakerCooldownMs
    lbPolicy.halfOpenProbeCount = data.lbPolicy.halfOpenProbeCount

    memoryPolicy.enabledByDefault = data.memoryPolicy.enabledByDefault
    memoryPolicy.allowUserDisable = data.memoryPolicy.allowUserDisable
    memoryPolicy.allowUserClear = data.memoryPolicy.allowUserClear
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载策略设置失败')
  }
  finally {
    loading.value = false
  }
}

async function saveSettings() {
  if (!validateBuiltInScenePolicies()) {
    return
  }

  const builtInScenePolicies = routingPolicy.scenePolicies
    .map(item => cloneScenePolicy(item))
    .filter(item => normalizeText(item.modelId))
  const scenePolicies = [
    ...builtInScenePolicies,
    ...hiddenScenePolicies.value.map(item => cloneScenePolicy(item)),
  ]
  const intentPolicy = builtInScenePolicies.find(item => item.scene === 'intent_classification')
  const imagePolicy = builtInScenePolicies.find(item => item.scene === 'image_generate')

  saving.value = true
  try {
    await savePilotRoutingSettings({
      routingPolicy: {
        defaultModelId: routingPolicy.defaultModelId,
        defaultRouteComboId: routingPolicy.defaultRouteComboId,
        explorationRate: routingPolicy.explorationRate,
        scenePolicies,
        intentNanoModelId: normalizeText(intentPolicy?.modelId),
        intentRouteComboId: normalizeText(intentPolicy?.routeComboId),
        imageGenerationModelId: normalizeText(imagePolicy?.modelId),
        imageRouteComboId: normalizeText(imagePolicy?.routeComboId),
      },
      lbPolicy: {
        metricWindowHours: lbPolicy.metricWindowHours,
        recentRequestWindow: lbPolicy.recentRequestWindow,
        circuitBreakerFailureThreshold: lbPolicy.circuitBreakerFailureThreshold,
        circuitBreakerCooldownMs: lbPolicy.circuitBreakerCooldownMs,
        halfOpenProbeCount: lbPolicy.halfOpenProbeCount,
      },
      memoryPolicy: {
        enabledByDefault: memoryPolicy.enabledByDefault,
        allowUserDisable: memoryPolicy.allowUserDisable,
        allowUserClear: memoryPolicy.allowUserClear,
      },
    })
    syncLegacyFieldsFromBuiltInPolicies()
    ElMessage.success('路由策略保存成功')
    await fetchSettings()
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存策略设置失败')
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
  <el-container class="RoutingPolicyPage">
    <el-main>
      <div class="policy-toolbar">
        <el-button :loading="loading" @click="fetchSettings">
          刷新
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveSettings">
          保存策略
        </el-button>
      </div>

      <el-card class="policy-card" shadow="never">
        <template #header>
          <span>路由策略</span>
        </template>
        <el-form label-width="180px">
          <el-form-item label="默认模型组">
            <el-input v-model="routingPolicy.defaultModelId" placeholder="quota-auto" />
          </el-form-item>
          <el-form-item label="默认路由组合">
            <el-input v-model="routingPolicy.defaultRouteComboId" placeholder="default-auto" />
          </el-form-item>
          <el-form-item label="探索比例">
            <el-input-number v-model="routingPolicy.explorationRate" :min="0" :max="0.5" :step="0.01" controls-position="right" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="policy-card" shadow="never">
        <template #header>
          <span>专项场景策略</span>
        </template>

        <div v-if="hiddenScenePolicies.length > 0" class="policy-note">
          已保留 {{ hiddenScenePolicies.length }} 条自定义 scene policy；第一版后台暂不在此页面直接编辑。
        </div>

        <el-table border table-layout="auto" :data="routingPolicy.scenePolicies" style="width: 100%">
          <el-table-column label="场景" width="220">
            <template #default="{ row }">
              <el-tag effect="plain">
                {{ resolveBuiltInSceneLabel(row.scene) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="模型组" min-width="320">
            <template #default="{ row }">
              <el-select
                v-model="row.modelId"
                clearable
                filterable
                placeholder="选择模型组"
                style="width: 100%"
              >
                <el-option
                  v-for="option in resolveSceneModelOptions(row.scene, row.modelId)"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                  :disabled="option.disabled"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="路由组合（可选）" min-width="280">
            <template #default="{ row }">
              <el-select
                v-model="row.routeComboId"
                clearable
                filterable
                placeholder="留空则走模型组常规绑定"
                style="width: 100%"
              >
                <el-option
                  v-for="option in resolveRouteComboOptions(row.routeComboId)"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                  :disabled="option.disabled"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="policy-card" shadow="never">
        <template #header>
          <span>负载均衡策略</span>
        </template>
        <el-form label-width="220px">
          <el-form-item label="指标窗口（小时）">
            <el-input-number v-model="lbPolicy.metricWindowHours" :min="1" :max="168" controls-position="right" />
          </el-form-item>
          <el-form-item label="近期请求窗口">
            <el-input-number v-model="lbPolicy.recentRequestWindow" :min="10" :max="5000" controls-position="right" />
          </el-form-item>
          <el-form-item label="熔断失败阈值">
            <el-input-number v-model="lbPolicy.circuitBreakerFailureThreshold" :min="1" :max="20" controls-position="right" />
          </el-form-item>
          <el-form-item label="熔断冷却时间（毫秒）">
            <el-input-number v-model="lbPolicy.circuitBreakerCooldownMs" :min="5000" :max="600000" :step="1000" controls-position="right" />
          </el-form-item>
          <el-form-item label="半开探测次数">
            <el-input-number v-model="lbPolicy.halfOpenProbeCount" :min="1" :max="5" controls-position="right" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="policy-card" shadow="never">
        <template #header>
          <span>记忆策略</span>
        </template>
        <el-space wrap>
          <el-checkbox v-model="memoryPolicy.enabledByDefault">
            默认开启
          </el-checkbox>
          <el-checkbox v-model="memoryPolicy.allowUserDisable">
            允许用户关闭
          </el-checkbox>
          <el-checkbox v-model="memoryPolicy.allowUserClear">
            允许用户清空
          </el-checkbox>
        </el-space>
      </el-card>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.policy-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.policy-card + .policy-card {
  margin-top: 12px;
}

.policy-note {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
