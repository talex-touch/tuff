<script setup lang="ts">
import type {
  PerformanceResourceReport,
  PerformanceWorkerSample
} from '@talex-touch/utils/transport/events/types'
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatElu, formatMemory, formatPercent, formatUptimeShort } from './format'

const props = defineProps<{ report: PerformanceResourceReport }>()
const { t, te } = useI18n()
const columns = computed<DataTableColumn<PerformanceWorkerSample>[]>(() => [
  { key: 'role', title: t('settingPerformance.workerRole'), minWidth: 270 },
  { key: 'threadId', title: t('settingPerformance.threadId'), width: 80 },
  { key: 'cpuPercent', title: t('settingPerformance.metrics.cpu'), width: 85 },
  { key: 'eventLoopUtilization', title: t('settingPerformance.workerElu'), width: 95 },
  { key: 'heap', title: t('settingPerformance.heap'), minWidth: 135 },
  { key: 'uptimeMs', title: t('settingPerformance.uptime'), width: 85 }
])
const threadKinds = ['chromium', 'io', 'v8', 'libuv', 'node', 'tokio', 'actor']
const budget = computed(() => props.report.nativeRuntimes)
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t('settingPerformance.threads')">
    <div>
      <h2 class="text-base font-semibold">{{ t('settingPerformance.threads') }}</h2>
      <h3 class="mt-3 font-medium">{{ t('settingPerformance.nodeWorkers') }}</h3>
      <p>{{ t('settingPerformance.workerNote') }}</p>
    </div>
    <TxDataTable
      :columns="columns"
      :data="report.workers"
      row-key="threadId"
      :scroll-x="true"
      :empty-text="t('settingPerformance.workerEmpty')"
    >
      <template #cell-role="{ row }">
        <div class="flex flex-col gap-1">
          <span class="font-medium">{{
            t(`settingPerformance.workerRoles.${row.role}.name`)
          }}</span>
          <p class="whitespace-normal">
            {{ t(`settingPerformance.workerRoles.${row.role}.description`) }}
          </p>
          <TxTag v-if="row.instance" class="self-start">
            {{
              te(`settingPerformance.readerLanes.${row.instance}`)
                ? t(`settingPerformance.readerLanes.${row.instance}`)
                : row.instance
            }}
          </TxTag>
        </div>
      </template>
      <template #cell-cpuPercent="{ row }">{{ formatPercent(row.cpuPercent) }}</template>
      <template #cell-eventLoopUtilization="{ row }">{{
        formatElu(row.eventLoopUtilization)
      }}</template>
      <template #cell-heap="{ row }"
        >{{ formatMemory(row.heapUsedBytes) }} / {{ formatMemory(row.heapLimitBytes) }}</template
      >
      <template #cell-uptimeMs="{ row }">{{ formatUptimeShort(row.uptimeMs) }}</template>
    </TxDataTable>
    <TxCard background="refraction" :padding="16">
      <div class="flex flex-col gap-2">
        <h3 class="font-semibold">{{ t('settingPerformance.nativeRuntimes') }}</h3>
        <p>
          {{
            t(
              'settingPerformance.tokioBudget',
              { workerThreads: budget.workerThreads },
              budget.workerThreads
            )
          }}
        </p>
        <div>
          <TxTag>{{ t(`settingPerformance.budgetSources.${budget.source}`) }}</TxTag>
        </div>
        <p>
          {{ t('settingPerformance.tokioDefault', { logicalCpuCount: report.logicalCpuCount }) }}
        </p>
        <h4 class="font-medium">{{ t('settingPerformance.builtRuntimes') }}</h4>
        <ul v-if="budget.built.length" class="flex flex-col gap-1">
          <li v-for="runtime in budget.built" :key="runtime">
            {{ t(`settingPerformance.runtimeNames.${runtime}`) }}
          </li>
        </ul>
        <p v-else>{{ t('settingPerformance.runtimeEmpty') }}</p>
      </div>
    </TxCard>
    <div class="flex flex-col gap-2">
      <h3 class="font-semibold">{{ t('settingPerformance.threadComposition') }}</h3>
      <p>{{ t('settingPerformance.compositionNote') }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="kind in threadKinds" :key="kind">
          {{ t(`settingPerformance.threadKinds.${kind}`) }}
        </li>
      </ul>
    </div>
  </section>
</template>
