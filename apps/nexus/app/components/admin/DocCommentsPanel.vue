<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { DocComment } from '~/utils/admin-comments'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { computed, ref, watch } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminIdentity from '~/components/admin/AdminIdentity.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  createDocCommentListOptions,
  docCommentAnalyticsLink,
  docCommentDocumentLink,
  docCommentPath,
} from '~/utils/admin-comments'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import { requestJson } from '~/utils/request'

/**
 * The doc comment queue of `/admin/reviews?tab=docs`. Its path filter, page and
 * page size live in the URL as `?d_path=` / `?d_page=` / `?d_limit=`, so leaving
 * for the plugin review queue and coming back lands on the same filtered page.
 * Deleting asks first.
 */
const { t, locale } = useI18n()
// Document links open the docs page in the administrator's language.
const linkLocale = computed<'en' | 'zh'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const format = useAdminFormat()
const toast = useToast()
const { deviceId } = useDeviceIdentity()
const { isAdmin } = useAccountRole()

const list = useAdminList(createDocCommentListOptions(
  requestJson,
  () => t('dashboard.sections.docComments.loadFailed', 'Unable to load comments.'),
))
const filters = list.filters

const commentsTracker = useDocEngagementTracker({
  source: 'doc_comments_admin',
  // Analytics keeps its established source identifier; this is not a route.
  path: () => 'admin/doc-comments',
  title: () => 'Doc Comments',
  clientId: () => deviceId.value || '',
  enabled: () => isAdmin.value,
  trackSections: false,
  captureSelection: false,
})

// A path filter that took effect (after the list's debounce) is a moderation
// action worth recording, as it was before the list moved onto useAdminList.
watch(() => list.appliedFilters.value.path, (path) => {
  const keyword = path.trim()
  if (!keyword)
    return
  void commentsTracker.recordAction({
    type: 'filter',
    source: 'toolbar',
    sectionId: 'root',
    sectionTitle: 'Doc comments',
    text: keyword,
  })
})

function refresh(): Promise<void> {
  void commentsTracker.recordAction({
    type: 'refresh',
    source: 'toolbar',
    sectionId: 'root',
    sectionTitle: 'Doc comments',
  })
  return list.refresh()
}

// At a 1280px viewport the table is about 976px wide; the comment takes what
// the fixed columns leave (about 340px) and is shown in full in the drawer.
const columns = computed<DataTableColumn<DocComment>[]>(() => [
  { key: 'author', title: t('dashboard.sections.docComments.table.author', 'Author'), width: 168 },
  { key: 'path', title: t('dashboard.sections.docComments.table.path', 'Document'), width: 220 },
  { key: 'comment', title: t('dashboard.sections.docComments.table.comment', 'Comment') },
  { key: 'submitted', title: t('dashboard.sections.docComments.table.submitted', 'Submitted'), width: 144 },
  { key: 'actions', title: t('dashboard.sections.docComments.table.actions', 'Actions'), width: 96, align: 'right', fixed: 'right' },
])

function authorName(comment: DocComment): string {
  return comment.userName?.trim() || t('dashboard.sections.docComments.anonymous', 'Anonymous')
}

// Detail drawer: the whole comment and its links.
const detailComment = ref<DocComment | null>(null)
const detailOpen = ref(false)

function openDetail(comment: DocComment) {
  detailComment.value = comment
  detailOpen.value = true
}

// Delete, behind a confirmation.
const deleteTarget = ref<DocComment | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)

function requestDelete(comment: DocComment) {
  deleteTarget.value = comment
  deleteOpen.value = true
}

async function confirmDelete() {
  const comment = deleteTarget.value
  if (!comment || deleting.value)
    return
  deleting.value = true
  try {
    await requestJson(docCommentPath(comment.id), { method: 'DELETE' })
    deleteOpen.value = false
    if (detailComment.value?.id === comment.id)
      detailOpen.value = false
    toast.success(t('dashboard.sections.docComments.deleteSuccess', 'Comment deleted.'))
    void commentsTracker.recordAction({
      type: 'delete',
      source: 'moderation',
      sectionId: 'root',
      sectionTitle: comment.path,
      text: comment.content,
      textLength: comment.content.length,
    })
    await list.refresh()
  }
  catch (error: unknown) {
    toast.warning(resolveAdminErrorMessage(error, t('dashboard.sections.docComments.deleteFailed', 'Failed to delete comment.')))
  }
  finally {
    deleting.value = false
  }
}

defineExpose({
  refresh,
  busy: computed(() => list.loading.value || list.refreshing.value),
})
</script>

<template>
  <div class="DocCommentQueue">
    <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
      <AdminFilterField :label="t('dashboard.sections.docComments.filters.pathLabel', 'Document path')" for="admin-doc-comments-path" wide>
        <TxSearchInput
          id="admin-doc-comments-path"
          v-model="filters.path"
          autocomplete="off"
          :placeholder="t('dashboard.sections.docComments.filterPlaceholder', 'Filter by doc path…')"
        />
      </AdminFilterField>
      <template #trailing>
        <NuxtLink class="DocCommentQueue-AnalyticsLink" :to="docCommentAnalyticsLink()">
          {{ t('dashboard.sections.docComments.analytics', 'View docs analytics') }}
        </NuxtLink>
      </template>
    </AdminFilterBar>

    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="list.loading.value"
        :refreshing="list.refreshing.value"
        :error="list.error.value"
        :empty-title="t('dashboard.sections.docComments.empty', 'No comments yet.')"
        :filtered-empty-title="t('dashboard.sections.docComments.filteredEmpty', 'No comments on this document.')"
        :filtered="list.hasActiveFilters.value"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="list.refresh()"
        @clear-filters="list.clearFilters()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
        @row-click="openDetail"
      >
        <template #cell-author="{ row }">
          <AdminIdentity :name="row.userName" :avatar="row.userImage" :fallback="authorName(row)" size="sm" compact />
        </template>
        <template #cell-path="{ row }">
          <span class="CommentCell" :title="row.path">
            <NuxtLink class="CommentCell-Link" :to="docCommentDocumentLink(row.path, linkLocale)" @click.stop>
              {{ row.path }}
            </NuxtLink>
            <NuxtLink
              class="CommentCell-Analytics"
              :to="docCommentAnalyticsLink(row.path)"
              :aria-label="t('dashboard.sections.docComments.analyticsForPath', 'Analytics for this document')"
              :title="t('dashboard.sections.docComments.analyticsForPath', 'Analytics for this document')"
              @click.stop
            >
              <span class="i-carbon-chart-line" aria-hidden="true" />
            </NuxtLink>
          </span>
        </template>
        <template #cell-comment="{ row }">
          <span class="CommentCell" :title="row.content">
            <span class="CommentCell-Text">{{ row.content }}</span>
          </span>
        </template>
        <template #cell-submitted="{ row }">
          <span class="CommentCell is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <span class="CommentCell is-actions" @click.stop>
            <TxButton variant="danger" size="sm" :disabled="deleting" @click.stop="requestDelete(row)">
              {{ t('dashboard.sections.docComments.delete', 'Delete') }}
            </TxButton>
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="t('dashboard.sections.docComments.detail.title', 'Comment')" size="520px">
      <TxDescriptions v-if="detailComment" :columns="1" size="sm">
        <TxDescriptionsItem :label="t('dashboard.sections.docComments.table.author', 'Author')">
          <AdminIdentity :name="detailComment.userName" :avatar="detailComment.userImage" :fallback="authorName(detailComment)" size="sm" />
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.docComments.table.path', 'Document')">
          <NuxtLink class="CommentDetail-Link" :to="docCommentDocumentLink(detailComment.path, linkLocale)">
            {{ detailComment.path }}
          </NuxtLink>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.docComments.table.submitted', 'Submitted')">
          {{ format.dateTimeTitle(detailComment.createdAt) }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.docComments.table.comment', 'Comment')">
          <span class="CommentDetail-Text">{{ detailComment.content }}</span>
        </TxDescriptionsItem>
      </TxDescriptions>
      <template #footer>
        <div v-if="detailComment" class="CommentDetail-Actions">
          <NuxtLink class="DocCommentQueue-AnalyticsLink" :to="docCommentAnalyticsLink(detailComment.path)">
            {{ t('dashboard.sections.docComments.analyticsForPath', 'Analytics for this document') }}
          </NuxtLink>
          <TxButton variant="danger" size="sm" :disabled="deleting" @click="requestDelete(detailComment)">
            {{ t('dashboard.sections.docComments.delete', 'Delete') }}
          </TxButton>
        </div>
      </template>
    </TxDrawer>

    <AdminConfirmDialog
      v-model:open="deleteOpen"
      :title="t('dashboard.sections.docComments.confirmDeleteTitle', 'Delete comment')"
      :description="deleteTarget ? t('dashboard.sections.docComments.confirmDeleteMessage', { path: deleteTarget.path }) : ''"
      :confirm-label="t('dashboard.sections.docComments.delete', 'Delete')"
      tone="danger"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.DocCommentQueue {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.DocCommentQueue-AnalyticsLink {
  color: var(--tx-color-primary);
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
}

.DocCommentQueue-AnalyticsLink:hover {
  text-decoration: underline;
}

/* Every cell is one line box tall — the height of the table's skeleton row — so
   nothing moves when the rows replace the placeholders; the 26px button is
   centred in that box and overhangs it into the cell's padding. What does not
   fit is cut with an ellipsis and shown in full in the title and the drawer. */
.CommentCell {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 1lh;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  white-space: nowrap;
}

.CommentCell.is-numeric {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.CommentCell.is-actions {
  justify-content: flex-end;
  overflow: visible;
}

.CommentCell-Link {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-color-primary);
  text-decoration: none;
  text-overflow: ellipsis;
}

.CommentCell-Link:hover {
  text-decoration: underline;
}

.CommentCell-Analytics {
  display: inline-flex;
  flex: none;
  align-items: center;
  color: var(--tx-text-color-regular);
  font-size: 14px;
}

.CommentCell-Analytics:hover {
  color: var(--tx-color-primary);
}

.CommentCell-Text {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-regular);
  text-overflow: ellipsis;
}

.CommentDetail-Link {
  color: var(--tx-color-primary);
  overflow-wrap: anywhere;
}

.CommentDetail-Text {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.CommentDetail-Actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
