<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { AdminUsageResponse } from '@/api/types'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleStatGrid from '@/components/ConsoleStatGrid.vue'
import type { ConsoleStatItem } from '@/components/ConsoleStatGrid.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { formatNumber, formatPercent } from '@/utils/format'

const { t, locale } = useI18n()

const days = ref(30)
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const usage = ref<AdminUsageResponse | null>(null)

const dayOptions = computed(() => [
  { value: 7, label: t('admin.days7') },
  { value: 30, label: t('admin.days30') },
  { value: 90, label: t('admin.days90') },
])

const activityStats = computed<ConsoleStatItem[]>(() => {
  const active = usage.value?.activeUsers
  return [
    { key: 'dau', label: t('admin.dau'), value: formatNumber(active?.dau ?? 0, locale.value), iconClass: 'i-carbon-user-activity' },
    { key: 'wau', label: t('admin.wau'), value: formatNumber(active?.wau ?? 0, locale.value), iconClass: 'i-carbon-events' },
    { key: 'mau', label: t('admin.mau'), value: formatNumber(active?.mau ?? 0, locale.value), iconClass: 'i-carbon-group' },
    { key: 'devices', label: t('admin.activeDevices'), value: formatNumber(active?.activeDevices ?? 0, locale.value), iconClass: 'i-carbon-laptop' },
  ]
})

const aiGatewayStats = computed<ConsoleStatItem[]>(() => {
  const gw = usage.value?.ecosystem?.aiGateway
  return [
    { key: 'req', label: t('admin.aiRequests'), value: formatNumber(gw?.totalRequests ?? 0, locale.value), iconClass: 'i-carbon-api' },
    { key: 'sr', label: t('admin.aiSuccessRate'), value: formatPercent(gw?.successRate ?? 0), iconClass: 'i-carbon-checkmark-outline' },
    { key: 'lat', label: t('admin.aiAvgLatency'), value: `${formatNumber(Math.round(gw?.avgLatencyMs ?? 0), locale.value)} ms`, iconClass: 'i-carbon-timer' },
    { key: 'tok', label: t('admin.aiTokens'), value: formatNumber(gw?.totalTokens ?? 0, locale.value), iconClass: 'i-carbon-chart-histogram' },
  ]
})

const dailySeries = computed(() => usage.value?.activeUsers?.dailySeries ?? [])
const versionRows = computed(() => usage.value?.distribution?.versions ?? [])
const platformRows = computed(() => usage.value?.distribution?.platforms ?? [])
const regionRows = computed(() => usage.value?.regions ?? [])
const featureRows = computed(() => usage.value?.topFeatures ?? [])
const pluginRows = computed(() => usage.value?.ecosystem?.topPlugins ?? [])
const stabilityRows = computed(() => usage.value?.stability?.byVersion ?? [])

const maxDailyDau = computed(() => Math.max(1, ...dailySeries.value.map(item => item.dau)))
const maxRegionCount = computed(() => Math.max(1, ...regionRows.value.map(r => r.count)))
const maxFeatureCount = computed(() => Math.max(1, ...featureRows.value.map(f => f.count)))
const maxVersionCount = computed(() => Math.max(1, ...versionRows.value.map(v => v.count)))

type VersionRow = NonNullable<AdminUsageResponse['distribution']>['versions'][number]
type PluginRow = AdminUsageResponse['ecosystem']['topPlugins'][number]
type ErrorRow = NonNullable<AdminUsageResponse['stability']>['byVersion'][number]

const versionColumns = computed<DataTableColumn<VersionRow>[]>(() => [
  { key: 'version', title: t('admin.versionCol'), minWidth: 120 },
  { key: 'channel', title: t('admin.channelCol'), minWidth: 100 },
  { key: 'count', title: t('admin.usersCountCol'), align: 'right', minWidth: 120 },
])

const pluginColumns = computed<DataTableColumn<PluginRow>[]>(() => [
  { key: 'pluginId', title: t('admin.pluginCol'), minWidth: 180 },
  { key: 'installs', title: t('admin.installsCol'), align: 'right', minWidth: 110 },
])

const errorColumns = computed<DataTableColumn<ErrorRow>[]>(() => [
  { key: 'version', title: t('admin.versionCol'), minWidth: 130 },
  { key: 'errors', title: t('admin.errorCountCol'), align: 'right', minWidth: 100 },
  { key: 'errorRate', title: t('admin.errorRateCol'), align: 'right', minWidth: 130 },
])

async function loadUsage() {
  loading.value = true
  errorMessage.value = null
  try {
    usage.value = await consoleApi.getAdminUsage(days.value)
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

watch(days, () => void loadUsage())
onMounted(() => void loadUsage())
</script>

<template>
  <ConsolePageShell :title="t('admin.usageTitle')">
    <template #actions>
      <TxSelect v-model="days" :options="dayOptions" />
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" :loading="loading" @click="loadUsage">
        {{ t('common.refresh') }}
      </TxButton>
    </template>

    <TxAlert v-if="errorMessage" type="error" :message="errorMessage" />

    <!-- Panel 1: DAU / WAU / MAU & Active Devices -->
    <ConsoleStatGrid :items="activityStats" :loading="loading" :skeleton-count="4" />

    <ConsoleSection :title="t('admin.panelActivity')">
      <div v-if="loading" class="console-form-stack" aria-busy="true">
        <TxSkeleton width="100%" :height="120" :radius="12" />
      </div>
      <div v-else-if="dailySeries.length" class="UsageTrend">
        <div
          v-for="point in dailySeries"
          :key="point.date"
          class="UsageTrend-BarWrap"
          :title="`${point.date}: ${formatNumber(point.dau, locale)}`"
        >
          <div
            class="UsageTrend-Bar"
            :style="{ height: `${Math.max(6, Math.round((point.dau / maxDailyDau) * 100))}%` }"
          />
          <span class="UsageTrend-Label">{{ point.date.slice(5) }}</span>
        </div>
      </div>
      <TxEmptyState v-else variant="no-data" size="small" :title="t('common.noData')" description="" />
    </ConsoleSection>

    <div class="UsageGrid">
      <!-- Panel 2: Version / Channel & OS / Arch Distribution -->
      <ConsoleSection :title="t('admin.panelVersions')" :padded="false">
        <ConsoleTable
          :columns="versionColumns"
          :rows="versionRows"
          :row-key="(row: VersionRow) => `${row.version}-${row.channel || ''}`"
          :loading="loading"
          :page="1"
          :limit="20"
          :total="versionRows.length"
        >
          <template #cell-version="{ row }">
            <span class="console-mono">{{ row.version }}</span>
          </template>
          <template #cell-channel="{ row }">
            <TxTag :label="row.channel || 'RELEASE'" size="sm" variant="soft" />
          </template>
          <template #cell-count="{ row }">
            <div class="UsageInlineBar">
              <span>{{ formatNumber(row.count, locale) }}</span>
              <div class="console-bar-track">
                <div
                  class="console-bar-fill"
                  :style="{ width: `${Math.round((row.count / maxVersionCount) * 100)}%` }"
                />
              </div>
            </div>
          </template>
        </ConsoleTable>
        <template v-if="platformRows.length" #footer>
          <div class="console-inline-actions">
            <TxTag
              v-for="plat in platformRows"
              :key="`${plat.platform}-${plat.arch || ''}`"
              :label="`${plat.platform}${plat.arch ? `/${plat.arch}` : ''}: ${formatNumber(plat.count, locale)}`"
              size="sm"
              variant="plain"
            />
          </div>
        </template>
      </ConsoleSection>

      <!-- Panel 3: Top Countries / Regions -->
      <ConsoleSection :title="t('admin.panelRegions')">
        <div v-if="loading" class="console-form-stack" aria-busy="true">
          <TxSkeleton width="100%" :height="24" :radius="6" />
          <TxSkeleton width="88%" :height="24" :radius="6" />
          <TxSkeleton width="76%" :height="24" :radius="6" />
        </div>
        <div v-else-if="regionRows.length" class="UsageRankList">
          <div v-for="region in regionRows" :key="region.countryCode" class="UsageRankItem">
            <div class="UsageRankItem-Head">
              <span class="console-mono">{{ region.countryCode }}</span>
              <span>{{ formatNumber(region.count, locale) }}</span>
            </div>
            <div class="console-bar-track">
              <div
                class="console-bar-fill"
                :style="{ width: `${Math.round((region.count / maxRegionCount) * 100)}%` }"
              />
            </div>
          </div>
        </div>
        <TxEmptyState v-else variant="no-data" size="small" :title="t('common.noData')" description="" />
      </ConsoleSection>

      <!-- Panel 4: Top Feature Usage -->
      <ConsoleSection :title="t('admin.panelFeatures')">
        <div v-if="loading" class="console-form-stack" aria-busy="true">
          <TxSkeleton width="100%" :height="24" :radius="6" />
          <TxSkeleton width="84%" :height="24" :radius="6" />
          <TxSkeleton width="72%" :height="24" :radius="6" />
        </div>
        <div v-else-if="featureRows.length" class="UsageRankList">
          <div v-for="feat in featureRows" :key="feat.feature" class="UsageRankItem">
            <div class="UsageRankItem-Head">
              <span>{{ feat.feature }}</span>
              <span>{{ formatNumber(feat.count, locale) }}</span>
            </div>
            <div class="console-bar-track">
              <div
                class="console-bar-fill console-bar-fill--success"
                :style="{ width: `${Math.round((feat.count / maxFeatureCount) * 100)}%` }"
              />
            </div>
          </div>
        </div>
        <TxEmptyState v-else variant="no-data" size="small" :title="t('common.noData')" description="" />
      </ConsoleSection>

      <!-- Panel 6: Crash / Error Rate by Version -->
      <ConsoleSection :title="t('admin.panelErrors')" :padded="false">
        <ConsoleTable
          :columns="errorColumns"
          :rows="stabilityRows"
          row-key="version"
          :loading="loading"
          :page="1"
          :limit="20"
          :total="stabilityRows.length"
        >
          <template #cell-version="{ row }">
            <span class="console-mono">{{ row.version }}</span>
          </template>
          <template #cell-errors="{ row }">
            {{ formatNumber(row.errors, locale) }}
          </template>
          <template #cell-errorRate="{ row }">
            <TxStatusBadge
              :text="formatPercent(row.errorRate)"
              :status="row.errorRate > 0.05 ? 'danger' : row.errorRate > 0.01 ? 'warning' : 'success'"
              size="sm"
            />
          </template>
        </ConsoleTable>
      </ConsoleSection>
    </div>

    <!-- Panel 5: Plugin Installs & AI Gateway -->
    <ConsoleSection :title="t('admin.panelEcosystem')">
      <div class="console-form-stack">
        <ConsoleStatGrid :items="aiGatewayStats" :loading="loading" :min="180" :skeleton-count="4" />
        <ConsoleTable
          :columns="pluginColumns"
          :rows="pluginRows"
          row-key="pluginId"
          :loading="loading"
          :page="1"
          :limit="10"
          :total="pluginRows.length"
        >
          <template #cell-pluginId="{ row }">
            <div>
              <div>{{ row.name || row.pluginId }}</div>
              <div class="console-muted console-mono">
{{ row.pluginId }}
</div>
            </div>
          </template>
          <template #cell-installs="{ row }">
            {{ formatNumber(row.installs, locale) }}
          </template>
        </ConsoleTable>
      </div>
    </ConsoleSection>
  </ConsolePageShell>
</template>

<style scoped>
.UsageGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 16px;
}

.UsageTrend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22px, 1fr));
  align-items: end;
  gap: 6px;
  height: 140px;
  padding-top: 8px;
}

.UsageTrend-BarWrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 100%;
}

.UsageTrend-Bar {
  width: 100%;
  max-width: 24px;
  border-radius: 6px 6px 2px 2px;
  background: var(--tx-color-primary);
}

.UsageTrend-Label {
  font-size: 10px;
  color: var(--tx-text-color-regular);
  white-space: nowrap;
}

.UsageRankList {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.UsageRankItem {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.UsageRankItem-Head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.UsageInlineBar {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
</style>
