<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { PendingPluginReview, PluginReviewDecision } from '~/utils/admin-comments'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { computed, ref } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import AdminIdentity from '~/components/admin/AdminIdentity.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import { useToast } from '~/composables/useToast'
import { createPluginReviewListOptions, pluginReviewStatusPath } from '~/utils/admin-comments'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import { requestJson } from '~/utils/request'

/**
 * The pending plugin review queue of `/admin/reviews?tab=plugins`. Its page and
 * page size live in the URL as `?p_page=` / `?p_limit=`, so leaving for the doc
 * comment queue and coming back lands on the same page. Approving and rejecting
 * both ask first; the count of pending reviews is the table footer's total.
 */
const { t } = useI18n()
const format = useAdminFormat()
const toast = useToast()

const list = useAdminList(createPluginReviewListOptions(
  requestJson,
  () => t('dashboard.sections.reviews.loadFailed', 'Unable to load pending reviews.'),
))

// At a 1280px viewport the table is about 976px wide; the review text takes
// what the fixed columns leave (about 270px) and is shown in full in the drawer.
const columns = computed<DataTableColumn<PendingPluginReview>[]>(() => [
  { key: 'plugin', title: t('dashboard.sections.reviews.table.plugin', 'Plugin'), width: 168 },
  { key: 'author', title: t('dashboard.sections.reviews.table.author', 'Author'), width: 152 },
  { key: 'rating', title: t('dashboard.sections.reviews.table.rating', 'Rating'), width: 72 },
  { key: 'review', title: t('dashboard.sections.reviews.table.review', 'Review') },
  { key: 'submitted', title: t('dashboard.sections.reviews.table.submitted', 'Submitted'), width: 144 },
  { key: 'actions', title: t('dashboard.sections.reviews.table.actions', 'Actions'), width: 172, align: 'right', fixed: 'right' },
])

function pluginName(review: PendingPluginReview): string {
  return review.plugin?.name || t('dashboard.sections.reviews.unknownPlugin', 'Unknown plugin')
}

function pluginSlug(review: PendingPluginReview): string {
  return review.plugin?.slug || review.pluginId
}

function authorName(review: PendingPluginReview): string {
  return review.author?.name?.trim() || t('store.detail.reviews.anonymous', 'Anonymous')
}

function reviewText(review: PendingPluginReview): string {
  return [review.title, review.content].filter(Boolean).join(' · ')
}

// Detail drawer: the whole review and the same two decisions.
const detailReview = ref<PendingPluginReview | null>(null)
const detailOpen = ref(false)

function openDetail(review: PendingPluginReview) {
  detailReview.value = review
  detailOpen.value = true
}

// Approve / reject, each behind a confirmation.
const decision = ref<{ review: PendingPluginReview, status: PluginReviewDecision } | null>(null)
const decisionOpen = ref(false)
const deciding = ref(false)

const decisionCopy = computed(() => {
  const pending = decision.value
  if (!pending)
    return { title: '', description: '', confirm: '' }
  const named = { author: authorName(pending.review), plugin: pluginName(pending.review) }
  return pending.status === 'approved'
    ? {
        title: t('dashboard.sections.reviews.approveTitle', 'Approve this review?'),
        description: t('dashboard.sections.reviews.approveDescription', named),
        confirm: t('dashboard.sections.reviews.approve', 'Approve'),
      }
    : {
        title: t('dashboard.sections.reviews.rejectTitle', 'Reject this review?'),
        description: t('dashboard.sections.reviews.rejectDescription', named),
        confirm: t('dashboard.sections.reviews.reject', 'Reject'),
      }
})

function requestDecision(review: PendingPluginReview, status: PluginReviewDecision) {
  decision.value = { review, status }
  decisionOpen.value = true
}

async function confirmDecision() {
  const pending = decision.value
  if (!pending || deciding.value)
    return
  deciding.value = true
  try {
    await requestJson(pluginReviewStatusPath(pending.review.id), {
      method: 'PATCH',
      body: { status: pending.status },
    })
    decisionOpen.value = false
    if (detailReview.value?.id === pending.review.id)
      detailOpen.value = false
    toast.success(t('dashboard.sections.reviews.actionSuccess', 'Review status updated.'))
    await list.refresh()
  }
  catch (error: unknown) {
    toast.warning(resolveAdminErrorMessage(error, t('dashboard.sections.reviews.actionFailed', 'Failed to update review.')))
  }
  finally {
    deciding.value = false
  }
}

defineExpose({
  refresh: () => list.refresh(),
  busy: computed(() => list.loading.value || list.refreshing.value),
})
</script>

<template>
  <div class="ReviewQueue">
    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="list.loading.value"
        :refreshing="list.refreshing.value"
        :error="list.error.value"
        :empty-title="t('dashboard.sections.reviews.empty', 'No pending reviews yet.')"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="list.refresh()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
        @row-click="openDetail"
      >
        <template #cell-plugin="{ row }">
          <span class="ReviewCell" :title="`${pluginName(row)} · ${pluginSlug(row)}`">
            <span class="ReviewCell-Primary">{{ pluginName(row) }}</span>
            <span class="ReviewCell-Muted">{{ pluginSlug(row) }}</span>
          </span>
        </template>
        <template #cell-author="{ row }">
          <AdminIdentity :name="row.author?.name" :avatar="row.author?.avatarUrl" :fallback="authorName(row)" size="sm" compact />
        </template>
        <template #cell-rating="{ row }">
          <span class="ReviewCell is-rating">{{ row.rating }}/5</span>
        </template>
        <template #cell-review="{ row }">
          <span class="ReviewCell" :title="reviewText(row)">
            <span v-if="row.title" class="ReviewCell-Primary">{{ row.title }}</span>
            <span class="ReviewCell-Content">{{ row.content }}</span>
          </span>
        </template>
        <template #cell-submitted="{ row }">
          <span class="ReviewCell is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <span class="ReviewCell is-actions" @click.stop>
            <TxButton variant="success" size="sm" :disabled="deciding" @click.stop="requestDecision(row, 'approved')">
              {{ t('dashboard.sections.reviews.approve', 'Approve') }}
            </TxButton>
            <TxButton variant="danger" size="sm" :disabled="deciding" @click.stop="requestDecision(row, 'rejected')">
              {{ t('dashboard.sections.reviews.reject', 'Reject') }}
            </TxButton>
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="t('dashboard.sections.reviews.detail.title', 'Review')" size="520px">
      <TxDescriptions v-if="detailReview" :columns="1" size="sm">
        <TxDescriptionsItem :label="t('dashboard.sections.reviews.table.plugin', 'Plugin')">
          {{ pluginName(detailReview) }}
          <code class="ReviewDetail-Code">{{ pluginSlug(detailReview) }}</code>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.reviews.table.author', 'Author')">
          <AdminIdentity :name="detailReview.author?.name" :avatar="detailReview.author?.avatarUrl" :fallback="authorName(detailReview)" size="sm" />
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.reviews.table.rating', 'Rating')">
          {{ detailReview.rating }}/5
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.reviews.detail.reviewTitle', 'Title')">
          {{ detailReview.title }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.reviews.table.review', 'Review')">
          <span class="ReviewDetail-Text">{{ detailReview.content }}</span>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.reviews.table.submitted', 'Submitted')">
          {{ format.dateTimeTitle(detailReview.createdAt) }}
        </TxDescriptionsItem>
      </TxDescriptions>
      <template #footer>
        <div v-if="detailReview" class="ReviewDetail-Actions">
          <TxButton variant="danger" size="sm" :disabled="deciding" @click="requestDecision(detailReview, 'rejected')">
            {{ t('dashboard.sections.reviews.reject', 'Reject') }}
          </TxButton>
          <TxButton variant="success" size="sm" :disabled="deciding" @click="requestDecision(detailReview, 'approved')">
            {{ t('dashboard.sections.reviews.approve', 'Approve') }}
          </TxButton>
        </div>
      </template>
    </TxDrawer>

    <AdminConfirmDialog
      v-model:open="decisionOpen"
      :title="decisionCopy.title"
      :description="decisionCopy.description"
      :confirm-label="decisionCopy.confirm"
      :tone="decision?.status === 'approved' ? 'warning' : 'danger'"
      :loading="deciding"
      @confirm="confirmDecision"
    />
  </div>
</template>

<style scoped>
/* Every cell is one line box tall — the height of the table's skeleton row — so
   nothing moves when the rows replace the placeholders; the 26px buttons are
   centred in that box and overhang it into the cell's padding. What does not fit
   is cut with an ellipsis and shown in full in the title and the drawer. */
.ReviewCell {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 1lh;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  white-space: nowrap;
}

.ReviewCell.is-numeric,
.ReviewCell.is-rating {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.ReviewCell.is-rating {
  color: var(--tx-color-warning);
  font-weight: 600;
}

.ReviewCell.is-actions {
  justify-content: flex-end;
  gap: 8px;
  overflow: visible;
}

.ReviewCell-Primary {
  flex: none;
  max-width: 100%;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
}

.ReviewCell-Muted,
.ReviewCell-Content {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-regular);
  text-overflow: ellipsis;
}

.ReviewDetail-Text {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.ReviewDetail-Code {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--tx-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.ReviewDetail-Actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
