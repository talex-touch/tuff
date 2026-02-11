<script lang="ts" setup>
import type { IntelligenceUsageSummary } from '@talex-touch/utils/renderer'
import { useIntelligenceStats } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const props = defineProps<{
  callerId?: string
}>()

const { t } = useI18n()
const { getTodayStats, getMonthStats, isLoading } = useIntelligenceStats()

const todayStats = ref<IntelligenceUsageSummary | null>(null)
const monthStats = ref<IntelligenceUsageSummary | null>(null)

async function loadStats() {
  try {
    const [today, month] = await Promise.all([
      getTodayStats(props.callerId),
      getMonthStats(props.callerId)
    ])
    todayStats.value = today
    monthStats.value = month
  } catch {
    toast.error(t('intelligence.audit.loadStatsFailed'))
  }
}

onMounted(loadStats)

watch(() => props.callerId, loadStats)

const successRate = computed(() => {
  const stats = todayStats.value
  if (!stats || stats.requestCount === 0) return 0
  return Math.round((stats.successCount / stats.requestCount) * 100)
})

const monthSuccessRate = computed(() => {
  const stats = monthStats.value
  if (!stats || stats.requestCount === 0) return 0
  return Math.round((stats.successCount / stats.requestCount) * 100)
})

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}
</script>

<template>
  <div class="usage-stats">
    <div v-if="isLoading" class="loading">
      <i class="i-carbon-circle-dash animate-spin" />
      {{ t('common.loading') }}
    </div>

    <div v-else class="stats-grid">
      <!-- Today Stats -->
      <div class="stat-card today">
        <div class="stat-header">
          <i class="i-carbon-calendar" />
          <span>{{ t('intelligence.usage.today') }}</span>
        </div>
        <div class="stat-content">
          <div class="stat-row">
            <div class="stat-item">
              <div class="stat-value">
                {{ todayStats?.requestCount || 0 }}
              </div>
              <div class="stat-label">
                {{ t('intelligence.usage.requests') }}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-value">
                {{ formatNumber(todayStats?.totalTokens || 0) }}
              </div>
              <div class="stat-label">
                {{ t('intelligence.usage.tokens') }}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-value">
                {{ formatCost(todayStats?.totalCost || 0) }}
              </div>
              <div class="stat-label">
                {{ t('intelligence.usage.cost') }}
              </div>
            </div>
          </div>
          <div class="stat-bar">
            <div class="bar-label">
              <span>{{ t('intelligence.usage.successRate') }}</span>
              <span>{{ successRate }}%</span>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="{
                  success: successRate >= 90,
                  warning: successRate >= 70 && successRate < 90,
                  error: successRate < 70
                }"
                :style="{ width: `${successRate}%` }"
              />
            </div>
          </div>
          <div class="stat-detail">
            <span class="detail-item success">
              <i class="i-carbon-checkmark-filled" />
              {{ todayStats?.successCount || 0 }}
            </span>
            <span class="detail-item error">
              <i class="i-carbon-close-filled" />
              {{ todayStats?.failureCount || 0 }}
            </span>
            <span class="detail-item latency">
              <i class="i-carbon-time" />
              {{ Math.round(todayStats?.avgLatency || 0) }}ms
            </span>
          </div>
        </div>
      </div>

      <!-- Month Stats -->
      <div class="stat-card month">
        <div class="stat-header">
          <i class="i-carbon-calendar-heat-map" />
          <span>{{ t('intelligence.usage.thisMonth') }}</span>
        </div>
        <div class="stat-content">
          <div class="stat-row">
            <div class="stat-item">
              <div class="stat-value">
                {{ formatNumber(monthStats?.requestCount || 0) }}
              </div>
              <div class="stat-label">
                {{ t('intelligence.usage.requests') }}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-value">
                {{ formatNumber(monthStats?.totalTokens || 0) }}
              </div>
              <div class="stat-label">
                {{ t('intelligence.usage.tokens') }}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-value">
                {{ formatCost(monthStats?.totalCost || 0) }}
              </div>
              <div class="stat-label">
                {{ t('intelligence.usage.cost') }}
              </div>
            </div>
          </div>
          <div class="stat-bar">
            <div class="bar-label">
              <span>{{ t('intelligence.usage.successRate') }}</span>
              <span>{{ monthSuccessRate }}%</span>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="{
                  success: monthSuccessRate >= 90,
                  warning: monthSuccessRate >= 70 && monthSuccessRate < 90,
                  error: monthSuccessRate < 70
                }"
                :style="{ width: `${monthSuccessRate}%` }"
              />
            </div>
          </div>
          <div class="stat-detail">
            <span class="detail-item success">
              <i class="i-carbon-checkmark-filled" />
              {{ formatNumber(monthStats?.successCount || 0) }}
            </span>
            <span class="detail-item error">
              <i class="i-carbon-close-filled" />
              {{ formatNumber(monthStats?.failureCount || 0) }}
            </span>
            <span class="detail-item latency">
              <i class="i-carbon-time" />
              {{ Math.round(monthStats?.avgLatency || 0) }}ms
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.usage-stats {
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px;
    color: var(--el-text-color-secondary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .stat-card {
    background: var(--el-fill-color-lighter);
    border-radius: 12px;
    padding: 16px;
    border: 1px solid var(--el-border-color-lighter);

    .stat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-regular);
      margin-bottom: 16px;

      i {
        font-size: 18px;
        color: var(--el-color-primary);
      }
    }

    .stat-content {
      .stat-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 16px;
      }

      .stat-item {
        text-align: center;
        flex: 1;

        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: var(--el-text-color-primary);
          font-variant-numeric: tabular-nums;
        }

        .stat-label {
          font-size: 12px;
          color: var(--el-text-color-secondary);
          margin-top: 4px;
        }
      }

      .stat-bar {
        margin-bottom: 12px;

        .bar-label {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--el-text-color-secondary);
          margin-bottom: 6px;
        }

        .bar-track {
          height: 6px;
          background: var(--el-fill-color);
          border-radius: 3px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;

          &.success {
            background: var(--el-color-success);
          }
          &.warning {
            background: var(--el-color-warning);
          }
          &.error {
            background: var(--el-color-danger);
          }
        }
      }

      .stat-detail {
        display: flex;
        justify-content: center;
        gap: 16px;
        font-size: 12px;

        .detail-item {
          display: flex;
          align-items: center;
          gap: 4px;

          &.success {
            color: var(--el-color-success);
          }
          &.error {
            color: var(--el-color-danger);
          }
          &.latency {
            color: var(--el-text-color-secondary);
          }
        }
      }
    }
  }
}
</style>
