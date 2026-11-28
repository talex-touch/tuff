<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { TxTextarea } from '@talex-touch/tuffex/textarea'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { AdminStoreReviewItem, DashboardPluginItem } from '@/api/types'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()

const activeTab = ref<'plugins' | 'reviews'>('plugins')
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const rejectTarget = ref<{ plugin: DashboardPluginItem, status: 'rejected' | 'draft' } | null>(null)
const rejectReason = ref('')
const acting = ref(false)

const pluginQueue = useConsoleList<DashboardPluginItem, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    const res = await consoleApi.listAdminStorePlugins({
      page,
      limit,
      q: filters.q || undefined,
    })
    return {
      rows: res.plugins ?? [],
      total: res.pagination?.total ?? 0,
    }
  },
})

const reviewsQueue = useConsoleList<AdminStoreReviewItem, Record<string, never>>({
  defaults: {},
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  fetch: async ({ page, limit }) => {
    const res = await consoleApi.listPendingStoreReviews({ limit, offset: (page - 1) * limit })
    return {
      rows: res.reviews ?? [],
      total: res.total ?? 0,
    }
  },
})

const pluginColumns = computed<DataTableColumn<DashboardPluginItem>[]>(() => [
  { key: 'name', title: t('dashboard.pluginName'), minWidth: 200 },
  { key: 'category', title: t('dashboard.pluginCategory'), minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 110 },
  { key: 'updatedAt', title: t('common.updatedAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 240 },
])

const reviewColumns = computed<DataTableColumn<AdminStoreReviewItem>[]>(() => [
  { key: 'plugin', title: t('admin.pluginCol'), minWidth: 160 },
  { key: 'rating', title: t('admin.ratingCol'), align: 'right', minWidth: 80 },
  { key: 'comment', title: t('admin.commentCol'), minWidth: 240 },
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 170 },
])

async function approvePlugin(plugin: DashboardPluginItem) {
  acting.value = true
  try {
    await consoleApi.updateAdminStorePluginStatus(plugin.id, { status: 'approved' })
    await pluginQueue.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    acting.value = false
  }
}

async function submitRejectOrTakedown() {
  if (!rejectTarget.value)
    return
  acting.value = true
  try {
    await consoleApi.updateAdminStorePluginStatus(rejectTarget.value.plugin.id, {
      status: rejectTarget.value.status,
      reason: rejectReason.value.trim() || undefined,
    })
    rejectTarget.value = null
    rejectReason.value = ''
    await pluginQueue.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    acting.value = false
  }
}

async function moderateReview(review: AdminStoreReviewItem, status: 'approved' | 'rejected') {
  try {
    await consoleApi.updateStoreReviewStatus(review.id, status)
    await reviewsQueue.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}
</script>

<template>
  <ConsolePageShell :title="t('admin.storeTitle')">
    <template #actions>
      <TxButton
        variant="secondary"
        size="sm"
        icon="i-carbon-renew"
        @click="pluginQueue.refresh(); reviewsQueue.refresh()"
      >
        {{ t('common.refresh') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <TxTabs v-model="activeTab">
      <TxTabItem name="plugins">
        <template #name>
{{ t('admin.tabPluginQueue') }}
</template>
        <div class="console-form-stack StoreTabPanel">
          <ConsoleFilterBar :active="pluginQueue.hasActiveFilters.value" @clear="pluginQueue.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="store-plugins-q">
              <TuffInput id="store-plugins-q" v-model="pluginQueue.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="pluginColumns"
              :rows="pluginQueue.rows.value"
              row-key="id"
              :loading="pluginQueue.loading.value"
              :refreshing="pluginQueue.refreshing.value"
              :error="pluginQueue.error.value"
              :filtered="pluginQueue.hasActiveFilters.value"
              :page="pluginQueue.page.value"
              :limit="pluginQueue.limit.value"
              :total="pluginQueue.total.value"
              :page-sizes="pluginQueue.pageSizes"
              @retry="pluginQueue.refresh()"
              @clear-filters="pluginQueue.clearFilters()"
              @update:page="pluginQueue.setPage($event)"
              @update:limit="pluginQueue.setLimit($event)"
            >
              <template #cell-name="{ row }">
                <div>
                  <div>{{ row.name }}</div>
                  <div class="console-muted console-mono">
{{ row.slug }}
</div>
                </div>
              </template>
              <template #cell-status="{ row }">
                <TxStatusBadge
                  :text="row.status"
                  :status="row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : row.status === 'rejected' ? 'danger' : 'muted'"
                  size="sm"
                />
              </template>
              <template #cell-updatedAt="{ row }">
                {{ formatDateTime(row.updatedAt || row.createdAt, locale) }}
              </template>
              <template #cell-actions="{ row }">
                <div class="console-inline-actions">
                  <TxButton v-if="row.status !== 'approved'" variant="primary" size="sm" @click="approvePlugin(row)">
                    {{ t('admin.approve') }}
                  </TxButton>
                  <TxButton
                    v-if="row.status === 'pending'"
                    variant="danger"
                    size="sm"
                    @click="rejectTarget = { plugin: row, status: 'rejected' }"
                  >
                    {{ t('admin.reject') }}
                  </TxButton>
                  <TxButton
                    v-if="row.status === 'approved'"
                    variant="danger"
                    size="sm"
                    @click="rejectTarget = { plugin: row, status: 'rejected' }"
                  >
                    {{ t('admin.takedown') }}
                  </TxButton>
                </div>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="reviews">
        <template #name>
{{ t('admin.tabUserReviews') }}
</template>
        <div class="StoreTabPanel">
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="reviewColumns"
              :rows="reviewsQueue.rows.value"
              row-key="id"
              :loading="reviewsQueue.loading.value"
              :refreshing="reviewsQueue.refreshing.value"
              :error="reviewsQueue.error.value"
              :page="reviewsQueue.page.value"
              :limit="reviewsQueue.limit.value"
              :total="reviewsQueue.total.value"
              :page-sizes="reviewsQueue.pageSizes"
              @retry="reviewsQueue.refresh()"
              @update:page="reviewsQueue.setPage($event)"
              @update:limit="reviewsQueue.setLimit($event)"
            >
              <template #cell-plugin="{ row }">
                {{ row.plugin?.name || row.pluginId }}
              </template>
              <template #cell-createdAt="{ row }">
                {{ formatDateTime(row.createdAt, locale) }}
              </template>
              <template #cell-actions="{ row }">
                <div class="console-inline-actions">
                  <TxButton variant="primary" size="sm" @click="moderateReview(row, 'approved')">
                    {{ t('admin.approve') }}
                  </TxButton>
                  <TxButton variant="danger" size="sm" @click="moderateReview(row, 'rejected')">
                    {{ t('admin.reject') }}
                  </TxButton>
                </div>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>
    </TxTabs>

    <TxModal
      :model-value="Boolean(rejectTarget)"
      :title="t('admin.rejectReasonTitle')"
      :close-label="t('common.close')"
      width="460px"
      @update:model-value="!$event && (rejectTarget = null)"
    >
      <ConsoleFormField :label="t('admin.rejectReasonLabel')" for-id="reject-reason-input">
        <TxTextarea id="reject-reason-input" v-model="rejectReason" :rows="3" />
      </ConsoleFormField>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="rejectTarget = null">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="danger" size="sm" :loading="acting" @click="submitRejectOrTakedown">
          {{ t('common.confirm') }}
        </TxButton>
      </template>
    </TxModal>
  </ConsolePageShell>
</template>

<style scoped>
.StoreTabPanel {
  padding-top: 12px;
}
</style>
