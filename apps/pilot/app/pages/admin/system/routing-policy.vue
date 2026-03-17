<script setup lang="ts">
import type { PilotLoadBalancePolicyForm, PilotMemoryPolicyForm, PilotRoutingPolicyForm } from '~/composables/usePilotRoutingAdmin'
import { fetchPilotRoutingSettings, savePilotRoutingSettings } from '~/composables/usePilotRoutingAdmin'

definePageMeta({
  name: 'RoutingPolicy',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const loading = ref(false)
const saving = ref(false)
const routingPolicy = reactive<PilotRoutingPolicyForm>({
  defaultModelId: 'quota-auto',
  defaultRouteComboId: 'default-auto',
  explorationRate: 0.08,
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

async function fetchSettings() {
  loading.value = true
  try {
    const data = await fetchPilotRoutingSettings()
    routingPolicy.defaultModelId = data.routingPolicy.defaultModelId
    routingPolicy.defaultRouteComboId = data.routingPolicy.defaultRouteComboId
    routingPolicy.explorationRate = data.routingPolicy.explorationRate
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
  saving.value = true
  try {
    await savePilotRoutingSettings({
      routingPolicy: {
        defaultModelId: routingPolicy.defaultModelId,
        defaultRouteComboId: routingPolicy.defaultRouteComboId,
        explorationRate: routingPolicy.explorationRate,
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
    ElMessage.success('Routing 策略保存成功')
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
          <span>Routing Policy</span>
        </template>
        <el-form label-width="180px">
          <el-form-item label="defaultModelId">
            <el-input v-model="routingPolicy.defaultModelId" placeholder="quota-auto" />
          </el-form-item>
          <el-form-item label="defaultRouteComboId">
            <el-input v-model="routingPolicy.defaultRouteComboId" placeholder="default-auto" />
          </el-form-item>
          <el-form-item label="explorationRate">
            <el-input-number v-model="routingPolicy.explorationRate" :min="0" :max="0.5" :step="0.01" controls-position="right" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="policy-card" shadow="never">
        <template #header>
          <span>Load Balance Policy</span>
        </template>
        <el-form label-width="220px">
          <el-form-item label="metricWindowHours">
            <el-input-number v-model="lbPolicy.metricWindowHours" :min="1" :max="168" controls-position="right" />
          </el-form-item>
          <el-form-item label="recentRequestWindow">
            <el-input-number v-model="lbPolicy.recentRequestWindow" :min="10" :max="5000" controls-position="right" />
          </el-form-item>
          <el-form-item label="failureThreshold">
            <el-input-number v-model="lbPolicy.circuitBreakerFailureThreshold" :min="1" :max="20" controls-position="right" />
          </el-form-item>
          <el-form-item label="cooldownMs">
            <el-input-number v-model="lbPolicy.circuitBreakerCooldownMs" :min="5000" :max="600000" :step="1000" controls-position="right" />
          </el-form-item>
          <el-form-item label="halfOpenProbeCount">
            <el-input-number v-model="lbPolicy.halfOpenProbeCount" :min="1" :max="5" controls-position="right" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="policy-card" shadow="never">
        <template #header>
          <span>Memory Policy</span>
        </template>
        <el-space wrap>
          <el-checkbox v-model="memoryPolicy.enabledByDefault">
            enabledByDefault
          </el-checkbox>
          <el-checkbox v-model="memoryPolicy.allowUserDisable">
            allowUserDisable
          </el-checkbox>
          <el-checkbox v-model="memoryPolicy.allowUserClear">
            allowUserClear
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
</style>
