<script setup lang="ts">
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import type { PendingReviewItem } from '~/components/dashboard/PendingReviewSection.vue'
import type { ReviewItem } from '~/components/dashboard/ReviewModal.vue'
import type { VersionFormData } from '~/components/VersionDrawer.vue'
import type { DashboardPlugin, DashboardPluginVersion, PluginChannel } from '~/types/dashboard-plugin'
import { useUser } from '@clerk/vue'
import { computed, ref } from 'vue'
import CreatePluginDrawer from '~/components/CreatePluginDrawer.vue'
import PendingReviewSection from '~/components/dashboard/PendingReviewSection.vue'
import PluginDetailDrawer from '~/components/dashboard/PluginDetailDrawer.vue'
import PluginListItem from '~/components/dashboard/PluginListItem.vue'
import ReviewModal from '~/components/dashboard/ReviewModal.vue'
import Button from '~/components/ui/Button.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'
import Switch from '~/components/ui/Switch.vue'
import VersionDrawer from '~/components/VersionDrawer.vue'
import { useDashboardPluginsData } from '~/composables/useDashboardData'
import { isPluginCategoryId, PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

interface VersionFormState {
  pluginId: string
  version: string
  channel: PluginChannel
  changelog: string
  packageFile: File | null
}

interface PluginFormState {
  slug: string
  name: string
  summary: string
  category: string
  homepage: string
  isOfficial: boolean
  badges: string
  readme: string
  iconFile: File | null
  iconPreviewUrl: string | null
  removeIcon: boolean
}

interface ExtractedManifest {
  id?: string
  name?: string
  description?: string
  version?: string
  homepage?: string
  changelog?: string
  channel?: string
  category?: string
  [key: string]: unknown
}

interface PackagePreviewResult {
  manifest: ExtractedManifest | null
  readmeMarkdown: string | null
}

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useUser()
const toast = useToast()

const { plugins, pending: pluginsPending, refresh: refreshPlugins } = useDashboardPluginsData()

const isAdmin = computed(() => {
  const metadata = (user.value?.publicMetadata ?? {}) as Record<string, unknown>
  return metadata?.role === 'admin'
})

const currentUserId = computed(() => user.value?.id ?? null)

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

function formatInstalls(count: number) {
  return numberFormatter.value.format(count)
}

const pluginCategoryOptions = computed(() =>
  PLUGIN_CATEGORIES.map(category => ({
    ...category,
    label: t(category.i18nKey),
  })),
)

const pluginCategoryLabels = computed<Record<string, string>>(() =>
  Object.fromEntries(pluginCategoryOptions.value.map(category => [category.id, category.label])),
)

function resolvePluginCategory(category: string) {
  return pluginCategoryLabels.value[category] ?? category
}

const PLUGIN_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/
const PLUGIN_RESERVED_TOKENS = [
  'official',
  '官方',
  'tuff',
  'talex-touch',
  'talex.touch',
  'talex touch',
  '第一',
  'first',
] as const

function containsReservedToken(value: string) {
  const normalized = value.toLowerCase()
  return PLUGIN_RESERVED_TOKENS.some(token => normalized.includes(token))
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+/g, '')
    .slice(0, 128)
  return normalized.replace(/^[^a-z]+/, '')
}

const PACKAGE_PREVIEW_ENDPOINT = '/api/dashboard/plugins/package/preview'
const PACKAGE_CHANNELS: PluginChannel[] = ['SNAPSHOT', 'BETA', 'RELEASE']

async function requestPackagePreview(file: File): Promise<PackagePreviewResult> {
  const formData = new FormData()
  formData.append('package', file)
  return await $fetch<PackagePreviewResult>(PACKAGE_PREVIEW_ENDPOINT, {
    method: 'POST',
    body: formData,
  })
}

function applyManifestToPluginForm(manifest: ExtractedManifest | null, readme: string | null) {
  if (pluginFormMode.value !== 'create' || !manifest)
    return

  const manifestId = typeof manifest.id === 'string' ? manifest.id : ''
  if (manifestId && !pluginForm.slug.trim())
    pluginForm.slug = slugify(manifestId)

  if (typeof manifest.name === 'string' && !pluginForm.name.trim())
    pluginForm.name = manifest.name

  if (typeof manifest.description === 'string' && !pluginForm.summary.trim())
    pluginForm.summary = manifest.description

  if (typeof manifest.homepage === 'string' && !pluginForm.homepage.trim())
    pluginForm.homepage = manifest.homepage

  if (manifest.category && typeof manifest.category === 'string' && isPluginCategoryId(manifest.category))
    pluginForm.category = manifest.category

  if (readme && !pluginForm.readme.trim())
    pluginForm.readme = readme
}

function revokeObjectUrl(url: string | null) {
  if (!url)
    return
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function')
    URL.revokeObjectURL(url)
}

function createObjectUrl(file: File): string | null {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
    return URL.createObjectURL(file)
  return null
}

const defaultPluginCategoryId = PLUGIN_CATEGORIES[0]?.id ?? ''

function createPluginFormState(): PluginFormState {
  return {
    slug: '',
    name: '',
    summary: '',
    category: defaultPluginCategoryId,
    homepage: '',
    isOfficial: false,
    badges: '',
    readme: '',
    iconFile: null,
    iconPreviewUrl: null,
    removeIcon: false,
  }
}

const pluginForm = reactive(createPluginFormState())
const showPluginForm = ref(false)
const showCreateDrawer = ref(false)
const pluginFormMode = ref<'create' | 'edit'>('create')
const editingPluginId = ref<string | null>(null)
const pluginSaving = ref(false)
const pluginFormError = ref<string | null>(null)
const createDrawerError = ref<string | null>(null)
const createDrawerLoading = ref(false)

const editingPluginInstalls = ref<number | null>(null)
const pluginStatusUpdating = ref<string | null>(null)
const versionStatusUpdating = ref<string | null>(null)
const pluginActionError = ref<string | null>(null)
const versionActionError = ref<string | null>(null)
const iconPreviewObjectUrl = ref<string | null>(null)
const editingPluginHasIcon = ref(false)
const pluginPackageLoading = ref(false)
const pluginPackageError = ref<string | null>(null)
const pluginManifestPreview = ref<ExtractedManifest | null>(null)
const pluginReadmePreview = ref('')
const pluginPackageFileName = ref<string | null>(null)

// New UI state for refactored plugin list
const selectedPlugin = ref<DashboardPlugin | null>(null)
const showDetailDrawer = ref(false)
const showReviewModal = ref(false)
const reviewItem = ref<ReviewItem | null>(null)
const reviewLoading = ref(false)

// Computed: pending review items for admin
const pendingReviewItems = computed<PendingReviewItem[]>(() => {
  if (!isAdmin.value)
    return []

  const items: PendingReviewItem[] = []

  // Pending plugins
  plugins.value
    .filter(p => p.status === 'pending')
    .forEach(p => items.push({ type: 'plugin', plugin: p }))

  // Pending versions
  plugins.value.forEach((p) => {
    p.versions?.filter(v => v.status === 'pending')
      .forEach(v => items.push({ type: 'version', plugin: p, version: v }))
  })

  return items
})

// Computed: my plugins (owned by current user)
const myPlugins = computed(() =>
  plugins.value.filter(p => p.userId === currentUserId.value),
)

function openPluginDetail(plugin: DashboardPlugin) {
  selectedPlugin.value = plugin
  showDetailDrawer.value = true
}

function closePluginDetail() {
  showDetailDrawer.value = false
  selectedPlugin.value = null
}

function openReviewModal(item: PendingReviewItem) {
  reviewItem.value = item as ReviewItem
  showReviewModal.value = true
}

function closeReviewModal() {
  showReviewModal.value = false
  reviewItem.value = null
}

async function handleReviewApprove(item: ReviewItem) {
  reviewLoading.value = true
  try {
    if (item.type === 'plugin') {
      await approvePlugin(item.plugin as DashboardPlugin)
    }
    else if (item.version) {
      await approveVersion(item.plugin as DashboardPlugin, item.version as DashboardPluginVersion)
    }
    closeReviewModal()
  }
  finally {
    reviewLoading.value = false
  }
}

async function handleReviewReject(item: ReviewItem, _reason: string) {
  reviewLoading.value = true
  try {
    if (item.type === 'plugin') {
      await rejectPlugin(item.plugin as DashboardPlugin)
    }
    else if (item.version) {
      await rejectVersion(item.plugin as DashboardPlugin, item.version as DashboardPluginVersion)
    }
    closeReviewModal()
  }
  finally {
    reviewLoading.value = false
  }
}

function handleDetailEdit(plugin: DashboardPlugin) {
  closePluginDetail()
  openEditPluginForm(plugin)
}

function handleDetailDelete(plugin: DashboardPlugin) {
  closePluginDetail()
  deletePluginItem(plugin)
}

function handleDetailPublishVersion(plugin: DashboardPlugin) {
  closePluginDetail()
  openPublishVersionForm(plugin)
}

function handleDetailSubmitReview(plugin: DashboardPlugin) {
  submitPluginForReview(plugin)
}

function handleDetailWithdrawReview(plugin: DashboardPlugin) {
  withdrawPluginReview(plugin)
}

function handleDetailDeleteVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  deletePluginVersion(plugin, version)
}

function resetPluginForm() {
  revokeObjectUrl(iconPreviewObjectUrl.value)
  iconPreviewObjectUrl.value = null
  Object.assign(pluginForm, createPluginFormState())
  editingPluginId.value = null
  pluginFormError.value = null
  editingPluginInstalls.value = null
  editingPluginHasIcon.value = false
  pluginPackageLoading.value = false
  pluginPackageError.value = null
  pluginManifestPreview.value = null
  pluginReadmePreview.value = ''
  pluginPackageFileName.value = null
}

watch(() => pluginForm.name, (name) => {
  if (pluginFormMode.value !== 'create')
    return
  if (pluginForm.slug.trim().length)
    return
  const generated = slugify(name)
  pluginForm.slug = generated
})

watch(() => pluginForm.slug, (value, _oldValue) => {
  if (pluginFormMode.value !== 'create')
    return
  const normalized = slugify(value)
  if (normalized !== value)
    pluginForm.slug = normalized
})

function openCreatePluginForm() {
  showCreateDrawer.value = true
  createDrawerError.value = null
}

function closeCreateDrawer() {
  showCreateDrawer.value = false
  createDrawerError.value = null
}

async function handleCreatePluginSubmit(data: PluginFormData) {
  createDrawerLoading.value = true
  createDrawerError.value = null

  try {
    const slug = data.slug.trim()
    if (!isPluginCategoryId(data.category))
      throw new Error(t('dashboard.sections.plugins.errors.invalidCategory'))

    if (!slug.length)
      throw new Error(t('dashboard.sections.plugins.errors.missingIdentifier'))

    if (!PLUGIN_IDENTIFIER_PATTERN.test(slug))
      throw new Error(t('dashboard.sections.plugins.errors.invalidIdentifierFormat'))

    const badges = data.badges
      .split(',')
      .map(badge => badge.trim())
      .filter(Boolean)

    const homepage = data.homepage.trim()
    const readme = data.readme.trim()
    const name = data.name.trim()
    const restrictedBypass = Boolean(isAdmin.value && data.isOfficial)

    if (!restrictedBypass && (containsReservedToken(slug) || containsReservedToken(name)))
      throw new Error(t('dashboard.sections.plugins.errors.restrictedIdentifier'))

    if (!name.length)
      throw new Error(t('dashboard.sections.plugins.errors.missingName'))
    if (!readme.length)
      throw new Error(t('dashboard.sections.plugins.errors.missingReadme'))

    const formData = new FormData()
    formData.append('slug', slug)
    formData.append('name', name)
    formData.append('summary', data.summary.trim())
    formData.append('category', data.category.trim())
    formData.append('readme', readme)

    if (homepage.length)
      formData.append('homepage', homepage)

    if (badges.length)
      formData.append('badges', badges.join(', '))

    if (data.iconFile)
      formData.append('icon', data.iconFile)

    // Add package file so backend can extract icon from it
    if (data.packageFile)
      formData.append('package', data.packageFile)

    if (isAdmin.value && data.isOfficial)
      formData.append('isOfficial', 'true')
    else if (isAdmin.value)
      formData.append('isOfficial', 'false')

    const result = await $fetch<{ plugin: { id: string } }>('/api/dashboard/plugins', {
      method: 'POST',
      body: formData,
    })

    // Auto-publish initial version if package file was uploaded
    if (data.packageFile && data.initialVersion) {
      try {
        const versionFormData = new FormData()
        versionFormData.append('version', data.initialVersion)
        versionFormData.append('channel', data.initialChannel || 'SNAPSHOT')
        versionFormData.append('changelog', data.initialChangelog || `Initial release v${data.initialVersion}`)
        versionFormData.append('package', data.packageFile)

        if (homepage.length)
          versionFormData.append('homepage', homepage)

        await $fetch(`/api/dashboard/plugins/${result.plugin.id}/versions`, {
          method: 'POST',
          body: versionFormData,
        })
      }
      catch (versionError) {
        console.warn('Failed to auto-publish initial version:', versionError)
      }
    }

    await refreshPlugins()
    toast.success(t('dashboard.sections.plugins.createSuccess', 'Plugin created successfully'))
    closeCreateDrawer()
  }
  catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
    createDrawerError.value = errorMessage
    toast.error(t('dashboard.sections.plugins.errors.createFailed', 'Failed to create plugin'), errorMessage)
  }
  finally {
    createDrawerLoading.value = false
  }
}

function isPluginOwner(plugin: DashboardPlugin) {
  return currentUserId.value !== null && plugin.userId === currentUserId.value
}

function canEditPlugin(plugin: DashboardPlugin) {
  return isAdmin.value || isPluginOwner(plugin)
}

function openEditPluginForm(plugin: DashboardPlugin) {
  pluginFormMode.value = 'edit'
  editingPluginId.value = plugin.id
  const categoryValue = isPluginCategoryId(plugin.category) ? plugin.category : defaultPluginCategoryId
  revokeObjectUrl(iconPreviewObjectUrl.value)
  iconPreviewObjectUrl.value = null
  Object.assign(pluginForm, {
    slug: plugin.slug,
    name: plugin.name,
    summary: plugin.summary,
    category: categoryValue,
    homepage: plugin.homepage ?? '',
    isOfficial: plugin.isOfficial,
    badges: (plugin.badges ?? []).join(', '),
    readme: plugin.readmeMarkdown ?? '',
    iconFile: null,
    iconPreviewUrl: plugin.iconUrl ?? null,
    removeIcon: false,
  })
  editingPluginInstalls.value = plugin.installs
  editingPluginHasIcon.value = Boolean(plugin.iconUrl)
  showPluginForm.value = true
}

function handlePluginIconInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0] ?? null
  pluginForm.iconFile = file
  pluginForm.removeIcon = false
  revokeObjectUrl(iconPreviewObjectUrl.value)
  iconPreviewObjectUrl.value = null
  if (file) {
    const objectUrl = createObjectUrl(file)
    if (objectUrl) {
      iconPreviewObjectUrl.value = objectUrl
      pluginForm.iconPreviewUrl = objectUrl
    }
    else {
      pluginForm.iconPreviewUrl = null
    }
    editingPluginHasIcon.value = true
  }
}

function removePluginIconPreview() {
  pluginForm.iconFile = null
  pluginForm.removeIcon = true
  revokeObjectUrl(iconPreviewObjectUrl.value)
  iconPreviewObjectUrl.value = null
  pluginForm.iconPreviewUrl = null
  editingPluginHasIcon.value = false
}

async function handlePluginPackageInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0] ?? null
  pluginPackageFileName.value = file?.name ?? null
  pluginPackageError.value = null
  pluginManifestPreview.value = null
  pluginReadmePreview.value = ''

  if (!file)
    return

  pluginPackageLoading.value = true
  try {
    const preview = await requestPackagePreview(file)
    pluginManifestPreview.value = preview.manifest
    pluginReadmePreview.value = preview.readmeMarkdown ?? ''
    applyManifestToPluginForm(preview.manifest, preview.readmeMarkdown ?? '')
  }
  catch (error: unknown) {
    pluginPackageError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    pluginPackageLoading.value = false
  }
}

async function updatePluginStatusAction(plugin: DashboardPlugin, status: DashboardPlugin['status']) {
  pluginStatusUpdating.value = plugin.id
  pluginActionError.value = null
  try {
    await $fetch(`/api/dashboard/plugins/${plugin.id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    await refreshPlugins()
  }
  catch (error: unknown) {
    pluginActionError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    pluginStatusUpdating.value = null
  }
}

function submitPluginForReview(plugin: DashboardPlugin) {
  return updatePluginStatusAction(plugin, 'pending')
}

function withdrawPluginReview(plugin: DashboardPlugin) {
  return updatePluginStatusAction(plugin, 'draft')
}

function approvePlugin(plugin: DashboardPlugin) {
  return updatePluginStatusAction(plugin, 'approved')
}

function rejectPlugin(plugin: DashboardPlugin) {
  return updatePluginStatusAction(plugin, 'rejected')
}

async function updateVersionStatus(plugin: DashboardPlugin, version: DashboardPluginVersion, status: DashboardPluginVersion['status']) {
  versionStatusUpdating.value = version.id
  versionActionError.value = null
  try {
    await $fetch(`/api/dashboard/plugins/${plugin.id}/versions/${version.id}`, {
      method: 'PATCH',
      body: { status },
    })
    await refreshPlugins()
  }
  catch (error: unknown) {
    versionActionError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    versionStatusUpdating.value = null
  }
}

function approveVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  return updateVersionStatus(plugin, version, 'approved')
}

function rejectVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  return updateVersionStatus(plugin, version, 'rejected')
}

function closePluginForm() {
  showPluginForm.value = false
  resetPluginForm()
}

async function submitPluginForm() {
  pluginSaving.value = true
  pluginFormError.value = null
  try {
    const slug = pluginForm.slug.trim()
    if (!isPluginCategoryId(pluginForm.category))
      throw new Error(t('dashboard.sections.plugins.errors.invalidCategory'))

    if (!slug.length)
      throw new Error(t('dashboard.sections.plugins.errors.missingIdentifier', 'Please provide a plugin identifier.'))

    if (!PLUGIN_IDENTIFIER_PATTERN.test(slug))
      throw new Error(t('dashboard.sections.plugins.errors.invalidIdentifierFormat', 'The plugin identifier must look like domain.style identifiers (e.g. alpha.beta.plugin).'))

    const badges = pluginForm.badges
      .split(',')
      .map(badge => badge.trim())
      .filter(Boolean)

    const homepage = pluginForm.homepage.trim()
    const readme = pluginForm.readme.trim()
    const name = pluginForm.name.trim()
    const restrictedBypass = Boolean(isAdmin.value && pluginForm.isOfficial)

    if (!restrictedBypass && (containsReservedToken(slug) || containsReservedToken(name)))
      throw new Error(t('dashboard.sections.plugins.errors.restrictedIdentifier', 'Plugin identifier or name contains reserved terms.'))

    if (!name.length)
      throw new Error(t('dashboard.sections.plugins.errors.missingName', 'Name is required.'))
    if (!readme.length)
      throw new Error(t('dashboard.sections.plugins.errors.missingReadme', 'README is required.'))

    const formData = new FormData()

    if (pluginFormMode.value === 'create')
      formData.append('slug', slug)

    formData.append('name', name)
    formData.append('summary', pluginForm.summary.trim())
    formData.append('category', pluginForm.category.trim())
    formData.append('readme', readme)

    if (homepage.length)
      formData.append('homepage', homepage)

    if (badges.length)
      formData.append('badges', badges.join(', '))

    if (pluginForm.iconFile)
      formData.append('icon', pluginForm.iconFile)
    else if (pluginFormMode.value === 'edit' && pluginForm.removeIcon)
      formData.append('removeIcon', 'true')

    if (isAdmin.value && pluginForm.isOfficial)
      formData.append('isOfficial', 'true')
    else if (isAdmin.value)
      formData.append('isOfficial', 'false')

    const endpoint = editingPluginId.value
      ? `/api/dashboard/plugins/${editingPluginId.value}`
      : '/api/dashboard/plugins'
    const method = editingPluginId.value ? 'PATCH' : 'POST'

    await $fetch(endpoint, {
      method,
      body: formData,
    })

    await refreshPlugins()
    closePluginForm()
    resetPluginForm()
  }
  catch (error: unknown) {
    pluginFormError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    pluginSaving.value = false
  }
}

async function deletePluginItem(plugin: DashboardPlugin) {
  if (import.meta.client) {
    const confirmed = window.confirm(t('dashboard.sections.plugins.confirmDelete', { name: plugin.name }))
    if (!confirmed)
      return
  }

  try {
    pluginActionError.value = null
    await $fetch(`/api/dashboard/plugins/${plugin.id}`, {
      method: 'DELETE',
    })

    await refreshPlugins()
  }
  catch (error: unknown) {
    pluginActionError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
}

function createVersionFormState(plugin?: DashboardPlugin): VersionFormState {
  return {
    pluginId: plugin?.id ?? '',
    version: '',
    channel: 'SNAPSHOT',
    changelog: '',
    packageFile: null,
  }
}

const versionForm = reactive(createVersionFormState())
const showVersionForm = ref(false)
const versionFormError = ref<string | null>(null)
const versionSaving = ref(false)

function resetVersionForm(plugin?: DashboardPlugin) {
  Object.assign(versionForm, createVersionFormState(plugin))
  versionFormError.value = null
  showVersionForm.value = Boolean(plugin)
}

function closeVersionForm() {
  showVersionForm.value = false
  resetVersionForm()
}

function openPublishVersionForm(plugin: DashboardPlugin) {
  resetVersionForm(plugin)
  showVersionForm.value = true
}

async function submitVersionForm(data: VersionFormData) {
  versionSaving.value = true
  versionFormError.value = null

  try {
    if (!versionForm.pluginId)
      throw new Error(t('dashboard.sections.plugins.errors.missingPlugin'))

    const formData = new FormData()
    formData.append('version', data.version.trim())
    formData.append('channel', data.channel)
    formData.append('changelog', data.changelog.trim())
    formData.append('package', data.packageFile)

    await $fetch(`/api/dashboard/plugins/${versionForm.pluginId}/versions`, {
      method: 'POST',
      body: formData,
    })

    await refreshPlugins()
    closeVersionForm()
  }
  catch (error: unknown) {
    versionFormError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    versionSaving.value = false
  }
}

async function deletePluginVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  if (import.meta.client) {
    const confirmed = window.confirm(t('dashboard.sections.plugins.confirmDeleteVersion', { version: version.version }))
    if (!confirmed)
      return
  }

  try {
    await $fetch(`/api/dashboard/plugins/${plugin.id}/versions/${version.id}`, {
      method: 'DELETE',
    })

    await refreshPlugins()
  }
  catch (error: unknown) {
    versionActionError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
}
</script>

<template>
  <section class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-xl font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.plugins.title') }}
        </h2>
        <p class="mt-1 text-sm text-black/60 dark:text-white/60">
          {{ t('dashboard.sections.plugins.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/market"
          class="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/70 transition hover:border-black/20 hover:text-black dark:border-white/10 dark:text-white/70 dark:hover:border-white/20 dark:hover:text-white"
        >
          <span class="i-carbon-explore" />
          {{ t('dashboard.sections.plugins.cta') }}
        </NuxtLink>
        <Button type="primary" size="small" @click="openCreatePluginForm">
          <span class="i-carbon-add" />
          {{ t('dashboard.sections.plugins.addButton') }}
        </Button>
      </div>
    </div>

    <!-- Admin: Pending Reviews -->
    <PendingReviewSection
      v-if="isAdmin"
      :items="pendingReviewItems"
      @review="openReviewModal"
    />

    <!-- Error Messages -->
    <div v-if="pluginActionError || versionActionError" class="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
      <p v-if="pluginActionError" class="text-sm text-rose-600 dark:text-rose-400">
        {{ pluginActionError }}
      </p>
      <p v-if="versionActionError" class="text-sm text-rose-600 dark:text-rose-400">
        {{ versionActionError }}
      </p>
    </div>

    <!-- My Plugins Section -->
    <div class="rounded-2xl border border-black/5 bg-white/80 p-5 dark:border-white/5 dark:bg-white/5">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-sm font-medium text-black/60 dark:text-white/60">
          {{ t('dashboard.sections.plugins.myPlugins') }}
          <span class="ml-1 text-black/40 dark:text-white/40">({{ myPlugins.length }})</span>
        </h3>
      </div>

      <form
        v-if="showPluginForm"
        class="mt-4 space-y-4"
        @submit.prevent="submitPluginForm"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.plugins.form.identifier') }}
            <Input
              v-model="pluginForm.slug"
              :disabled="pluginFormMode === 'edit'"
              placeholder="com.example.plugin"
              required
            />
            <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
              {{ t('dashboard.sections.plugins.form.identifierHelp') }}
            </span>
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.plugins.form.name') }}
            <Input v-model="pluginForm.name" required />
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.plugins.form.category') }}
            <select
              v-model="pluginForm.category"
              required
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
              <option
                v-for="category in pluginCategoryOptions"
                :key="category.id"
                :value="category.id"
              >
                {{ category.label }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.plugins.form.summary') }}
            <Input v-model="pluginForm.summary" type="textarea" :rows="3" required />
          </label>
          <div class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            <span>{{ t('dashboard.sections.plugins.form.icon') }}</span>
            <div class="flex items-center gap-3">
              <div class="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-dark/5 text-lg font-semibold text-black dark:border-light/20 dark:bg-light/5 dark:text-light">
                <img
                  v-if="pluginForm.iconPreviewUrl"
                  :src="pluginForm.iconPreviewUrl"
                  alt="Plugin icon preview"
                  class="h-full w-full object-cover"
                >
                <span v-else>{{ pluginForm.name ? pluginForm.name.charAt(0).toUpperCase() : '∗' }}</span>
              </div>
              <div class="flex flex-col gap-2 text-[11px] font-medium normal-case text-black/60 dark:text-light/60">
                <label class="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    class="max-w-[220px] text-[11px] font-medium text-black outline-none file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-primary hover:file:bg-primary/20 dark:text-light dark:file:bg-light/20 dark:file:text-light"
                    @change="handlePluginIconInput"
                  >
                </label>
                <FlatButton
                  v-if="pluginFormMode === 'edit' && (pluginForm.iconPreviewUrl || editingPluginHasIcon)"
                  class="text-[11px] font-semibold uppercase tracking-wide"
                  @click="removePluginIconPreview"
                >
                  <span class="i-carbon-trash-can text-xs" />
                  {{ t('dashboard.sections.plugins.form.iconRemove') }}
                </FlatButton>
                <p class="max-w-xs leading-relaxed">
                  {{ t('dashboard.sections.plugins.form.iconHelp') }}
                </p>
              </div>
            </div>
          </div>
          <label
            v-if="pluginFormMode === 'create'"
            class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2"
          >
            {{ t('dashboard.sections.plugins.form.packageUpload') }}
            <input
              type="file"
              accept=".tpex"
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-dark/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-black transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light dark:file:bg-light/10 dark:file:text-light"
              @change="handlePluginPackageInput"
            >
            <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
              {{ t('dashboard.sections.plugins.form.packageHelp') }}
            </span>
            <span
              v-if="pluginPackageFileName"
              class="text-[11px] font-medium normal-case text-black/60 dark:text-light/60"
            >
              {{ pluginPackageFileName }}
            </span>
          </label>
          <div
            v-if="pluginFormMode === 'create'"
            class="md:col-span-2 rounded-2xl border border-primary/10 bg-dark/5 p-4 text-xs text-black/70 dark:border-light/20 dark:bg-light/10 dark:text-light/70"
          >
            <p class="font-semibold uppercase tracking-wide">
              {{ t('dashboard.sections.plugins.manifestPreview') }}
            </p>
            <p class="mt-1 text-[11px]">
              {{ t('dashboard.sections.plugins.readmePreviewServer') }}
            </p>
            <p v-if="pluginPackageLoading" class="mt-2 text-[11px]">
              {{ t('dashboard.sections.plugins.previewLoading') }}
            </p>
            <p v-else-if="pluginPackageError" class="mt-2 text-[11px] text-red-500">
              {{ pluginPackageError }}
            </p>
            <template v-else>
              <div v-if="pluginManifestPreview" class="mt-3 space-y-2 text-[11px] leading-relaxed">
                <p v-if="pluginManifestPreview.id">
                  <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.id') }}:</span>
                  {{ pluginManifestPreview.id }}
                </p>
                <p v-if="pluginManifestPreview.name">
                  <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.name') }}:</span>
                  {{ pluginManifestPreview.name }}
                </p>
                <p v-if="pluginManifestPreview.version">
                  <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.version') }}:</span>
                  {{ pluginManifestPreview.version }}
                </p>
                <p v-if="pluginManifestPreview.description">
                  <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.description') }}:</span>
                  {{ pluginManifestPreview.description }}
                </p>
                <p v-if="pluginManifestPreview.homepage">
                  <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.homepage') }}:</span>
                  {{ pluginManifestPreview.homepage }}
                </p>
                <details class="group rounded-lg border border-primary/10 bg-white/50 p-2 text-black dark:border-light/20 dark:bg-dark/40 dark:text-light">
                  <summary class="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-black/70 transition group-open:text-black dark:text-light/70 dark:group-open:text-light">
                    {{ t('dashboard.sections.plugins.manifestRaw') }}
                  </summary>
                  <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 font-mono text-[10px] text-black dark:bg-white/10 dark:text-light">
                    {{ JSON.stringify(pluginManifestPreview, null, 2) }}
                  </pre>
                </details>
              </div>
              <p v-else-if="pluginPackageFileName" class="mt-3 text-[11px]">
                {{ t('dashboard.sections.plugins.noManifest') }}
              </p>
              <p v-else class="mt-3 text-[11px] text-black/50 dark:text-light/60">
                {{ t('dashboard.sections.plugins.packageAwaiting') }}
              </p>
              <div class="mt-4 border-t border-primary/10 pt-3 dark:border-light/20">
                <p class="font-semibold uppercase tracking-wide">
                  {{ t('dashboard.sections.plugins.readmePreview') }}
                </p>
                <div v-if="pluginReadmePreview" class="prose prose-sm mt-2 max-w-none dark:prose-invert">
                  <ContentRendererMarkdown :value="pluginReadmePreview" />
                </div>
                <p v-else-if="pluginPackageFileName" class="mt-2 text-[11px]">
                  {{ t('dashboard.sections.plugins.noReadme') }}
                </p>
                <p v-else class="mt-2 text-[11px] text-black/50 dark:text-light/60">
                  {{ t('dashboard.sections.plugins.packageAwaiting') }}
                </p>
              </div>
            </template>
          </div>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.plugins.form.homepage') }}
            <Input v-model="pluginForm.homepage" placeholder="https://github.com/..." />
          </label>
          <div
            v-if="pluginFormMode === 'edit'"
            class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60"
          >
            {{ t('dashboard.sections.plugins.form.installCount') }}
            <div class="rounded-xl border border-primary/15 bg-white/70 px-3 py-2 text-sm text-black dark:border-light/20 dark:bg-dark/40 dark:text-light">
              {{ formatInstalls(editingPluginInstalls ?? 0) }}
            </div>
          </div>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.plugins.form.badges') }}
            <Input v-model="pluginForm.badges" placeholder="featured, stable" />
          </label>
          <label
            v-if="isAdmin"
            class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60"
          >
            <Switch v-model="pluginForm.isOfficial" />
            {{ t('dashboard.sections.plugins.form.isOfficial') }}
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.plugins.form.readme') }}
            <Input v-model="pluginForm.readme" type="textarea" :rows="8" required />
            <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
              {{ t('dashboard.sections.plugins.form.readmeHelp') }}
            </span>
          </label>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p
            v-if="pluginFormError"
            class="text-xs text-red-500"
          >
            {{ pluginFormError }}
          </p>
          <Button native-type="submit" :loading="pluginSaving">
            {{ pluginFormMode === 'create' ? t('dashboard.sections.plugins.createSubmit') : t('dashboard.sections.plugins.updateSubmit') }}
          </Button>
        </div>
      </form>

      <!-- Plugin List -->
      <div v-if="pluginsPending" class="py-8 text-center text-sm text-black/50 dark:text-white/50">
        <span class="i-carbon-circle-dash animate-spin mr-2" />
        {{ t('dashboard.sections.plugins.loading') }}
      </div>

      <div v-else-if="!myPlugins.length" class="py-8 text-center text-sm text-black/40 dark:text-white/40">
        {{ t('dashboard.sections.plugins.empty') }}
      </div>

      <div v-else class="space-y-2">
        <PluginListItem
          v-for="plugin in myPlugins"
          :key="plugin.id"
          :plugin="plugin"
          :category-label="resolvePluginCategory(plugin.category)"
          @click="openPluginDetail"
        />
      </div>
    </div>

    <!-- Drawers & Modals -->
    <VersionDrawer
      :is-open="showVersionForm"
      :plugin-id="versionForm.pluginId"
      :plugin-name="selectedPlugin?.name || ''"
      :loading="versionSaving"
      :error="versionFormError"
      @close="closeVersionForm"
      @submit="submitVersionForm"
    />

    <CreatePluginDrawer
      :is-open="showCreateDrawer"
      :loading="createDrawerLoading"
      :error="createDrawerError"
      :is-admin="isAdmin"
      @close="closeCreateDrawer"
      @submit="handleCreatePluginSubmit"
    />

    <PluginDetailDrawer
      :is-open="showDetailDrawer"
      :plugin="selectedPlugin"
      :category-label="selectedPlugin ? resolvePluginCategory(selectedPlugin.category) : ''"
      :is-owner="selectedPlugin ? isPluginOwner(selectedPlugin) : false"
      :is-admin="isAdmin"
      :loading="pluginStatusUpdating !== null"
      @close="closePluginDetail"
      @edit="handleDetailEdit"
      @delete="handleDetailDelete"
      @publish-version="handleDetailPublishVersion"
      @submit-review="handleDetailSubmitReview"
      @withdraw-review="handleDetailWithdrawReview"
      @delete-version="handleDetailDeleteVersion"
    />

    <ReviewModal
      :is-open="showReviewModal"
      :item="reviewItem"
      :category-label="reviewItem?.plugin ? resolvePluginCategory(reviewItem.plugin.category) : ''"
      :loading="reviewLoading"
      @close="closeReviewModal"
      @approve="handleReviewApprove"
      @reject="handleReviewReject"
    />
  </section>
</template>
