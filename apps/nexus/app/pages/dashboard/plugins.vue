```
<script setup lang="ts">
import type { VersionFormData } from '~/components/VersionDrawer.vue'
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import VersionDrawer from '~/components/VersionDrawer.vue'
import CreatePluginDrawer from '~/components/CreatePluginDrawer.vue'
import { useUser } from '@clerk/vue'
import { useDateFormat } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { PLUGIN_CATEGORIES, isPluginCategoryId } from '~/utils/plugin-categories'
import { useDashboardPluginsData } from '~/composables/useDashboardData'

type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'

interface DashboardPluginAuthor {
  name: string
  avatarColor?: string
}

interface DashboardPluginVersion {
  id: string
  pluginId: string
  channel: PluginChannel
  version: string
  signature: string
  packageUrl: string
  packageKey: string
  packageSize: number
  readmeMarkdown?: string | null
  changelog?: string | null
  manifest?: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  reviewedAt?: string | null
  createdAt: string
  updatedAt: string
}

interface DashboardPlugin {
  id: string
  userId: string
  ownerOrgId?: string | null
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: DashboardPluginAuthor | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  readmeMarkdown?: string | null
  iconUrl?: string | null
  createdAt: string
  updatedAt: string
  versions?: DashboardPluginVersion[]
  latestVersion?: DashboardPluginVersion | null
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

interface VersionFormState {
  pluginId: string
  version: string
  channel: PluginChannel
  changelog: string
  packageFile: File | null
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
  icon?: {
    type?: string
    value?: string
  }
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

function formatDate(value?: string) {
  if (!value)
    return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return dateFormatter.value.format(parsed)
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

const pluginBadgeLabels = computed<Record<string, string>>(() => ({
  featured: t('dashboard.sections.plugins.badges.featured'),
  stable: t('dashboard.sections.plugins.badges.stable'),
  beta: t('dashboard.sections.plugins.badges.beta'),
  community: t('dashboard.sections.plugins.badges.community'),
}))

function resolveBadgeLabel(badge: string) {
  return pluginBadgeLabels.value[badge] ?? badge
}

const PLUGIN_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/
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

function applyManifestToVersionForm(manifest: ExtractedManifest | null) {
  if (!manifest)
    return

  if (typeof manifest.version === 'string' && !versionForm.version.trim())
    versionForm.version = manifest.version

  const manifestChannel = typeof manifest.channel === 'string' ? manifest.channel.toUpperCase() : undefined
  if (manifestChannel && PACKAGE_CHANNELS.includes(manifestChannel as PluginChannel))
    versionForm.channel = manifestChannel

  if (typeof manifest.homepage === 'string' && !versionForm.homepage.trim())
    versionForm.homepage = manifest.homepage

  if (typeof manifest.changelog === 'string' && !versionForm.changelog.trim())
    versionForm.changelog = manifest.changelog
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

const pluginStatusLabels = computed<Record<DashboardPlugin['status'], string>>(() => ({
  draft: t('dashboard.sections.plugins.statuses.draft', 'Draft'),
  pending: t('dashboard.sections.plugins.statuses.pending', 'Pending'),
  approved: t('dashboard.sections.plugins.statuses.approved', 'Approved'),
  rejected: t('dashboard.sections.plugins.statuses.rejected', 'Rejected'),
}))

const versionStatusLabels = computed<Record<DashboardPluginVersion['status'], string>>(() => ({
  pending: t('dashboard.sections.plugins.versionStatuses.pending', 'Pending'),
  approved: t('dashboard.sections.plugins.versionStatuses.approved', 'Approved'),
  rejected: t('dashboard.sections.plugins.versionStatuses.rejected', 'Rejected'),
}))

function resolvePluginStatusLabel(status: DashboardPlugin['status']) {
  return pluginStatusLabels.value[status] ?? status
}

function resolveVersionStatusLabel(status: DashboardPluginVersion['status']) {
  return versionStatusLabels.value[status] ?? status
}

function pluginStatusClass(status: DashboardPlugin['status']) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200'
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200'
    case 'rejected':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-400/20 dark:text-slate-200'
  }
}

function versionStatusClass(status: DashboardPluginVersion['status']) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200'
    case 'rejected':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-200'
    default:
      return 'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200'
  }
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

watch(() => pluginForm.slug, (value, oldValue) => {
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
    closeCreateDrawer()
  }
  catch (error: unknown) {
    createDrawerError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
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

function canDeletePlugin(plugin: DashboardPlugin) {
  return canEditPlugin(plugin)
}

function canPublishPluginVersion(plugin: DashboardPlugin) {
  return isPluginOwner(plugin)
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

function canSubmitPluginForReview(plugin: DashboardPlugin) {
  return isPluginOwner(plugin) && ['draft', 'rejected'].includes(plugin.status)
}

function canWithdrawPluginReview(plugin: DashboardPlugin) {
  return isPluginOwner(plugin) && plugin.status === 'pending'
}

function canApprovePluginStatus(plugin: DashboardPlugin) {
  return isAdmin.value && plugin.status === 'pending'
}

function canRejectPluginStatus(plugin: DashboardPlugin) {
  return isAdmin.value && plugin.status === 'pending'
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

function canApproveVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  return isAdmin.value && version.status === 'pending'
}

function canRejectVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  return isAdmin.value && version.status === 'pending'
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
  <section class="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/70">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.plugins.title') }}
        </h2>
        <p class="mt-1 text-sm text-black/70 dark:text-light/80">
          {{ t('dashboard.sections.plugins.subtitle') }}
        </p>
      </div>
      <NuxtLink
        to="/marketplace"
        class="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-sm font-medium text-black transition hover:border-primary/40 hover:bg-dark/5 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
      >
        <span class="i-carbon-store text-base" />
        {{ t('dashboard.sections.plugins.cta') }}
      </NuxtLink>
    </div>

    <div
      class="mt-6 rounded-2xl border border-dashed border-primary/20 bg-white/70 p-4 text-sm text-black dark:border-light/20 dark:bg-dark/50 dark:text-light"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-black dark:text-light">
            {{ t('dashboard.sections.plugins.manageTitle') }}
          </h3>
          <p class="text-xs text-black/60 dark:text-light/70">
            {{ t('dashboard.sections.plugins.manageSubtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-dark/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/20 dark:border-light/30 dark:bg-light/10 dark:text-light"
            @click="openCreatePluginForm"
          >
            <span class="i-carbon-add text-base" />
            {{ t('dashboard.sections.plugins.addButton') }}
          </button>
          <button
            v-if="showPluginForm"
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-transparent bg-dark/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/70 transition hover:bg-dark/15 dark:bg-light/10 dark:text-light/70 dark:hover:bg-light/15"
            @click="closePluginForm"
          >
            <span class="i-carbon-close text-base" />
            {{ t('dashboard.sections.plugins.closeButton') }}
          </button>
        </div>
      </div>

      <form
        v-if="showPluginForm"
        class="mt-4 space-y-4"
        @submit.prevent="submitPluginForm"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.plugins.form.identifier') }}
            <input
              v-model="pluginForm.slug"
              type="text"
              :disabled="pluginFormMode === 'edit'"
              required
              autocomplete="off"
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition disabled:cursor-not-allowed disabled:bg-black/5 focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light dark:disabled:bg-white/5"
            >
            <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
              {{ t('dashboard.sections.plugins.form.identifierHelp') }}
            </span>
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.plugins.form.name') }}
            <input
              v-model="pluginForm.name"
              type="text"
              required
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light dark:focus:border-light/40 dark:focus:ring-light/20"
            >
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
            <textarea
              v-model="pluginForm.summary"
              rows="3"
              required
              class="resize-y rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            ></textarea>
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
                <button
                  v-if="pluginFormMode === 'edit' && (pluginForm.iconPreviewUrl || editingPluginHasIcon)"
                  type="button"
                  class="inline-flex w-max items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/10 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
                  @click="removePluginIconPreview"
                >
                  <span class="i-carbon-trash-can text-xs" />
                  {{ t('dashboard.sections.plugins.form.iconRemove') }}
                </button>
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
            <input
              v-model="pluginForm.homepage"
              type="url"
              placeholder="https://github.com/..."
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
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
            <input
              v-model="pluginForm.badges"
              type="text"
              placeholder="featured, stable"
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
          </label>
          <label
            v-if="isAdmin"
            class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60"
          >
            <input
              v-model="pluginForm.isOfficial"
              type="checkbox"
              class="h-4 w-4 rounded border border-primary/30 text-black focus:ring-primary/40 dark:border-light/30 dark:bg-dark/40"
            >
            {{ t('dashboard.sections.plugins.form.isOfficial') }}
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.plugins.form.readme') }}
            <textarea
              v-model="pluginForm.readme"
              rows="8"
              required
              class="min-h-32 resize-y rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            ></textarea>
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
          <button
            type="submit"
            class="inline-flex items-center gap-2 rounded-full bg-dark px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-dark/90 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-light dark:text-black dark:hover:bg-light/90"
            :disabled="pluginSaving"
          >
            <span v-if="pluginSaving" class="i-carbon-circle-dash animate-spin" />
            {{ pluginFormMode === 'create' ? t('dashboard.sections.plugins.createSubmit') : t('dashboard.sections.plugins.updateSubmit') }}
          </button>
        </div>
      </form>

      <div v-if="pluginActionError || versionActionError" class="mt-4 space-y-2">
        <p
          v-if="pluginActionError"
          class="text-xs text-red-500"
        >
          {{ pluginActionError }}
        </p>
        <p
          v-if="versionActionError"
          class="text-xs text-red-500"
        >
          {{ versionActionError }}
        </p>
      </div>

      <VersionDrawer
        :is-open="showVersionForm"
        :plugin-id="versionForm.pluginId"
        :plugin-name="pluginForm.name"
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
    </div>

    <div
      v-if="pluginsPending"
      class="mt-6 rounded-2xl border border-primary/15 bg-white/80 p-6 text-sm text-black/70 dark:border-light/15 dark:bg-dark/40 dark:text-light/80"
    >
      {{ t('dashboard.sections.plugins.loading') }}
    </div>
    <div
      v-else-if="!plugins.length"
      class="mt-6 rounded-2xl border border-primary/15 bg-white/80 p-6 text-sm text-black/70 dark:border-light/15 dark:bg-dark/40 dark:text-light/80"
    >
      {{ t('dashboard.sections.plugins.empty') }}
    </div>
    <div
      v-else
      class="mt-6 space-y-6"
    >
      <article
        v-for="plugin in plugins"
        :key="plugin.id"
        class="rounded-2xl border border-primary/15 bg-white/90 p-5 shadow-sm dark:border-light/15 dark:bg-dark/50"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-dark/5 dark:border-light/20 dark:bg-light/10">
            <img
              v-if="plugin.iconUrl"
              :src="plugin.iconUrl"
              :alt="`${plugin.name} icon`"
              class="h-full w-full object-cover"
            >
            <span v-else class="text-2xl font-semibold text-black/70 dark:text-light/80">
              {{ plugin.name.charAt(0) }}
            </span>
          </div>
          <div class="flex-1 space-y-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-semibold text-black dark:text-light">
                    {{ plugin.name }}
                  </h3>
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                    :class="pluginStatusClass(plugin.status)"
                  >
                    <span class="i-carbon-information text-xs" />
                    {{ resolvePluginStatusLabel(plugin.status) }}
                  </span>
                  <span
                    v-if="plugin.latestVersion"
                    class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-black dark:bg-light/10 dark:text-light"
                  >
                    {{ plugin.latestVersion.channel }}
                  </span>
                  <span
                    v-if="plugin.isOfficial"
                    class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-black dark:bg-light/10 dark:text-light"
                  >
                    <span class="i-carbon-certificate text-xs" />
                    {{ t('dashboard.sections.plugins.officialBadge') }}
                  </span>
                </div>
                <p class="text-sm text-black/70 dark:text-light/80">
                  {{ plugin.summary }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-black/60 dark:text-light/60">
                  <span class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-0.5 dark:bg-light/10">
                    <span class="i-carbon-tag text-sm" />
                    {{ resolvePluginCategory(plugin.category) }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <span class="i-carbon-user-multiple text-sm" />
                    {{ t('dashboard.sections.plugins.stats.installs', { count: formatInstalls(plugin.installs) }) }}
                  </span>
                  <span
                    v-if="plugin.latestVersion"
                    class="inline-flex items-center gap-1"
                  >
                    <span class="i-carbon-time text-sm" />
                    {{ formatDate(plugin.latestVersion.createdAt) }}
                  </span>
                  <span
                    v-if="plugin.latestVersion"
                    class="inline-flex items-center gap-1"
                  >
                    <span class="i-carbon-cube text-sm" />
                    v{{ plugin.latestVersion.version }}
                  </span>
                </div>
                <div v-if="plugin.homepage" class="mt-2">
                  <a
                    :href="plugin.homepage"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs font-medium text-black underline-offset-2 hover:underline dark:text-light"
                  >
                    <span class="i-carbon-logo-github text-sm" />
                    {{ t('dashboard.sections.plugins.homepage') }}
                  </a>
                </div>
                <div v-if="plugin.badges.length" class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="badge in plugin.badges"
                    :key="badge"
                    class="inline-flex items-center rounded-full bg-dark/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/80 dark:bg-light/10 dark:text-light/80"
                  >
                    {{ resolveBadgeLabel(badge) }}
                  </span>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="canSubmitPluginForReview(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/10 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
                  :disabled="pluginStatusUpdating === plugin.id"
                  @click="submitPluginForReview(plugin)"
                >
                  <span v-if="pluginStatusUpdating === plugin.id" class="i-carbon-circle-dash animate-spin text-xs" />
                  <span v-else class="i-carbon-send text-xs" />
                  {{ t('dashboard.sections.plugins.actions.submitReview') }}
                </button>
                <button
                  v-if="canWithdrawPluginReview(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/10 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
                  :disabled="pluginStatusUpdating === plugin.id"
                  @click="withdrawPluginReview(plugin)"
                >
                  <span v-if="pluginStatusUpdating === plugin.id" class="i-carbon-circle-dash animate-spin text-xs" />
                  <span v-else class="i-carbon-undo text-xs" />
                  {{ t('dashboard.sections.plugins.actions.withdrawReview') }}
                </button>
                <button
                  v-if="canApprovePluginStatus(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100/60 dark:border-emerald-400/40 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
                  :disabled="pluginStatusUpdating === plugin.id"
                  @click="approvePlugin(plugin)"
                >
                  <span v-if="pluginStatusUpdating === plugin.id" class="i-carbon-circle-dash animate-spin text-xs" />
                  <span v-else class="i-carbon-checkmark text-xs" />
                  {{ t('dashboard.sections.plugins.actions.approve') }}
                </button>
                <button
                  v-if="canRejectPluginStatus(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-rose-200/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:border-rose-300 hover:bg-rose-100/60 dark:border-rose-400/40 dark:text-rose-200 dark:hover:bg-rose-400/20"
                  :disabled="pluginStatusUpdating === plugin.id"
                  @click="rejectPlugin(plugin)"
                >
                  <span v-if="pluginStatusUpdating === plugin.id" class="i-carbon-circle-dash animate-spin text-xs" />
                  <span v-else class="i-carbon-close text-xs" />
                  {{ t('dashboard.sections.plugins.actions.reject') }}
                </button>
                <button
                  v-if="canPublishPluginVersion(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/10 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
                  @click="openPublishVersionForm(plugin)"
                >
                  <span class="i-carbon-cloud-upload text-xs" />
                  {{ t('dashboard.sections.plugins.publishVersion') }}
                </button>
                <button
                  v-if="canEditPlugin(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/10 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
                  @click="openEditPluginForm(plugin)"
                >
                  <span class="i-carbon-edit text-xs" />
                  {{ t('dashboard.sections.plugins.editMetadata') }}
                </button>
                <button
                  v-if="canDeletePlugin(plugin)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-red/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-500 transition hover:border-red-400/60 hover:bg-red-50 dark:border-red-400/40 dark:text-red-200 dark:hover:bg-red-400/20"
                  @click="deletePluginItem(plugin)"
                >
                  <span class="i-carbon-trash-can text-xs" />
                  {{ t('dashboard.sections.plugins.delete') }}
                </button>
              </div>
            </div>

            <div class="rounded-2xl border border-primary/10 bg-dark/5 p-4 text-sm text-black/70 dark:border-light/20 dark:bg-light/10 dark:text-light/80">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-black dark:text-light">
                    {{ t('dashboard.sections.plugins.versionHistory') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-light/60">
                    {{ t('dashboard.sections.plugins.versionDescription') }}
                  </p>
                </div>
              </div>
              <div v-if="plugin.versions?.length" class="mt-4 space-y-4">
                <article
                  v-for="version in plugin.versions"
                  :key="version.id"
                  class="rounded-xl border border-primary/15 bg-white/80 p-3 text-xs text-black/80 dark:border-light/15 dark:bg-dark/40 dark:text-light/80"
                >
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="text-sm font-semibold text-black dark:text-light">
                          v{{ version.version }} · {{ version.channel }}
                        </p>
                        <span
                          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                          :class="versionStatusClass(version.status)"
                        >
                          <span class="i-carbon-information text-xs" />
                          {{ resolveVersionStatusLabel(version.status) }}
                        </span>
                      </div>
                      <p class="mt-1 font-mono text-[11px] text-black/70 dark:text-light/70">
                        {{ t('dashboard.sections.plugins.signature') }}: {{ version.signature }}
                      </p>
                      <p class="text-[11px] text-black/60 dark:text-light/60">
                        {{ formatDate(version.createdAt) }} • {{ version.packageSize ? (version.packageSize / 1024).toFixed(1) : '—' }} KB
                      </p>
                      <p
                        v-if="version.reviewedAt"
                        class="text-[11px] text-black/50 dark:text-light/50"
                      >
                        {{ t('dashboard.sections.plugins.versionReviewedAt', { date: formatDate(version.reviewedAt) }) }}
                      </p>
                      <p v-if="version.changelog" class="mt-1 text-[11px] text-black/70 dark:text-light/70">
                        {{ version.changelog }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-if="canApproveVersion(plugin, version)"
                        type="button"
                        class="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100/60 dark:border-emerald-400/40 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
                        :disabled="versionStatusUpdating === version.id"
                        @click="approveVersion(plugin, version)"
                      >
                        <span v-if="versionStatusUpdating === version.id" class="i-carbon-circle-dash animate-spin text-xs" />
                        <span v-else class="i-carbon-checkmark text-xs" />
                        {{ t('dashboard.sections.plugins.actions.approve') }}
                      </button>
                      <button
                        v-if="canRejectVersion(plugin, version)"
                        type="button"
                        class="inline-flex items-center gap-1 rounded-full border border-rose-200/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600 transition hover:border-rose-300 hover:bg-rose-100/60 dark:border-rose-400/40 dark:text-rose-200 dark:hover:bg-rose-400/20"
                        :disabled="versionStatusUpdating === version.id"
                        @click="rejectVersion(plugin, version)"
                      >
                        <span v-if="versionStatusUpdating === version.id" class="i-carbon-circle-dash animate-spin text-xs" />
                        <span v-else class="i-carbon-close text-xs" />
                        {{ t('dashboard.sections.plugins.actions.reject') }}
                      </button>
                      <a
                        :href="version.packageUrl"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex items-center gap-1 rounded-full border border-primary/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/10 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
                      >
                        <span class="i-carbon-download text-xs" />
                        {{ t('dashboard.sections.plugins.downloadPackage') }}
                      </a>
                      <button
                        v-if="canDeletePlugin(plugin)"
                        type="button"
                        class="inline-flex items-center gap-1 rounded-full border border-red/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-500 transition hover:border-red-400/60 hover:bg-red-50 dark:border-red-400/40 dark:text-red-200 dark:hover:bg-red-400/20"
                        @click="deletePluginVersion(plugin, version)"
                      >
                        <span class="i-carbon-trash-can text-xs" />
                        {{ t('dashboard.sections.plugins.deleteVersion') }}
                      </button>
                    </div>
                  </div>
                  <details class="mt-3 rounded-lg border border-primary/10 bg-dark/5 p-3 dark:border-light/20 dark:bg-light/5">
                    <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-black/70 dark:text-light/70">
                      {{ t('dashboard.sections.plugins.readmePreview') }}
                    </summary>
                    <div v-if="version.readmeMarkdown" class="prose prose-sm mt-2 max-w-none dark:prose-invert">
                      <ContentRendererMarkdown :value="version.readmeMarkdown" />
                    </div>
                    <p v-else class="mt-2 text-[11px] text-black/60 dark:text-light/60">
                      {{ t('dashboard.sections.plugins.noReadme') }}
                    </p>
                  </details>
                </article>
              </div>
              <p v-else class="mt-3 text-xs text-black/60 dark:text-light/60">
                {{ t('dashboard.sections.plugins.noVersions') }}
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
