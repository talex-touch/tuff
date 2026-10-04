<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TuffInput } from '@talex-touch/tuffex/input'
import { computed, ref, useId } from 'vue'
import AdminFormField from '~/components/admin/AdminFormField.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminStatGrid from '~/components/admin/AdminStatGrid.vue'
import IntelligenceTopList from '~/components/dashboard/intelligence/IntelligenceTopList.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminResource } from '~/composables/useAdminResource'
import { buildRankRows, buildUsageStatItems, fetchIntelligenceUsage, normalizeUsageLookupInput, resolveUsageLookupView } from '~/utils/admin-intelligence'
import { requestJson } from '~/utils/request'

/**
 * The AI overview's per-user lookup: one labelled user id, sent with Enter or
 * the button, and that user's calls as four cards and a model breakdown. It has
 * its own request, so it loads and fails apart from the overview above it.
 */
const { t } = useI18n()
const format = useAdminFormat()
const inputId = useId()

const userIdInput = ref('')
/** The trimmed id of the latest query; `fetch` reads it, so the newest query is the one asked. */
const submittedUserId = ref<string | null>(null)

// On demand: nothing is asked until the first query, and a newer query
// overrides an older one still in flight.
const usage = useAdminResource({
  fetch: () => fetchIntelligenceUsage(requestJson, submittedUserId.value ?? ''),
  errorFallback: () => t('dashboard.sections.intelligence.usage.loadFailed', 'Failed to load usage.'),
  immediate: false,
})

const canSubmit = computed(() => normalizeUsageLookupInput(userIdInput.value) !== null)

// Enter in the field submits the form, so it and the button are one path.
function submit() {
  const userId = normalizeUsageLookupInput(userIdInput.value)
  if (!userId)
    return
  submittedUserId.value = userId
  void usage.refresh()
}

const pending = computed(() => usage.loading.value || usage.refreshing.value)

const view = computed(() => resolveUsageLookupView({
  submittedUserId: submittedUserId.value,
  data: usage.data.value,
  pending: pending.value,
  error: usage.error.value,
}))

const statItems = computed(() => (view.value.state === 'result' ? buildUsageStatItems(view.value.lookup.result, format, t) : []))
const modelRows = computed(() => (view.value.state === 'result' ? buildRankRows(view.value.lookup.result.models, format) : []))
</script>

<template>
  <AdminSection
    :title="t('dashboard.sections.intelligence.overview.userUsage.title', 'User Usage Lookup')"
    :description="t('dashboard.sections.intelligence.overview.userUsage.subtitle', 'Query recent usage by user ID (audit sample)')"
  >
    <div class="UsageLookup">
      <form class="UsageLookup-Form" novalidate @submit.prevent="submit">
        <AdminFormField
          class="UsageLookup-Field"
          :label="t('dashboard.sections.intelligence.overview.userUsage.userIdLabel', 'User ID')"
          :for="inputId"
        >
          <TuffInput
            :id="inputId"
            v-model="userIdInput"
            autocomplete="off"
            :placeholder="t('dashboard.sections.intelligence.overview.userUsage.placeholder', 'Enter user ID')"
          />
        </AdminFormField>
        <TxButton variant="primary" size="sm" native-type="submit" :disabled="!canSubmit">
          {{ t('dashboard.sections.intelligence.overview.userUsage.action', 'Query') }}
        </TxButton>
      </form>

      <div v-if="view.state !== 'idle'" class="UsageLookup-Result" :aria-busy="pending || undefined">
        <TxErrorState
          v-if="view.state === 'error'"
          size="small"
          :title="t('dashboard.sections.intelligence.overview.userUsage.failedTitle', 'Lookup failed')"
          :description="view.message"
          :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
          @primary="usage.refresh()"
        />
        <TxEmptyState
          v-else-if="view.state === 'empty'"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.intelligence.overview.userUsage.noRecords', 'This user has no AI calls on record.')"
          description=""
        />
        <template v-else>
          <AdminStatGrid :items="statItems" :loading="view.state === 'loading'" />
          <div class="UsageLookup-Models">
            <h3 class="UsageLookup-ModelsTitle">
              {{ t('dashboard.sections.intelligence.overview.userUsage.modelBreakdown', 'Model Breakdown') }}
            </h3>
            <IntelligenceTopList
              :rows="modelRows"
              :loading="view.state === 'loading'"
              :skeleton-rows="3"
              :empty-text="t('dashboard.sections.intelligence.overview.empty', 'No data')"
            />
          </div>
        </template>
      </div>
    </div>
  </AdminSection>
</template>

<style scoped>
.UsageLookup {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* The field and its button on one row, the button level with the input. */
.UsageLookup-Form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.UsageLookup-Field {
  flex: 0 1 360px;
}

.UsageLookup-Result {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.UsageLookup-Models {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.UsageLookup-ModelsTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}
</style>
