<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { computed } from 'vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminStatGrid from '~/components/admin/AdminStatGrid.vue'
import IntelligenceOverviewPanel from '~/components/dashboard/intelligence/IntelligenceOverviewPanel.vue'
import IntelligenceTopList from '~/components/dashboard/intelligence/IntelligenceTopList.vue'
import IntelligenceUsageLookup from '~/components/dashboard/intelligence/IntelligenceUsageLookup.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminResource } from '~/composables/useAdminResource'
import {
  buildOverviewStatItems,
  buildOverviewTopLists,
  fetchIntelligenceOverview,
  overviewSampleHint,
  resolveOverviewFailure,
} from '~/utils/admin-intelligence'
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

// The administrator gate is the layout's (`useAdminGate`): this page only mounts
// for an administrator, so it neither checks the role nor asks for data it
// cannot have. AdminPageShell is the single template root (no root comment
// either; see test/guards/page-single-root.test.ts).
const { t } = useI18n()
const format = useAdminFormat()

// One request feeds the four metrics, the sample hint and the four ranked lists,
// so they load, fail and retry together. The user lookup and the manual IP ban
// block below send requests of their own.
const overview = useAdminResource({
  fetch: () => fetchIntelligenceOverview(requestJson),
  errorFallback: () => t('dashboard.sections.intelligence.overview.loadFailed', 'Failed to load the AI overview.'),
})

const summary = computed(() => overview.data.value?.summary ?? null)
const statItems = computed(() => (summary.value ? buildOverviewStatItems(summary.value, format, t) : []))
const sampleHint = computed(() => overviewSampleHint(summary.value, format, t))
const topLists = computed(() => buildOverviewTopLists(overview.data.value, format, t))

// A failed first load replaces the metrics and the lists with an error state; a
// failed refresh keeps them under a notice (`resolveOverviewFailure`).
const failure = computed(() => resolveOverviewFailure({
  hasData: Boolean(overview.data.value),
  loading: overview.loading.value,
  error: overview.error.value,
}))
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.intelligenceOverview', 'AI Overview')">
    <template #actions>
      <TxButton
        variant="secondary"
        size="sm"
        :disabled="overview.loading.value || overview.refreshing.value"
        @click="overview.refresh()"
      >
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <div class="IntelligenceOverview">
      <AdminSection v-if="failure === 'first-load'" :title="t('dashboard.sections.intelligence.overview.metricsTitle', 'Call Metrics')">
        <TxErrorState
          size="small"
          :title="t('dashboard.sections.intelligence.overview.loadFailedTitle', 'Could not load the overview')"
          :description="overview.error.value ?? ''"
          :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
          @primary="overview.refresh()"
        />
      </AdminSection>

      <template v-else>
        <TxAlert
          v-if="failure === 'refresh'"
          type="error"
          :closable="false"
          :title="t('dashboard.sections.intelligence.overview.refreshFailed', 'Refresh failed. Showing the last loaded data.')"
        >
          <span class="IntelligenceOverview-Notice">
            <span>{{ overview.error.value }}</span>
            <TxButton variant="flat" size="sm" :loading="overview.refreshing.value" @click="overview.refresh()">
              {{ t('common.retry', 'Retry') }}
            </TxButton>
          </span>
        </TxAlert>

        <AdminSection :title="t('dashboard.sections.intelligence.overview.metricsTitle', 'Call Metrics')" :description="sampleHint">
          <AdminStatGrid :items="statItems" :loading="overview.loading.value" />
        </AdminSection>

        <div class="IntelligenceOverview-Lists">
          <AdminSection v-for="list in topLists" :key="list.key" :title="list.title">
            <IntelligenceTopList
              :rows="list.rows"
              :loading="overview.loading.value"
              :skeleton-rows="list.limit"
              :empty-text="t('dashboard.sections.intelligence.overview.empty', 'No data')"
            />
          </AdminSection>
        </div>
      </template>

      <IntelligenceUsageLookup />

      <!-- The manual IP ban block, unchanged and after the overview: it moves to
           the risk console with its own task. -->
      <IntelligenceOverviewPanel />
    </div>
  </AdminPageShell>
</template>

<style scoped>
/* The page body is the query container: the ranked lists go two abreast once
   there is room, and four abreast on a wide screen. */
.IntelligenceOverview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  container: intelligence-overview / inline-size;
}

.IntelligenceOverview-Notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.IntelligenceOverview-Lists {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@container intelligence-overview (min-width: 640px) {
  .IntelligenceOverview-Lists {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container intelligence-overview (min-width: 1280px) {
  .IntelligenceOverview-Lists {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
