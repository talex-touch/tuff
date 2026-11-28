<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { TxTag } from '@talex-touch/tuffex/tag'
import { TxTextarea } from '@talex-touch/tuffex/textarea'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { ExchangeLatestResponse, ReleaseItem, UpdateAnnouncementItem } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleStatGrid from '@/components/ConsoleStatGrid.vue'
import type { ConsoleStatItem } from '@/components/ConsoleStatGrid.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()

const activeTab = ref<'releases' | 'updates' | 'exchange'>('releases')
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const channelOptions = [
  { value: '', label: 'All' },
  { value: 'RELEASE', label: 'RELEASE' },
  { value: 'BETA', label: 'BETA' },
  { value: 'SNAPSHOT', label: 'SNAPSHOT' },
]

const releaseChannelSelect = [
  { value: 'RELEASE', label: 'RELEASE' },
  { value: 'BETA', label: 'BETA' },
  { value: 'SNAPSHOT', label: 'SNAPSHOT' },
]

const statusFilterOptions = [
  { value: '', label: 'All' },
  { value: 'published', label: 'published' },
  { value: 'draft', label: 'draft' },
  { value: 'archived', label: 'archived' },
]

const scopeOptions = [
  { value: 'web', label: 'web' },
  { value: 'system', label: 'system' },
  { value: 'all', label: 'all' },
]

// ─── Releases ─────────────────────────────────────────────────────────────────
const releasesCache = ref<ReleaseItem[] | null>(null)
const releaseModalOpen = ref(false)
const editingRelease = ref<ReleaseItem | null>(null)
const savingRelease = ref(false)
const deleteReleaseTarget = ref<ReleaseItem | null>(null)
const deletingRelease = ref(false)

const releaseForm = reactive({
  tag: '',
  name: '',
  channel: 'RELEASE',
  notes: '',
})

const releasesList = useConsoleList<ReleaseItem, { q: string, channel: string, status: string }>({
  defaults: { q: '', channel: '', status: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!releasesCache.value) {
      const [pubRes, draftRes] = await Promise.allSettled([
        consoleApi.listReleases({ status: 'published', limit: 50 }),
        consoleApi.listReleases({ status: 'draft', limit: 50 }),
      ])
      const all = [
        ...(pubRes.status === 'fulfilled' ? pubRes.value.releases : []),
        ...(draftRes.status === 'fulfilled' ? draftRes.value.releases : []),
      ]
      releasesCache.value = all
    }
    const q = filters.q.toLowerCase()
    const filtered = releasesCache.value.filter((r) => {
      if (filters.channel && r.channel !== filters.channel)
        return false
      if (filters.status && r.status !== filters.status)
        return false
      if (q && !`${r.tag} ${r.name ?? ''}`.toLowerCase().includes(q))
        return false
      return true
    })
    return sliceClientPage(filtered, page, limit)
  },
})

const releaseColumns = computed<DataTableColumn<ReleaseItem>[]>(() => [
  { key: 'tag', title: t('admin.releaseTag'), minWidth: 140 },
  { key: 'channel', title: t('admin.releaseChannel'), minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 110 },
  { key: 'publishedAt', title: t('common.updatedAt'), minWidth: 160 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 230 },
])

function openCreateRelease() {
  editingRelease.value = null
  releaseForm.tag = ''
  releaseForm.name = ''
  releaseForm.channel = 'RELEASE'
  releaseForm.notes = ''
  releaseModalOpen.value = true
}

function openEditRelease(item: ReleaseItem) {
  editingRelease.value = item
  releaseForm.tag = item.tag
  releaseForm.name = item.name ?? ''
  releaseForm.channel = item.channel
  releaseForm.notes = item.notes ?? ''
  releaseModalOpen.value = true
}

async function saveRelease() {
  if (!releaseForm.tag.trim())
    return
  savingRelease.value = true
  try {
    if (editingRelease.value) {
      await consoleApi.updateRelease(editingRelease.value.tag, {
        name: releaseForm.name.trim() || undefined,
        channel: releaseForm.channel,
        notes: releaseForm.notes,
      })
    }
    else {
      await consoleApi.createRelease({
        tag: releaseForm.tag.trim(),
        name: releaseForm.name.trim() || undefined,
        channel: releaseForm.channel,
        notes: releaseForm.notes,
      })
    }
    releaseModalOpen.value = false
    releasesCache.value = null
    await releasesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingRelease.value = false
  }
}

async function publishRelease(item: ReleaseItem) {
  try {
    await consoleApi.publishRelease(item.tag)
    releasesCache.value = null
    await releasesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

async function confirmDeleteRelease() {
  if (!deleteReleaseTarget.value)
    return
  deletingRelease.value = true
  try {
    await consoleApi.deleteRelease(deleteReleaseTarget.value.tag)
    deleteReleaseTarget.value = null
    releasesCache.value = null
    await releasesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    deletingRelease.value = false
  }
}

// ─── Announcements / Updates ──────────────────────────────────────────────────
const updatesCache = ref<UpdateAnnouncementItem[] | null>(null)
const updateModalOpen = ref(false)
const editingUpdate = ref<UpdateAnnouncementItem | null>(null)
const savingUpdate = ref(false)
const deleteUpdateTarget = ref<UpdateAnnouncementItem | null>(null)
const deletingUpdate = ref(false)

const updateForm = reactive({
  title: '',
  summary: '',
  content: '',
  scope: 'web',
  channel: 'RELEASE',
})

const updatesList = useConsoleList<UpdateAnnouncementItem, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!updatesCache.value) {
      const res = await consoleApi.listUpdates({ scope: 'web' })
      updatesCache.value = res.updates ?? []
    }
    const q = filters.q.toLowerCase()
    const rows = q
      ? updatesCache.value.filter(u => `${u.title} ${u.summary ?? ''}`.toLowerCase().includes(q))
      : updatesCache.value
    return sliceClientPage(rows, page, limit)
  },
})

const updateColumns = computed<DataTableColumn<UpdateAnnouncementItem>[]>(() => [
  { key: 'title', title: t('admin.updateTitle'), minWidth: 220 },
  { key: 'scope', title: t('admin.updateScope'), minWidth: 100 },
  { key: 'channel', title: t('admin.releaseChannel'), minWidth: 110 },
  { key: 'updatedAt', title: t('common.updatedAt'), minWidth: 160 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 170 },
])

function openCreateUpdate() {
  editingUpdate.value = null
  updateForm.title = ''
  updateForm.summary = ''
  updateForm.content = ''
  updateForm.scope = 'web'
  updateForm.channel = 'RELEASE'
  updateModalOpen.value = true
}

function openEditUpdate(item: UpdateAnnouncementItem) {
  editingUpdate.value = item
  updateForm.title = item.title
  updateForm.summary = item.summary ?? ''
  updateForm.content = item.content ?? ''
  updateForm.scope = item.scope ?? 'web'
  updateForm.channel = item.channel ?? 'RELEASE'
  updateModalOpen.value = true
}

async function saveUpdate() {
  if (!updateForm.title.trim())
    return
  savingUpdate.value = true
  try {
    const payload = {
      title: updateForm.title.trim(),
      summary: updateForm.summary.trim() || undefined,
      content: updateForm.content.trim() || undefined,
      scope: updateForm.scope,
      channel: updateForm.channel,
    }
    if (editingUpdate.value)
      await consoleApi.updateAnnouncement(editingUpdate.value.id, payload)
    else
      await consoleApi.createUpdate(payload)
    updateModalOpen.value = false
    updatesCache.value = null
    await updatesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingUpdate.value = false
  }
}

async function confirmDeleteUpdate() {
  if (!deleteUpdateTarget.value)
    return
  deletingUpdate.value = true
  try {
    await consoleApi.deleteAnnouncement(deleteUpdateTarget.value.id)
    deleteUpdateTarget.value = null
    updatesCache.value = null
    await updatesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    deletingUpdate.value = false
  }
}

// ─── Exchange Rate Snapshot (Decoupled + Manual Refresh) ──────────────────────
interface ExchangeRow {
  currency: string
  rate: number
}

const exchangeLoading = ref(true)
const refreshingRates = ref(false)
const exchange = ref<ExchangeLatestResponse | null>(null)
const exchangeSearch = ref('')
const exchangePage = ref(1)
const exchangeLimit = ref(10)

const exchangeStats = computed<ConsoleStatItem[]>(() => [
  { key: 'base', label: t('admin.exchangeBase'), value: exchange.value?.base || 'USD', iconClass: 'i-carbon-currency-dollar' },
  { key: 'updated', label: t('admin.exchangeUpdated'), value: formatDateTime(exchange.value?.fetchedAt ?? exchange.value?.asOf, locale.value), iconClass: 'i-carbon-time' },
  { key: 'source', label: t('admin.exchangeSource'), value: exchange.value?.source || 'cron', iconClass: 'i-carbon-cloud' },
])

const exchangeRows = computed(() => {
  const entries = Object.entries(exchange.value?.rates ?? {}).map(([currency, rate]) => ({ currency, rate }))
  const q = exchangeSearch.value.trim().toLowerCase()
  const filtered = q ? entries.filter(r => r.currency.toLowerCase().includes(q)) : entries
  return sliceClientPage(filtered, exchangePage.value, exchangeLimit.value)
})

const exchangeColumns = computed<DataTableColumn<ExchangeRow>[]>(() => [
  { key: 'currency', title: t('admin.currencyCol'), minWidth: 160 },
  { key: 'rate', title: t('admin.rateCol'), align: 'right', minWidth: 180 },
])

async function loadExchange() {
  exchangeLoading.value = true
  try {
    exchange.value = await consoleApi.getExchangeLatest()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.loadFailed')) }
  }
  finally {
    exchangeLoading.value = false
  }
}

async function manualRefreshRates() {
  refreshingRates.value = true
  feedback.value = null
  try {
    await consoleApi.refreshExchangeRates()
    await loadExchange()
    feedback.value = { type: 'success', message: t('admin.refreshRates') }
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    refreshingRates.value = false
  }
}

onMounted(() => void loadExchange())
</script>

<template>
  <ConsolePageShell :title="t('admin.releasesTitle')">
    <template #actions>
      <TxButton v-if="activeTab === 'releases'" variant="primary" size="sm" icon="i-carbon-add" @click="openCreateRelease">
        {{ t('admin.newRelease') }}
      </TxButton>
      <TxButton v-else-if="activeTab === 'updates'" variant="primary" size="sm" icon="i-carbon-add" @click="openCreateUpdate">
        {{ t('admin.newUpdate') }}
      </TxButton>
      <TxButton v-else variant="primary" size="sm" icon="i-carbon-renew" :loading="refreshingRates" @click="manualRefreshRates">
        {{ t('admin.refreshRates') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <TxTabs v-model="activeTab">
      <TxTabItem name="releases">
        <template #name>
{{ t('admin.tabReleases') }}
</template>
        <div class="console-form-stack ReleasesTab">
          <ConsoleFilterBar :active="releasesList.hasActiveFilters.value" @clear="releasesList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="rel-q">
              <TuffInput id="rel-q" v-model="releasesList.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
            <ConsoleFormField :label="t('admin.releaseChannel')">
              <TxSelect v-model="releasesList.filters.channel" :options="channelOptions" />
            </ConsoleFormField>
            <ConsoleFormField :label="t('common.status')">
              <TxSelect v-model="releasesList.filters.status" :options="statusFilterOptions" />
            </ConsoleFormField>
          </ConsoleFilterBar>

          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="releaseColumns"
              :rows="releasesList.rows.value"
              row-key="tag"
              :loading="releasesList.loading.value"
              :refreshing="releasesList.refreshing.value"
              :error="releasesList.error.value"
              :filtered="releasesList.hasActiveFilters.value"
              :page="releasesList.page.value"
              :limit="releasesList.limit.value"
              :total="releasesList.total.value"
              :page-sizes="releasesList.pageSizes"
              @retry="releasesCache = null; releasesList.refresh()"
              @clear-filters="releasesList.clearFilters()"
              @update:page="releasesList.setPage($event)"
              @update:limit="releasesList.setLimit($event)"
            >
              <template #cell-tag="{ row }">
                <div>
                  <span class="console-mono">{{ row.tag }}</span>
                  <div v-if="row.name" class="console-muted">
{{ row.name }}
</div>
                </div>
              </template>
              <template #cell-channel="{ row }">
                <TxTag :label="row.channel" size="sm" variant="soft" />
              </template>
              <template #cell-status="{ row }">
                <TxStatusBadge
                  :text="row.status"
                  :status="row.status === 'published' ? 'success' : row.status === 'draft' ? 'warning' : 'muted'"
                  size="sm"
                />
              </template>
              <template #cell-publishedAt="{ row }">
                {{ formatDateTime(row.publishedAt || row.createdAt, locale) }}
              </template>
              <template #cell-actions="{ row }">
                <div class="console-inline-actions">
                  <TxButton variant="ghost" size="sm" @click="openEditRelease(row)">
                    {{ t('common.edit') }}
                  </TxButton>
                  <TxButton v-if="row.status === 'draft'" variant="primary" size="sm" @click="publishRelease(row)">
                    {{ t('admin.publishRelease') }}
                  </TxButton>
                  <TxButton variant="danger" size="sm" @click="deleteReleaseTarget = row">
                    {{ t('common.delete') }}
                  </TxButton>
                </div>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="updates">
        <template #name>
{{ t('admin.tabUpdates') }}
</template>
        <div class="console-form-stack ReleasesTab">
          <ConsoleFilterBar :active="updatesList.hasActiveFilters.value" @clear="updatesList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="upd-q">
              <TuffInput id="upd-q" v-model="updatesList.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="updateColumns"
              :rows="updatesList.rows.value"
              row-key="id"
              :loading="updatesList.loading.value"
              :refreshing="updatesList.refreshing.value"
              :error="updatesList.error.value"
              :filtered="updatesList.hasActiveFilters.value"
              :page="updatesList.page.value"
              :limit="updatesList.limit.value"
              :total="updatesList.total.value"
              :page-sizes="updatesList.pageSizes"
              @retry="updatesCache = null; updatesList.refresh()"
              @clear-filters="updatesList.clearFilters()"
              @update:page="updatesList.setPage($event)"
              @update:limit="updatesList.setLimit($event)"
            >
              <template #cell-scope="{ row }">
                <TxTag :label="row.scope || 'web'" size="sm" variant="soft" />
              </template>
              <template #cell-updatedAt="{ row }">
                {{ formatDateTime(row.updatedAt || row.publishedAt || row.createdAt, locale) }}
              </template>
              <template #cell-actions="{ row }">
                <div class="console-inline-actions">
                  <TxButton variant="ghost" size="sm" @click="openEditUpdate(row)">
                    {{ t('common.edit') }}
                  </TxButton>
                  <TxButton variant="danger" size="sm" @click="deleteUpdateTarget = row">
                    {{ t('common.delete') }}
                  </TxButton>
                </div>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="exchange">
        <template #name>
{{ t('admin.tabExchange') }}
</template>
        <div class="console-form-stack ReleasesTab">
          <ConsoleStatGrid :items="exchangeStats" :loading="exchangeLoading" :skeleton-count="3" />
          <ConsoleSection :title="t('admin.exchangeTitle')" :description="t('admin.exchangeDesc')" :padded="false">
            <div class="ExchangeSearch">
              <ConsoleFormField :label="t('common.search')" for-id="fx-q">
                <TuffInput id="fx-q" v-model="exchangeSearch" placeholder="CNY, EUR, JPY…" />
              </ConsoleFormField>
            </div>
            <ConsoleTable
              :columns="exchangeColumns"
              :rows="exchangeRows.rows"
              row-key="currency"
              :loading="exchangeLoading"
              :filtered="Boolean(exchangeSearch.trim())"
              :page="exchangePage"
              :limit="exchangeLimit"
              :total="exchangeRows.total"
              :page-sizes="[10, 20, 50]"
              @retry="loadExchange"
              @clear-filters="exchangeSearch = ''"
              @update:page="exchangePage = $event"
              @update:limit="exchangeLimit = $event; exchangePage = 1"
            >
              <template #cell-currency="{ row }">
                <span class="console-mono">{{ row.currency }}</span>
              </template>
              <template #cell-rate="{ row }">
                <span class="console-mono">{{ Number(row.rate).toFixed(4) }}</span>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>
    </TxTabs>

    <TxModal
      v-model="releaseModalOpen"
      :title="editingRelease ? t('admin.editRelease') : t('admin.newRelease')"
      :close-label="t('common.close')"
      width="520px"
    >
      <div class="console-form-stack">
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.releaseTag')" for-id="rel-tag">
            <TuffInput id="rel-tag" v-model="releaseForm.tag" :disabled="Boolean(editingRelease)" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.releaseChannel')">
            <TxSelect v-model="releaseForm.channel" :options="releaseChannelSelect" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('admin.releaseName')" for-id="rel-name">
          <TuffInput id="rel-name" v-model="releaseForm.name" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('admin.releaseNotes')" for-id="rel-notes">
          <TxTextarea id="rel-notes" v-model="releaseForm.notes" :rows="5" />
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="releaseModalOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="savingRelease" :disabled="!releaseForm.tag.trim()" @click="saveRelease">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      v-model="updateModalOpen"
      :title="editingUpdate ? t('admin.editUpdate') : t('admin.newUpdate')"
      :close-label="t('common.close')"
      width="520px"
    >
      <div class="console-form-stack">
        <ConsoleFormField :label="t('admin.updateTitle')" for-id="upd-title">
          <TuffInput id="upd-title" v-model="updateForm.title" />
        </ConsoleFormField>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.updateScope')">
            <TxSelect v-model="updateForm.scope" :options="scopeOptions" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.releaseChannel')">
            <TxSelect v-model="updateForm.channel" :options="releaseChannelSelect" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('admin.updateSummary')" for-id="upd-summary">
          <TuffInput id="upd-summary" v-model="updateForm.summary" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('admin.updateContent')" for-id="upd-content">
          <TxTextarea id="upd-content" v-model="updateForm.content" :rows="4" />
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="updateModalOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="savingUpdate" :disabled="!updateForm.title.trim()" @click="saveUpdate">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      :open="Boolean(deleteReleaseTarget)"
      :title="t('admin.deleteReleaseTitle')"
      :description="t('admin.deleteReleaseDesc', { tag: deleteReleaseTarget?.tag || '' })"
      :loading="deletingRelease"
      @update:open="!$event && (deleteReleaseTarget = null)"
      @confirm="confirmDeleteRelease"
    />

    <ConsoleConfirmDialog
      :open="Boolean(deleteUpdateTarget)"
      :title="t('admin.deleteUpdateTitle')"
      :description="t('admin.deleteUpdateDesc', { title: deleteUpdateTarget?.title || '' })"
      :loading="deletingUpdate"
      @update:open="!$event && (deleteUpdateTarget = null)"
      @confirm="confirmDeleteUpdate"
    />
  </ConsolePageShell>
</template>

<style scoped>
.ReleasesTab {
  padding-top: 12px;
}

.ExchangeSearch {
  padding: 14px 20px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}
</style>
