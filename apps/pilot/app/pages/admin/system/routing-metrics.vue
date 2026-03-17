<script setup lang="ts">
import type { PilotRoutingMetricRow, PilotRoutingMetricSummary } from '~/composables/usePilotRoutingAdmin'
import { fetchPilotRoutingMetrics } from '~/composables/usePilotRoutingAdmin'

definePageMeta({
  name: 'RoutingMetrics',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const loading = ref(false)
const metrics = ref<PilotRoutingMetricRow[]>([])
const summary = reactive<PilotRoutingMetricSummary>({
  total: 0,
  success: 0,
  failed: 0,
  successRate: 0,
  avgTtftMs: 0,
  avgTotalDurationMs: 0,
})

async function fetchMetrics() {
  loading.value = true
  try {
    const data = await fetchPilotRoutingMetrics(200)
    metrics.value = data.metrics
    summary.total = data.summary.total
    summary.success = data.summary.success
    summary.failed = data.summary.failed
    summary.successRate = data.summary.successRate
    summary.avgTtftMs = data.summary.avgTtftMs
    summary.avgTotalDurationMs = data.summary.avgTotalDurationMs
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载路由评比失败')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchMetrics()
})
</script>

<template>
  <el-container class="RoutingMetricsPage">
    <el-main>
      <div class="metrics-toolbar">
        <el-button :loading="loading" @click="fetchMetrics">
          刷新评比
        </el-button>
      </div>

      <el-card shadow="never">
        <template #header>
          <span>Routing Metrics Summary</span>
        </template>
        <el-space wrap>
          <el-tag>
            总数: {{ summary.total }}
          </el-tag>
          <el-tag type="success">
            成功: {{ summary.success }}
          </el-tag>
          <el-tag type="danger">
            失败: {{ summary.failed }}
          </el-tag>
          <el-tag type="info">
            成功率: {{ (summary.successRate * 100).toFixed(2) }}%
          </el-tag>
          <el-tag type="warning">
            平均 TTFT: {{ summary.avgTtftMs }} ms
          </el-tag>
          <el-tag>
            平均总耗时: {{ summary.avgTotalDurationMs }} ms
          </el-tag>
        </el-space>
      </el-card>

      <el-table
        v-loading="loading"
        border
        table-layout="auto"
        :data="metrics"
        style="width: 100%; margin-top: 12px"
      >
        <el-table-column prop="createdAt" label="时间" min-width="180" />
        <el-table-column prop="routeComboId" label="Combo" min-width="140" />
        <el-table-column prop="channelId" label="Channel" min-width="120" />
        <el-table-column prop="modelId" label="Model" min-width="150" />
        <el-table-column prop="providerModel" label="Provider Model" min-width="170" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="queueWaitMs" label="Queue(ms)" width="110" />
        <el-table-column prop="ttftMs" label="TTFT(ms)" width="110" />
        <el-table-column prop="totalDurationMs" label="Total(ms)" width="110" />
        <el-table-column prop="outputChars" label="输出字符" width="100" />
        <el-table-column prop="finishReason" label="finishReason" min-width="140" />
        <el-table-column prop="errorCode" label="errorCode" min-width="140" />
      </el-table>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.metrics-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
