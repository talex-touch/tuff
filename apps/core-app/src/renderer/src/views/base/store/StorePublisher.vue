<script setup lang="ts">
import type {
  UserPluginChannel,
  UserPluginRecord,
  UserPluginTimelineEvent
} from '~/composables/store/useUserPlugins'
import type { StorePlugin } from '@talex-touch/utils/store'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TxButton, TxStatusBadge, TxTag } from '@talex-touch/tuffex'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import StoreIcon from '~/components/store/StoreIcon.vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import { useUserPlugins } from '~/composables/store/useUserPlugins'

const { t } = useI18n()
const {
  records,
  stats,
  loading,
  error,
  loadUserPlugins,
  loadPluginTimeline,
  updatePlugin,
  updatePluginStatus,
  previewPackage,
  createPluginWithInitialVersion,
  publishVersion,
  reeditVersion,
  deleteVersion
} = useUserPlugins()

const selected = ref<UserPluginRecord | null>(null)
const detailVisible = ref(false)
const detailSource = ref<HTMLElement | null>(null)
const timeline = ref<UserPluginTimelineEvent[]>([])
const timelineLoading = ref(false)
const actionError = ref<string | null>(null)
const formVisible = ref(false)
const formMode = ref<'create' | 'edit' | 'version' | 'reedit'>('create')
const formSaving = ref(false)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)

const channels: UserPluginChannel[] = ['SNAPSHOT', 'BETA', 'RELEASE']
const form = reactive({
  slug: '',
  name: '',
  summary: '',
  category: 'productivity',
  homepage: '',
  readme: '',
  version: '',
  channel: 'SNAPSHOT' as UserPluginChannel,
  changelog: '',
  packageFile: null as File | null,
  versionId: ''
})

const sortedRecords = computed(() =>
  records.value
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
)

function toStorePlugin(plugin: UserPluginRecord): StorePlugin {
  return {
    id: plugin.slug,
    name: plugin.name,
    iconUrl: plugin.iconUrl ?? undefined,
    providerId: 'nexus',
    providerName: 'Nexus',
    providerType: 'nexusStore',
    providerTrustLevel: plugin.isOfficial ? 'official' : 'verified',
    trusted: plugin.isOfficial
  }
}

function resetForm() {
  form.slug = ''
  form.name = ''
  form.summary = ''
  form.category = 'productivity'
  form.homepage = ''
  form.readme = ''
  form.version = ''
  form.channel = 'SNAPSHOT'
  form.changelog = ''
  form.packageFile = null
  form.versionId = ''
  previewError.value = null
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function statusTone(status?: string | null) {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  if (status === 'pending') return 'warning'
  return 'muted'
}

function openDetail(plugin: UserPluginRecord, event?: MouseEvent) {
  selected.value = plugin
  detailSource.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  detailVisible.value = true
  void refreshTimeline(plugin.id)
}

async function refreshTimeline(pluginId: string) {
  timelineLoading.value = true
  try {
    timeline.value = await loadPluginTimeline(pluginId)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to load timeline'
  } finally {
    timelineLoading.value = false
  }
}

function openCreateForm() {
  resetForm()
  formMode.value = 'create'
  formVisible.value = true
}

function openEditForm(plugin: UserPluginRecord) {
  selected.value = plugin
  resetForm()
  formMode.value = 'edit'
  form.name = plugin.name
  form.summary = plugin.summary
  form.category = plugin.category
  form.homepage = plugin.homepage ?? ''
  form.readme = plugin.readmeMarkdown ?? ''
  formVisible.value = true
}

function openVersionForm(plugin: UserPluginRecord) {
  selected.value = plugin
  resetForm()
  formMode.value = 'version'
  formVisible.value = true
}

function openReeditForm(plugin: UserPluginRecord, versionId: string, changelog?: string | null) {
  selected.value = plugin
  resetForm()
  formMode.value = 'reedit'
  form.versionId = versionId
  form.changelog = changelog ?? ''
  formVisible.value = true
}

async function handlePackageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  form.packageFile = file
  previewError.value = null
  if (!file) return
  previewLoading.value = true
  try {
    const result = await previewPackage(file)
    const manifest = result.manifest ?? {}
    if (typeof manifest.id === 'string' && !form.slug) form.slug = manifest.id
    if (typeof manifest.name === 'string' && !form.name) form.name = manifest.name
    if (typeof manifest.description === 'string' && !form.summary)
      form.summary = manifest.description
    if (typeof manifest.homepage === 'string' && !form.homepage) form.homepage = manifest.homepage
    if (typeof manifest.version === 'string' && !form.version) form.version = manifest.version
    if (typeof manifest.category === 'string') form.category = manifest.category
    if (typeof manifest.changelog === 'string' && !form.changelog)
      form.changelog = manifest.changelog
    if (result.readmeMarkdown && !form.readme) form.readme = result.readmeMarkdown
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : 'Package preview failed'
  } finally {
    previewLoading.value = false
  }
}

function validateMetadataFields(): string | null {
  if (!form.name.trim()) return t('store.publisher.validation.nameRequired')
  if (!form.summary.trim()) return t('store.publisher.validation.summaryRequired')
  if (!form.category.trim()) return t('store.publisher.validation.categoryRequired')
  if (!form.readme.trim()) return t('store.publisher.validation.readmeRequired')
  return null
}

function validateForm(): string | null {
  if (formMode.value !== 'edit' && !form.packageFile) {
    return t('store.publisher.validation.packageRequired')
  }
  if (formMode.value === 'create') {
    if (!form.slug.trim()) return t('store.publisher.validation.slugRequired')
    const metadataReason = validateMetadataFields()
    if (metadataReason) return metadataReason
  }
  if (formMode.value === 'edit') {
    const metadataReason = validateMetadataFields()
    if (metadataReason) return metadataReason
  }
  if (formMode.value !== 'edit' && formMode.value !== 'reedit' && !form.version.trim()) {
    return t('store.publisher.validation.versionRequired')
  }
  if (formMode.value !== 'edit' && !form.changelog.trim()) {
    return t('store.publisher.validation.changelogRequired')
  }
  return null
}

async function submitForm() {
  const invalidReason = validateForm()
  if (invalidReason) {
    previewError.value = invalidReason
    return
  }
  formSaving.value = true
  previewError.value = null
  try {
    if (formMode.value === 'edit' && selected.value) {
      const updated = await updatePlugin({
        pluginId: selected.value.id,
        name: form.name.trim(),
        summary: form.summary.trim(),
        category: form.category.trim(),
        homepage: form.homepage.trim() || undefined,
        readme: form.readme.trim()
      })
      selected.value = updated
    } else if (formMode.value === 'create') {
      await createPluginWithInitialVersion({
        slug: form.slug.trim(),
        name: form.name.trim(),
        summary: form.summary.trim(),
        category: form.category.trim(),
        homepage: form.homepage.trim() || undefined,
        readme: form.readme.trim(),
        packageFile: form.packageFile!,
        initialVersion: form.version.trim(),
        initialChannel: form.channel,
        initialChangelog: form.changelog.trim() || `Initial release v${form.version.trim()}`
      })
    } else if (formMode.value === 'reedit' && selected.value) {
      await reeditVersion({
        pluginId: selected.value.id,
        versionId: form.versionId,
        changelog: form.changelog.trim(),
        packageFile: form.packageFile!
      })
    } else if (selected.value) {
      await publishVersion({
        pluginId: selected.value.id,
        version: form.version.trim(),
        channel: form.channel,
        changelog: form.changelog.trim(),
        packageFile: form.packageFile!
      })
    }
    formVisible.value = false
    resetForm()
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : 'Publish failed'
  } finally {
    formSaving.value = false
  }
}

async function setStatus(plugin: UserPluginRecord, status: 'draft' | 'pending') {
  actionError.value = null
  try {
    await updatePluginStatus(plugin.id, status)
    if (selected.value?.id === plugin.id) selected.value.status = status
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Status update failed'
  }
}

async function handleDeleteVersion(plugin: UserPluginRecord, versionId: string) {
  let confirmed = false
  await forTouchTip(
    t('store.publisher.deleteVersionConfirmTitle'),
    t('store.publisher.deleteVersionConfirmMessage'),
    [
      { content: t('common.cancel'), type: 'info', onClick: () => true },
      {
        content: t('common.confirm'),
        type: 'error',
        onClick: () => {
          confirmed = true
          return true
        }
      }
    ]
  )
  if (!confirmed) return

  actionError.value = null
  try {
    await deleteVersion(plugin.id, versionId)
    selected.value = records.value.find((item) => item.id === plugin.id) ?? selected.value
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Delete version failed'
  }
}

function openInNexus(plugin?: UserPluginRecord | null) {
  const suffix = plugin ? `?query=${encodeURIComponent(plugin.slug)}` : ''
  window.open(`${getAuthBaseUrl()}/dashboard/assets${suffix}`, '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  void loadUserPlugins()
})
</script>

<template>
  <section class="publisher-shell">
    <div class="publisher-header">
      <div>
        <h2>{{ t('store.publisher.title') }}</h2>
        <p>{{ t('store.publisher.subtitle') }}</p>
      </div>
      <div class="publisher-actions">
        <TxButton variant="flat" :disabled="loading" @click="loadUserPlugins()">
          <i :class="loading ? 'i-ri-loader-4-line animate-spin' : 'i-ri-refresh-line'" />
          {{ t('store.refresh') }}
        </TxButton>
        <TxButton variant="primary" @click="openCreateForm">
          <i class="i-ri-upload-cloud-2-line" />
          {{ t('store.publisher.newPlugin') }}
        </TxButton>
      </div>
    </div>

    <div class="publisher-stats">
      <div>
        <strong>{{ stats.total }}</strong
        ><span>{{ t('store.publisher.total') }}</span>
      </div>
      <div>
        <strong>{{ stats.approved }}</strong
        ><span>{{ t('store.publisher.approved') }}</span>
      </div>
      <div>
        <strong>{{ stats.pending }}</strong
        ><span>{{ t('store.publisher.pending') }}</span>
      </div>
      <div>
        <strong>{{ stats.draft }}</strong
        ><span>{{ t('store.publisher.draft') }}</span>
      </div>
    </div>

    <p v-if="error" class="publisher-error">{{ error }}</p>
    <p v-if="actionError" class="publisher-error">{{ actionError }}</p>

    <div v-if="loading && !records.length" class="publisher-empty">{{ t('store.loading') }}</div>
    <div v-else-if="!records.length" class="publisher-empty">
      {{ t('store.publisher.empty') }}
    </div>
    <div v-else class="publisher-list">
      <article v-for="plugin in sortedRecords" :key="plugin.id" class="publisher-card">
        <StoreIcon :plugin="toStorePlugin(plugin)" />
        <div class="publisher-card-main">
          <div class="publisher-card-title">
            <h3>{{ plugin.name }}</h3>
            <TxStatusBadge :status="statusTone(plugin.status)" :text="plugin.status" />
          </div>
          <p>{{ plugin.summary || plugin.slug }}</p>
          <div class="publisher-meta">
            <TxTag :label="plugin.category" size="sm" />
            <span>{{ plugin.installs }} installs</span>
            <span>{{
              plugin.latestVersion ? `v${plugin.latestVersion.version}` : 'No version'
            }}</span>
            <span>{{ formatDate(plugin.updatedAt) }}</span>
          </div>
        </div>
        <div class="publisher-card-actions">
          <TxButton size="sm" variant="flat" @click="openDetail(plugin, $event)">{{
            t('store.publisher.details')
          }}</TxButton>
          <TxButton size="sm" variant="flat" @click="openVersionForm(plugin)">{{
            t('store.publisher.publishVersion')
          }}</TxButton>
        </div>
      </article>
    </div>

    <FlipDialog v-model="detailVisible" :reference="detailSource" size="lg">
      <template #header-display>
        <div v-if="selected" class="publisher-dialog-header">
          <h3>{{ selected.name }}</h3>
          <p>{{ selected.slug }}</p>
        </div>
      </template>
      <template #default>
        <div v-if="selected" class="publisher-detail">
          <div class="publisher-detail-actions">
            <TxButton
              v-if="selected.status === 'draft' || selected.status === 'rejected'"
              size="sm"
              @click="setStatus(selected, 'pending')"
            >
              {{ t('store.publisher.submitReview') }}
            </TxButton>
            <TxButton
              v-if="selected.status === 'pending'"
              size="sm"
              variant="flat"
              @click="setStatus(selected, 'draft')"
            >
              {{ t('store.publisher.withdrawReview') }}
            </TxButton>
            <TxButton size="sm" variant="flat" @click="openEditForm(selected)">
              {{ t('store.publisher.editMetadata') }}
            </TxButton>
            <TxButton size="sm" variant="flat" @click="openInNexus(selected)">
              {{ t('store.publisher.openNexus') }}
            </TxButton>
          </div>

          <section>
            <h4>{{ t('store.publisher.versions') }}</h4>
            <div v-if="selected.versions?.length" class="publisher-version-list">
              <div v-for="version in selected.versions" :key="version.id" class="publisher-version">
                <strong>v{{ version.version }}</strong>
                <TxTag :label="version.channel" size="sm" />
                <TxStatusBadge :status="statusTone(version.status)" :text="version.status" />
                <span>{{ formatDate(version.createdAt) }}</span>
                <p v-if="version.rejectReason">{{ version.rejectReason }}</p>
                <TxButton
                  v-if="version.status === 'rejected'"
                  size="sm"
                  variant="flat"
                  @click="openReeditForm(selected, version.id, version.changelog)"
                >
                  {{ t('store.publisher.reeditVersion') }}
                </TxButton>
                <TxButton
                  v-if="version.status !== 'approved'"
                  size="sm"
                  variant="flat"
                  @click="handleDeleteVersion(selected, version.id)"
                >
                  {{ t('store.publisher.deleteVersion') }}
                </TxButton>
              </div>
            </div>
            <p v-else class="publisher-muted">{{ t('store.publisher.noVersions') }}</p>
          </section>

          <section>
            <h4>{{ t('store.publisher.timeline') }}</h4>
            <p v-if="timelineLoading" class="publisher-muted">{{ t('store.loading') }}</p>
            <div v-else class="publisher-timeline">
              <div v-for="item in timeline" :key="item.id" class="publisher-timeline-item">
                <strong>{{ item.eventType }}</strong>
                <span>{{ item.actorRole }}</span>
                <span>{{ item.fromStatus || '-' }} → {{ item.toStatus || '-' }}</span>
                <small>{{ formatDate(item.createdAt) }}</small>
                <p v-if="item.reason">{{ item.reason }}</p>
              </div>
            </div>
          </section>
        </div>
      </template>
    </FlipDialog>

    <FlipDialog
      v-model="formVisible"
      size="lg"
      :header-title="
        formMode === 'create'
          ? t('store.publisher.newPlugin')
          : formMode === 'edit'
            ? t('store.publisher.editMetadata')
            : formMode === 'reedit'
              ? t('store.publisher.reeditVersion')
              : t('store.publisher.publishVersion')
      "
    >
      <template #default>
        <form class="publisher-form" @submit.prevent="submitForm">
          <label v-if="formMode !== 'edit'">
            <span>.tpex</span>
            <input type="file" accept=".tpex" @change="handlePackageChange" />
          </label>
          <p v-if="previewLoading" class="publisher-muted">{{ t('store.publisher.previewing') }}</p>
          <p v-if="previewError" class="publisher-error">{{ previewError }}</p>

          <template v-if="formMode === 'create' || formMode === 'edit'">
            <input
              v-if="formMode === 'create'"
              v-model="form.slug"
              placeholder="com.example.plugin"
            />
            <input v-model="form.name" :placeholder="t('store.publisher.name')" />
            <input v-model="form.summary" :placeholder="t('store.publisher.summary')" />
            <input v-model="form.category" :placeholder="t('store.publisher.category')" />
            <input v-model="form.homepage" placeholder="https://" />
            <textarea v-model="form.readme" placeholder="README" rows="6" />
          </template>

          <input
            v-if="formMode !== 'reedit' && formMode !== 'edit'"
            v-model="form.version"
            placeholder="1.0.0"
          />
          <select v-if="formMode !== 'reedit' && formMode !== 'edit'" v-model="form.channel">
            <option v-for="channel in channels" :key="channel" :value="channel">
              {{ channel }}
            </option>
          </select>
          <textarea
            v-model="form.changelog"
            :placeholder="t('store.publisher.changelog')"
            rows="4"
          />

          <div class="publisher-form-actions">
            <TxButton native-type="button" variant="flat" @click="formVisible = false">{{
              t('common.cancel')
            }}</TxButton>
            <TxButton
              native-type="submit"
              variant="primary"
              :disabled="formSaving || previewLoading"
            >
              {{ formSaving ? t('store.installing') : t('store.publisher.submit') }}
            </TxButton>
          </div>
        </form>
      </template>
    </FlipDialog>
  </section>
</template>

<style scoped lang="scss">
.publisher-shell {
  padding: 1rem;
  overflow: auto;
  height: 100%;
}
.publisher-header,
.publisher-card,
.publisher-card-title,
.publisher-actions,
.publisher-card-actions,
.publisher-detail-actions,
.publisher-meta,
.publisher-version {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.publisher-header {
  justify-content: space-between;
  margin-bottom: 1rem;
}
.publisher-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
}
.publisher-header p,
.publisher-card-main p,
.publisher-muted {
  color: var(--tx-text-color-secondary);
  font-size: 0.86rem;
}
.publisher-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.publisher-stats div,
.publisher-card,
.publisher-empty,
.publisher-detail section {
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color-page);
  border-radius: 1rem;
  padding: 1rem;
}
.publisher-stats strong {
  display: block;
  font-size: 1.4rem;
}
.publisher-stats span {
  color: var(--tx-text-color-secondary);
  font-size: 0.8rem;
}
.publisher-list {
  display: grid;
  gap: 0.75rem;
}
.publisher-card {
  align-items: flex-start;
}
.publisher-card-main {
  min-width: 0;
  flex: 1;
}
.publisher-card-title {
  justify-content: space-between;
}
.publisher-card-title h3 {
  font-weight: 650;
}
.publisher-meta {
  flex-wrap: wrap;
  color: var(--tx-text-color-secondary);
  font-size: 0.78rem;
}
.publisher-error {
  color: var(--tx-color-danger);
  font-size: 0.86rem;
}
.publisher-dialog-header h3 {
  font-weight: 700;
}
.publisher-dialog-header p {
  color: var(--tx-text-color-secondary);
  font-size: 0.8rem;
}
.publisher-detail {
  width: min(760px, 86vw);
  max-height: 76vh;
  overflow: auto;
  display: grid;
  gap: 1rem;
  padding: 0.25rem;
}
.publisher-detail h4 {
  font-weight: 650;
  margin-bottom: 0.6rem;
}
.publisher-version-list,
.publisher-timeline,
.publisher-form {
  display: grid;
  gap: 0.75rem;
}
.publisher-version,
.publisher-timeline-item {
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 0.75rem;
  padding: 0.75rem;
}
.publisher-timeline-item {
  display: grid;
  gap: 0.25rem;
}
.publisher-form {
  width: min(680px, 86vw);
}
.publisher-form label,
.publisher-form input,
.publisher-form textarea,
.publisher-form select {
  width: 100%;
}
.publisher-form input,
.publisher-form textarea,
.publisher-form select {
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 0.75rem;
  padding: 0.7rem 0.8rem;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
}
.publisher-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
</style>
