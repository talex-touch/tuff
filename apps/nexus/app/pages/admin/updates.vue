<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { AdminUpdate, AdminUpdateScope, AdminUpdateType } from '~/utils/admin-updates'
import { TxButton, TxIconButton } from '@talex-touch/tuffex/button'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxTag } from '@talex-touch/tuffex/tag'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import UpdateFormDrawer from '~/components/dashboard/UpdateFormDrawer.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import { useToast } from '~/composables/useToast'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import {
  ADMIN_UPDATE_CHANNELS,
  ADMIN_UPDATE_SCOPES,
  ADMIN_UPDATE_TYPES,
  createUpdatesListSource,
  isAutoUpdate,
  isEditableUpdate,
  localizedUpdateText,
  updateDateLabels,
  updateItemPath,
} from '~/utils/admin-updates'
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
// cannot have.
const { t, locale } = useI18n()
const format = useAdminFormat()
const toast = useToast()

const CHANGELOG_URL = 'https://docs.tuff.chat/changelog'

// The endpoint answers with every update at once; the list filters and pages
// that copy, while the page, the page size and every filter stay in the URL.
const updatesSource = createUpdatesListSource(
  path => requestJson(path),
  () => t('dashboard.sections.updates.loadFailed', 'Updates and news could not be loaded. Check your connection and try again.'),
)
const list = useAdminList(updatesSource.options)
const filters = list.filters

/** Loads every update again (the copy the list pages through is replaced), keeping the rows on screen meanwhile. */
function reload(): Promise<void> {
  updatesSource.fetch.invalidate()
  return list.refresh()
}

function typeLabel(type: AdminUpdateType): string {
  switch (type) {
    case 'release':
      return t('dashboard.sections.updates.typeRelease', 'Release')
    case 'announcement':
      return t('dashboard.sections.updates.typeAnnouncement', 'Announcement')
    case 'config':
      return t('dashboard.sections.updates.typeConfig', 'Config')
    case 'data':
      return t('dashboard.sections.updates.typeData', 'Data')
    default:
      return t('dashboard.sections.updates.typeNews', 'News')
  }
}

function scopeLabel(scope: AdminUpdateScope): string {
  if (scope === 'system')
    return t('dashboard.sections.updates.scopeSystem', 'System')
  if (scope === 'both')
    return t('dashboard.sections.updates.scopeBoth', 'Web + System')
  return t('dashboard.sections.updates.scopeWeb', 'Web')
}

function sourceLabel(update: AdminUpdate): string {
  return isAutoUpdate(update)
    ? t('dashboard.sections.updates.sourceAuto', 'Auto')
    : t('dashboard.sections.updates.sourceManual', 'Manual')
}

const typeOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.updates.filters.typeAll', 'All types') },
  ...ADMIN_UPDATE_TYPES.map(type => ({ value: type, label: typeLabel(type) })),
])

const channelOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.updates.filters.channelAll', 'All channels') },
  ...ADMIN_UPDATE_CHANNELS.map(channel => ({ value: channel, label: channel })),
])

const scopeOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.updates.filters.scopeAll', 'All scopes') },
  ...ADMIN_UPDATE_SCOPES.map(scope => ({ value: scope, label: scopeLabel(scope) })),
])

const sourceOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.updates.filters.sourceAll', 'All sources') },
  { value: 'auto', label: t('dashboard.sections.updates.filters.sourceAuto', 'Auto (release sync)') },
  { value: 'manual', label: t('dashboard.sections.updates.filters.sourceManual', 'Manual') },
])

const rangeOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.updates.filters.rangeAll', 'All time') },
  { value: '7d', label: t('dashboard.sections.updates.filters.range7d', 'Last 7 days') },
  { value: '30d', label: t('dashboard.sections.updates.filters.range30d', 'Last 30 days') },
  { value: '90d', label: t('dashboard.sections.updates.filters.range90d', 'Last 90 days') },
])

// Fixed widths for everything but the title, which takes the rest: at a 1280px
// viewport the table is about 976px wide and the title keeps about 276px of it.
// Type and scope are sized for their longest English badge (`Announcement`,
// `Web + System`, about 123px with the cell padding).
// Each cell is one line, cut with an ellipsis; the full text is in the row's
// detail drawer. The date column prints the day only (`updateDateLabels`): a
// manual update is a calendar day stored at UTC midnight, read in UTC, so a
// clock there would only show the reader's offset and a local reading would
// move it to the day before west of UTC. A synced release keeps its local time
// in the tooltip and the drawer.
const columns = computed<DataTableColumn<AdminUpdate>[]>(() => [
  { key: 'title', title: t('dashboard.sections.updates.table.title', 'Title / Summary') },
  { key: 'type', title: t('dashboard.sections.updates.table.type', 'Type'), width: 128 },
  { key: 'channels', title: t('dashboard.sections.updates.table.channels', 'Channel'), width: 132 },
  { key: 'scope', title: t('dashboard.sections.updates.table.scope', 'Scope'), width: 128 },
  { key: 'source', title: t('dashboard.sections.updates.table.source', 'Source'), width: 88 },
  { key: 'time', title: t('dashboard.sections.updates.table.time', 'Date'), width: 112 },
  { key: 'actions', title: t('dashboard.sections.updates.table.actions', 'Actions'), width: 112, align: 'right', fixed: 'right' },
])

function titleOf(update: AdminUpdate): string {
  return localizedUpdateText(update.title, locale.value)
}

function summaryOf(update: AdminUpdate): string {
  return localizedUpdateText(update.summary, locale.value)
}

function rowTitle(update: AdminUpdate): string {
  return [update.releaseTag, titleOf(update), summaryOf(update)].filter(Boolean).join(' · ')
}

function typeColor(type: AdminUpdateType): string {
  if (type === 'release' || type === 'data')
    return 'var(--tx-color-primary)'
  if (type === 'announcement')
    return 'var(--tx-color-warning)'
  if (type === 'config')
    return 'var(--tx-color-success)'
  return 'var(--tx-text-color-secondary)'
}

function scopeColor(scope: AdminUpdateScope): string {
  if (scope === 'both')
    return 'var(--tx-color-primary)'
  if (scope === 'system')
    return 'var(--tx-color-warning)'
  return 'var(--tx-text-color-secondary)'
}

function sourceColor(update: AdminUpdate): string {
  return isAutoUpdate(update) ? 'var(--tx-color-success)' : 'var(--tx-text-color-secondary)'
}

function channelColor(channel: string): string {
  const normalized = channel.toUpperCase()
  if (normalized === 'RELEASE')
    return 'var(--tx-color-primary)'
  if (normalized === 'BETA')
    return 'var(--tx-color-warning)'
  if (normalized === 'SNAPSHOT')
    return 'var(--tx-color-danger)'
  return 'var(--tx-text-color-secondary)'
}

function openExternal(link?: string | null) {
  if (link && hasWindow())
    window.open(link, '_blank', 'noopener')
}

// Detail drawer: the full text of a row, both languages, and its actions.
const detailUpdate = ref<AdminUpdate | null>(null)
const detailOpen = ref(false)
const detailEditable = computed(() => Boolean(detailUpdate.value && isEditableUpdate(detailUpdate.value)))
const detailHasActions = computed(() => Boolean(detailUpdate.value?.link) || detailEditable.value)

function openDetail(update: AdminUpdate) {
  detailUpdate.value = update
  detailOpen.value = true
}

// Create / edit drawer.
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formUpdate = ref<AdminUpdate | null>(null)

function openCreate() {
  formMode.value = 'create'
  formUpdate.value = null
  formOpen.value = true
}

function openEdit(update: AdminUpdate) {
  detailOpen.value = false
  formMode.value = 'edit'
  formUpdate.value = update
  formOpen.value = true
}

// Delete, behind a confirmation.
const deleteTarget = ref<AdminUpdate | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)

function requestDelete(update: AdminUpdate) {
  deleteTarget.value = update
  deleteOpen.value = true
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value)
    return
  deleting.value = true
  try {
    await requestJson(updateItemPath(target.id), { method: 'DELETE' })
    deleteOpen.value = false
    if (detailUpdate.value?.id === target.id)
      detailOpen.value = false
    toast.success(t('dashboard.sections.updates.deleteSuccess', 'Update deleted.'))
    await reload()
  }
  catch (error: unknown) {
    toast.warning(resolveAdminErrorMessage(error, t('dashboard.sections.updates.deleteFailed', 'Delete failed.')))
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.updates', 'Updates & News')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="list.loading.value || list.refreshing.value" @click="reload()">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
      <TxButton variant="secondary" size="sm" icon="i-carbon-launch" @click="openExternal(CHANGELOG_URL)">
        {{ t('dashboard.sections.updates.changelogLink', 'Changelog') }}
      </TxButton>
      <TxButton variant="primary" size="sm" icon="i-carbon-add" @click="openCreate">
        {{ t('dashboard.sections.updates.addButton', 'New update') }}
      </TxButton>
    </template>

    <template #filters>
      <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
        <AdminFilterField :label="t('dashboard.sections.updates.filters.searchLabel', 'Search')" for="admin-updates-search" wide>
          <TxSearchInput
            id="admin-updates-search"
            v-model="filters.q"
            autocomplete="off"
            :placeholder="t('dashboard.sections.updates.filters.searchPlaceholder', 'Title, summary, tag or release tag')"
          />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.updates.filters.typeLabel', 'Type')">
          <TxSelect v-model="filters.type" :options="typeOptions" />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.updates.filters.channelLabel', 'Channel')">
          <TxSelect v-model="filters.channel" :options="channelOptions" />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.updates.filters.scopeLabel', 'Scope')">
          <TxSelect v-model="filters.scope" :options="scopeOptions" />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.updates.filters.sourceLabel', 'Source')">
          <TxSelect v-model="filters.source" :options="sourceOptions" />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.updates.filters.rangeLabel', 'Date range')">
          <TxSelect v-model="filters.range" :options="rangeOptions" />
        </AdminFilterField>
      </AdminFilterBar>
    </template>

    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="list.loading.value"
        :refreshing="list.refreshing.value"
        :error="list.error.value"
        :empty-title="t('dashboard.sections.updates.empty', 'No updates or news yet. Check again soon.')"
        :filtered-empty-title="t('dashboard.sections.updates.filteredEmpty', 'No updates match these filters.')"
        :filtered="list.hasActiveFilters.value"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="reload()"
        @clear-filters="list.clearFilters()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
        @row-click="openDetail"
      >
        <template #cell-title="{ row }">
          <span class="UpdateCell" :title="rowTitle(row)">
            <TxTag v-if="row.releaseTag" class="UpdateCell-Tag" size="sm" :label="row.releaseTag" color="var(--tx-color-primary)" />
            <span class="UpdateCell-Text">
              <span class="UpdateCell-Title">{{ titleOf(row) }}</span>
              <span v-if="summaryOf(row)" class="UpdateCell-Summary">{{ summaryOf(row) }}</span>
            </span>
          </span>
        </template>
        <template #cell-type="{ row }">
          <span class="UpdateCell">
            <TxTag class="UpdateCell-Tag" size="sm" :label="typeLabel(row.type)" :color="typeColor(row.type)" />
          </span>
        </template>
        <template #cell-channels="{ row }">
          <span class="UpdateCell" :title="row.channels.join(', ')">
            <template v-if="row.channels.length">
              <TxTag class="UpdateCell-Tag" size="sm" :label="row.channels[0]" :color="channelColor(row.channels[0]!)" />
              <span v-if="row.channels.length > 1" class="UpdateCell-More">+{{ row.channels.length - 1 }}</span>
            </template>
            <span v-else class="UpdateCell-Muted">—</span>
          </span>
        </template>
        <template #cell-scope="{ row }">
          <span class="UpdateCell">
            <TxTag class="UpdateCell-Tag" size="sm" :label="scopeLabel(row.scope)" :color="scopeColor(row.scope)" />
          </span>
        </template>
        <template #cell-source="{ row }">
          <span class="UpdateCell">
            <TxTag class="UpdateCell-Tag" size="sm" :label="sourceLabel(row)" :color="sourceColor(row)" />
          </span>
        </template>
        <template #cell-time="{ row }">
          <span class="UpdateCell is-numeric" :title="updateDateLabels(format, row.timestamp).full">{{ updateDateLabels(format, row.timestamp).cell }}</span>
        </template>
        <template #cell-actions="{ row }">
          <span class="UpdateCell is-actions" @click.stop>
            <TxIconButton
              v-if="row.link"
              size="xs"
              icon="i-carbon-launch"
              :label="t('dashboard.sections.updates.openLink', 'Open link')"
              :title="t('dashboard.sections.updates.openLink', 'Open link')"
              @click.stop="openExternal(row.link)"
            />
            <template v-if="isEditableUpdate(row)">
              <TxIconButton
                size="xs"
                icon="i-carbon-edit"
                :label="t('dashboard.sections.updates.editButton', 'Edit update')"
                :title="t('dashboard.sections.updates.editButton', 'Edit update')"
                @click.stop="openEdit(row)"
              />
              <TxIconButton
                size="xs"
                status="danger"
                icon="i-carbon-trash-can"
                :label="t('dashboard.sections.updates.delete', 'Delete')"
                :title="t('dashboard.sections.updates.delete', 'Delete')"
                @click.stop="requestDelete(row)"
              />
            </template>
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="t('dashboard.sections.updates.detail.title', 'Update details')" size="520px">
      <TxDescriptions v-if="detailUpdate" :columns="1" size="sm">
        <TxDescriptionsItem :label="t('dashboard.sections.updates.form.titleZh', 'Title (ZH)')">
          {{ detailUpdate.title.zh }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.form.titleEn', 'Title (EN)')">
          {{ detailUpdate.title.en }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.form.summaryZh', 'Summary (ZH)')">
          <span class="UpdateDetail-Text">{{ detailUpdate.summary.zh }}</span>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.form.summaryEn', 'Summary (EN)')">
          <span class="UpdateDetail-Text">{{ detailUpdate.summary.en }}</span>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.table.type', 'Type')">
          <TxTag size="sm" :label="typeLabel(detailUpdate.type)" :color="typeColor(detailUpdate.type)" />
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.table.channels', 'Channel')">
          <span v-if="detailUpdate.channels.length" class="UpdateDetail-Tags">
            <TxTag
              v-for="channel in detailUpdate.channels"
              :key="channel"
              size="sm"
              :label="channel"
              :color="channelColor(channel)"
            />
          </span>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.table.scope', 'Scope')">
          {{ scopeLabel(detailUpdate.scope) }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.table.source', 'Source')">
          {{ sourceLabel(detailUpdate) }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.releaseTag', 'Release tag')">
          {{ detailUpdate.releaseTag }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.tags', 'Tags')">
          <span v-if="detailUpdate.tags.length" class="UpdateDetail-Tags">
            <TxTag
              v-for="tag in detailUpdate.tags"
              :key="tag"
              size="sm"
              :label="`#${tag}`"
              color="var(--tx-text-color-secondary)"
            />
          </span>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.published', 'Published')">
          {{ updateDateLabels(format, detailUpdate.timestamp).full }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.link', 'Link')">
          <a v-if="detailUpdate.link" class="UpdateDetail-Link" :href="detailUpdate.link" target="_blank" rel="noopener">{{ detailUpdate.link }}</a>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.payloadVersion', 'Payload version')">
          {{ detailUpdate.payloadVersion }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.payload', 'Payload')">
          <a v-if="detailUpdate.payloadUrl" class="UpdateDetail-Link" :href="detailUpdate.payloadUrl" target="_blank" rel="noopener">{{ detailUpdate.payloadUrl }}</a>
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="t('dashboard.sections.updates.detail.id', 'ID')">
          <code class="UpdateDetail-Code">{{ detailUpdate.id }}</code>
        </TxDescriptionsItem>
      </TxDescriptions>
      <template v-if="detailHasActions" #footer>
        <div class="UpdateDetail-Actions">
          <TxButton v-if="detailUpdate?.link" variant="secondary" size="sm" icon="i-carbon-launch" @click="openExternal(detailUpdate?.link)">
            {{ t('dashboard.sections.updates.openLink', 'Open link') }}
          </TxButton>
          <template v-if="detailUpdate && detailEditable">
            <TxButton variant="secondary" size="sm" @click="openEdit(detailUpdate)">
              {{ t('dashboard.sections.updates.editButton', 'Edit update') }}
            </TxButton>
            <TxButton variant="danger" size="sm" @click="requestDelete(detailUpdate)">
              {{ t('dashboard.sections.updates.delete', 'Delete') }}
            </TxButton>
          </template>
        </div>
      </template>
    </TxDrawer>

    <UpdateFormDrawer
      :open="formOpen"
      :mode="formMode"
      :update="formUpdate"
      @close="formOpen = false"
      @saved="reload()"
    />

    <AdminConfirmDialog
      v-model:open="deleteOpen"
      :title="t('dashboard.sections.updates.deleteTitle', 'Delete Update')"
      :description="deleteTarget ? t('dashboard.sections.updates.confirmDelete', { title: titleOf(deleteTarget) }) : ''"
      :confirm-label="t('dashboard.sections.updates.delete', 'Delete')"
      :cancel-label="t('dashboard.sections.updates.cancel', 'Cancel')"
      tone="danger"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </AdminPageShell>
</template>

<style scoped>
/* Every cell is one line box tall — the height of the table's skeleton row — so
   nothing moves when the rows replace the placeholders. Tags and the 24px icon
   buttons are centred in that box and overhang it slightly into the cell's
   padding instead of making the row taller. What does not fit is cut with an
   ellipsis and shown in full in the title and in the detail drawer. */
.UpdateCell {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 1lh;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  white-space: nowrap;
}

.UpdateCell.is-numeric {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.UpdateCell.is-actions {
  justify-content: flex-end;
  gap: 4px;
  overflow: visible;
}

.UpdateCell-Tag {
  flex: none;
}

.UpdateCell-Text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UpdateCell-Title {
  font-weight: 500;
}

.UpdateCell-Summary {
  color: var(--tx-text-color-regular);
}

.UpdateCell-Summary::before {
  content: ' · ';
}

.UpdateCell-More,
.UpdateCell-Muted {
  flex: none;
  color: var(--tx-text-color-regular);
  font-size: 12px;
}

.UpdateDetail-Text {
  white-space: pre-line;
}

.UpdateDetail-Tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.UpdateDetail-Link {
  color: var(--tx-color-primary);
  overflow-wrap: anywhere;
}

.UpdateDetail-Code {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--tx-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.UpdateDetail-Actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
