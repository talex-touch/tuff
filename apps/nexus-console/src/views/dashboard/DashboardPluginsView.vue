<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTag } from '@talex-touch/tuffex/tag'
import { TxTextarea } from '@talex-touch/tuffex/textarea'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { DashboardPluginItem, PluginVersionItem, SigningKeyItem } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()

const pluginsCache = ref<DashboardPluginItem[] | null>(null)
const keysCache = ref<SigningKeyItem[] | null>(null)
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const statusOptions = computed(() => [
  { value: '', label: t('common.all') },
  { value: 'draft', label: t('common.draft') },
  { value: 'pending', label: t('common.pending') },
  { value: 'approved', label: t('common.approved') },
  { value: 'rejected', label: t('common.rejected') },
])

const channelOptions = [
  { value: 'RELEASE', label: 'RELEASE' },
  { value: 'BETA', label: 'BETA' },
  { value: 'SNAPSHOT', label: 'SNAPSHOT' },
]

const pluginList = useConsoleList<DashboardPluginItem, { q: string, status: string }>({
  defaults: { q: '', status: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!pluginsCache.value) {
      const res = await consoleApi.listMyPlugins()
      pluginsCache.value = res.plugins ?? []
    }
    const q = filters.q.toLowerCase()
    const filtered = pluginsCache.value.filter((p) => {
      if (filters.status && p.status !== filters.status)
        return false
      if (q && !`${p.name} ${p.slug} ${p.summary}`.toLowerCase().includes(q))
        return false
      return true
    })
    return sliceClientPage(filtered, page, limit)
  },
})

const signingKeyList = useConsoleList<SigningKeyItem, Record<string, never>>({
  defaults: {},
  defaultLimit: 10,
  pageSizes: [10, 20],
  fetch: async ({ page, limit }) => {
    if (!keysCache.value) {
      const res = await consoleApi.listSigningKeys()
      keysCache.value = res.keys ?? res.items ?? []
    }
    return sliceClientPage(keysCache.value, page, limit)
  },
})

const pluginColumns = computed<DataTableColumn<DashboardPluginItem>[]>(() => [
  { key: 'name', title: t('dashboard.pluginName'), minWidth: 180 },
  { key: 'category', title: t('dashboard.pluginCategory'), minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 110 },
  { key: 'latestVersion', title: t('dashboard.pluginVersion'), minWidth: 120 },
  { key: 'updatedAt', title: t('common.updatedAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 260 },
])

const keyColumns = computed<DataTableColumn<SigningKeyItem>[]>(() => [
  { key: 'keyId', title: 'Key ID', minWidth: 140 },
  { key: 'algorithm', title: 'Algorithm', minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 100 },
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 110 },
])

// ─── Create / Edit Plugin Modal ───────────────────────────────────────────────
const editorOpen = ref(false)
const editingPlugin = ref<DashboardPluginItem | null>(null)
const savingPlugin = ref(false)
const iconFile = ref<File | null>(null)

const pluginForm = reactive({
  slug: '',
  name: '',
  summary: '',
  category: 'utilities',
  homepage: '',
})

function openCreatePlugin() {
  editingPlugin.value = null
  pluginForm.slug = ''
  pluginForm.name = ''
  pluginForm.summary = ''
  pluginForm.category = 'utilities'
  pluginForm.homepage = ''
  iconFile.value = null
  editorOpen.value = true
}

function openEditPlugin(plugin: DashboardPluginItem) {
  editingPlugin.value = plugin
  pluginForm.slug = plugin.slug
  pluginForm.name = plugin.name
  pluginForm.summary = plugin.summary
  pluginForm.category = plugin.category
  pluginForm.homepage = plugin.homepage ?? ''
  iconFile.value = null
  editorOpen.value = true
}

function onIconSelected(event: Event) {
  const input = event.target as HTMLInputElement
  iconFile.value = input.files?.[0] ?? null
}

async function savePlugin() {
  if (!pluginForm.name.trim())
    return
  savingPlugin.value = true
  feedback.value = null
  try {
    const fd = new FormData()
    if (!editingPlugin.value)
      fd.set('slug', pluginForm.slug.trim())
    fd.set('name', pluginForm.name.trim())
    fd.set('summary', pluginForm.summary.trim())
    fd.set('category', pluginForm.category.trim())
    if (pluginForm.homepage.trim())
      fd.set('homepage', pluginForm.homepage.trim())
    if (iconFile.value)
      fd.set('icon', iconFile.value)

    if (editingPlugin.value)
      await consoleApi.updatePlugin(editingPlugin.value.id, fd)
    else
      await consoleApi.createPlugin(fd)

    editorOpen.value = false
    pluginsCache.value = null
    await pluginList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingPlugin.value = false
  }
}

// ─── Versions Modal ───────────────────────────────────────────────────────────
const versionsPlugin = ref<DashboardPluginItem | null>(null)
const publishingVersion = ref(false)
const packageFile = ref<File | null>(null)
const versionForm = reactive({
  version: '',
  channel: 'RELEASE',
  changelog: '',
  publisherSignature: '',
  publisherPublicKey: '',
  publisherKeyValidFrom: new Date().toISOString(),
})

function onPackageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  packageFile.value = input.files?.[0] ?? null
}

async function submitVersion() {
  if (!versionsPlugin.value || !packageFile.value || !versionForm.version.trim())
    return
  publishingVersion.value = true
  feedback.value = null
  try {
    const fd = new FormData()
    fd.set('version', versionForm.version.trim())
    fd.set('channel', versionForm.channel)
    fd.set('changelog', versionForm.changelog.trim() || `Release ${versionForm.version.trim()}`)
    fd.set('package', packageFile.value)
    fd.set('publisherSignature', versionForm.publisherSignature.trim())
    fd.set('publisherPublicKey', versionForm.publisherPublicKey.trim())
    fd.set('publisherKeyValidFrom', versionForm.publisherKeyValidFrom.trim())
    await consoleApi.publishPluginVersion(versionsPlugin.value.id, fd)
    versionForm.version = ''
    versionForm.changelog = ''
    packageFile.value = null
    pluginsCache.value = null
    await pluginList.refresh()
    versionsPlugin.value = pluginList.rows.value.find(p => p.id === versionsPlugin.value?.id) ?? null
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    publishingVersion.value = false
  }
}

async function removeVersion(version: PluginVersionItem) {
  if (!versionsPlugin.value)
    return
  try {
    await consoleApi.deletePluginVersion(versionsPlugin.value.id, version.id)
    pluginsCache.value = null
    await pluginList.refresh()
    versionsPlugin.value = pluginList.rows.value.find(p => p.id === versionsPlugin.value?.id) ?? null
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

async function submitReview(plugin: DashboardPluginItem) {
  try {
    await consoleApi.setPluginStatus(plugin.id, { status: 'pending' })
    pluginsCache.value = null
    await pluginList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

// ─── Delete Plugin ────────────────────────────────────────────────────────────
const deleteTarget = ref<DashboardPluginItem | null>(null)
const deletingPlugin = ref(false)

async function confirmDeletePlugin() {
  if (!deleteTarget.value)
    return
  deletingPlugin.value = true
  try {
    await consoleApi.deletePlugin(deleteTarget.value.id)
    deleteTarget.value = null
    pluginsCache.value = null
    await pluginList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    deletingPlugin.value = false
  }
}

// ─── Signing Keys Modal ───────────────────────────────────────────────────────
const registerKeyOpen = ref(false)
const registeringKey = ref(false)
const signingKeyForm = reactive({ keyId: '', publicKeyPem: '' })

async function submitSigningKey() {
  if (!signingKeyForm.keyId.trim() || !signingKeyForm.publicKeyPem.trim())
    return
  registeringKey.value = true
  try {
    await consoleApi.registerSigningKey({
      keyId: signingKeyForm.keyId.trim(),
      publicKeyPem: signingKeyForm.publicKeyPem.trim(),
      validFrom: new Date().toISOString(),
    })
    registerKeyOpen.value = false
    signingKeyForm.keyId = ''
    signingKeyForm.publicKeyPem = ''
    keysCache.value = null
    await signingKeyList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    registeringKey.value = false
  }
}

async function revokeSigningKey(item: SigningKeyItem) {
  try {
    await consoleApi.revokeSigningKey(item.keyId)
    keysCache.value = null
    await signingKeyList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'approved')
    return 'success'
  if (status === 'pending')
    return 'warning'
  if (status === 'rejected')
    return 'danger'
  return 'muted'
}
</script>

<template>
  <ConsolePageShell :title="t('dashboard.pluginsTitle')">
    <template #actions>
      <TxButton variant="primary" size="sm" icon="i-carbon-add" @click="openCreatePlugin">
        {{ t('dashboard.publishPlugin') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <ConsoleFilterBar :active="pluginList.hasActiveFilters.value" @clear="pluginList.clearFilters()">
      <ConsoleFormField :label="t('common.search')" for-id="plugins-search">
        <TuffInput id="plugins-search" v-model="pluginList.filters.q" :placeholder="t('common.search')" />
      </ConsoleFormField>
      <ConsoleFormField :label="t('common.status')">
        <TxSelect v-model="pluginList.filters.status" :options="statusOptions" />
      </ConsoleFormField>
    </ConsoleFilterBar>

    <ConsoleSection :padded="false">
      <ConsoleTable
        :columns="pluginColumns"
        :rows="pluginList.rows.value"
        row-key="id"
        :loading="pluginList.loading.value"
        :refreshing="pluginList.refreshing.value"
        :error="pluginList.error.value"
        :filtered="pluginList.hasActiveFilters.value"
        :page="pluginList.page.value"
        :limit="pluginList.limit.value"
        :total="pluginList.total.value"
        :page-sizes="pluginList.pageSizes"
        @retry="pluginList.refresh()"
        @clear-filters="pluginList.clearFilters()"
        @update:page="pluginList.setPage($event)"
        @update:limit="pluginList.setLimit($event)"
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
          <TxStatusBadge :text="row.status" :status="statusTone(row.status)" size="sm" />
        </template>
        <template #cell-latestVersion="{ row }">
          <TxTag v-if="row.latestVersion" :label="row.latestVersion.version" size="sm" variant="soft" />
          <span v-else>—</span>
        </template>
        <template #cell-updatedAt="{ row }">
          {{ formatDateTime(row.updatedAt || row.createdAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <div class="console-inline-actions">
            <TxButton variant="ghost" size="sm" @click="openEditPlugin(row)">
              {{ t('common.edit') }}
            </TxButton>
            <TxButton variant="secondary" size="sm" @click="versionsPlugin = row">
              {{ t('dashboard.manageVersions') }}
            </TxButton>
            <TxButton v-if="row.status === 'draft'" variant="primary" size="sm" @click="submitReview(row)">
              {{ t('dashboard.submitForReview') }}
            </TxButton>
            <TxButton variant="danger" size="sm" @click="deleteTarget = row">
              {{ t('common.delete') }}
            </TxButton>
          </div>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleSection
      :title="t('dashboard.signingKeysSection')"
      :description="t('dashboard.signingKeysDesc')"
      :padded="false"
    >
      <template #actions>
        <TxButton variant="primary" size="sm" @click="registerKeyOpen = true">
          {{ t('dashboard.registerSigningKey') }}
        </TxButton>
      </template>

      <ConsoleTable
        :columns="keyColumns"
        :rows="signingKeyList.rows.value"
        row-key="keyId"
        :loading="signingKeyList.loading.value"
        :refreshing="signingKeyList.refreshing.value"
        :error="signingKeyList.error.value"
        :page="signingKeyList.page.value"
        :limit="signingKeyList.limit.value"
        :total="signingKeyList.total.value"
        :page-sizes="signingKeyList.pageSizes"
        @retry="signingKeyList.refresh()"
        @update:page="signingKeyList.setPage($event)"
        @update:limit="signingKeyList.setLimit($event)"
      >
        <template #cell-keyId="{ row }">
          <span class="console-mono">{{ row.keyId }}</span>
        </template>
        <template #cell-status="{ row }">
          <TxStatusBadge :text="row.status || 'active'" :status="row.status === 'revoked' ? 'danger' : 'success'" size="sm" />
        </template>
        <template #cell-createdAt="{ row }">
          {{ formatDateTime(row.createdAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <TxButton v-if="row.status !== 'revoked'" variant="danger" size="sm" @click="revokeSigningKey(row)">
            {{ t('common.revoke') }}
          </TxButton>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <TxModal
      v-model="editorOpen"
      :title="editingPlugin ? t('dashboard.editPlugin') : t('dashboard.publishPlugin')"
      :close-label="t('common.close')"
      width="520px"
    >
      <div class="console-form-stack">
        <ConsoleFormField v-if="!editingPlugin" :label="t('dashboard.pluginSlug')" for-id="plg-slug">
          <TuffInput id="plg-slug" v-model="pluginForm.slug" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.pluginName')" for-id="plg-name">
          <TuffInput id="plg-name" v-model="pluginForm.name" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.pluginSummary')" for-id="plg-summary">
          <TxTextarea id="plg-summary" v-model="pluginForm.summary" :rows="3" />
        </ConsoleFormField>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('dashboard.pluginCategory')" for-id="plg-category">
            <TuffInput id="plg-category" v-model="pluginForm.category" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('dashboard.pluginHomepage')" for-id="plg-homepage">
            <TuffInput id="plg-homepage" v-model="pluginForm.homepage" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('dashboard.iconFile')" for-id="plg-icon">
          <input id="plg-icon" type="file" accept="image/*,.svg" @change="onIconSelected">
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="editorOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="savingPlugin" @click="savePlugin">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      :model-value="Boolean(versionsPlugin)"
      :title="t('dashboard.pluginVersionsTitle', { name: versionsPlugin?.name || '' })"
      :close-label="t('common.close')"
      width="600px"
      @update:model-value="!$event && (versionsPlugin = null)"
    >
      <div v-if="versionsPlugin" class="console-form-stack">
        <div v-if="versionsPlugin.versions?.length" class="VersionsList">
          <div v-for="v in versionsPlugin.versions" :key="v.id" class="VersionsList-Row">
            <div class="console-inline-actions">
              <strong class="console-mono">{{ v.version }}</strong>
              <TxTag :label="v.channel" size="sm" variant="soft" />
              <TxStatusBadge :text="v.status" :status="statusTone(v.status)" size="sm" />
            </div>
            <TxButton variant="danger" size="sm" @click="removeVersion(v)">
              {{ t('common.delete') }}
            </TxButton>
          </div>
        </div>

        <div class="console-form-grid">
          <ConsoleFormField :label="t('dashboard.versionNumber')" for-id="ver-num">
            <TuffInput id="ver-num" v-model="versionForm.version" placeholder="1.0.0" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('dashboard.versionChannel')">
            <TxSelect v-model="versionForm.channel" :options="channelOptions" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('dashboard.versionChangelog')" for-id="ver-log">
          <TxTextarea id="ver-log" v-model="versionForm.changelog" :rows="2" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.packageFile')" for-id="ver-pkg">
          <input id="ver-pkg" type="file" accept=".tpex,.zip" @change="onPackageSelected">
        </ConsoleFormField>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('dashboard.publisherSignature')" for-id="ver-sig">
            <TuffInput id="ver-sig" v-model="versionForm.publisherSignature" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('dashboard.publisherPublicKey')" for-id="ver-pub">
            <TuffInput id="ver-pub" v-model="versionForm.publisherPublicKey" />
          </ConsoleFormField>
        </div>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="versionsPlugin = null">
          {{ t('common.close') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="publishingVersion"
          :disabled="!versionForm.version.trim() || !packageFile"
          @click="submitVersion"
        >
          {{ t('dashboard.publishVersion') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      v-model="registerKeyOpen"
      :title="t('dashboard.registerSigningKey')"
      :close-label="t('common.close')"
      width="480px"
    >
      <div class="console-form-stack">
        <ConsoleFormField :label="t('dashboard.keyLabel')" for-id="skey-label">
          <TuffInput id="skey-label" v-model="signingKeyForm.keyId" placeholder="pub-key-2026" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.publicKeyLabel')" for-id="skey-pem">
          <TxTextarea id="skey-pem" v-model="signingKeyForm.publicKeyPem" :rows="4" />
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="registerKeyOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="registeringKey"
          :disabled="!signingKeyForm.keyId.trim() || !signingKeyForm.publicKeyPem.trim()"
          @click="submitSigningKey"
        >
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      :open="Boolean(deleteTarget)"
      :title="t('dashboard.deletePluginTitle')"
      :description="t('dashboard.deletePluginDesc', { name: deleteTarget?.name || '' })"
      :loading="deletingPlugin"
      @update:open="!$event && (deleteTarget = null)"
      @confirm="confirmDeletePlugin"
    />
  </ConsolePageShell>
</template>

<style scoped>
.VersionsList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.VersionsList-Row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
}
</style>
