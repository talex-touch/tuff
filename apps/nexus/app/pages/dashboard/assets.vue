<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import PluginMetadataOverlay from '~/components/dashboard/PluginMetadataOverlay.vue'
import type { ReviewItem } from '~/components/dashboard/ReviewModalOverlay.vue'
import type { VersionFormData } from '~/components/VersionDrawer.vue'
import type { DashboardPlugin, DashboardPluginTimelineEvent, DashboardPluginVersion, PluginChannel } from '~/types/dashboard-plugin'
import { TxPluginMetaHeader } from '@talex-touch/tuff-business'
import { computed, ref } from 'vue'
import AssetCreateOverlay from '~/components/assets/create/AssetCreateOverlay.vue'
import PluginDetailDrawer from '~/components/dashboard/PluginDetailDrawer.vue'
import ReviewOverlayDialog from '~/components/dashboard/ReviewModalOverlay.vue'
import { TxButton, TxTooltip } from '@talex-touch/tuffex'
import VersionDrawer from '~/components/VersionDrawer.vue'
import { useDashboardPluginsData } from '~/composables/useDashboardData'
import { isPluginCategoryId, PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

type PendingReviewItem = ReviewItem

interface VersionFormState {
  pluginId: string
  versionId: string | null
  mode: 'create' | 'reedit'
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
const { user } = useAuthUser()
const toast = useToast()

const { plugins, pending: pluginsPending, error: pluginsLoadError, refresh: refreshPlugins } = useDashboardPluginsData()

const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

const currentUserId = computed(() => user.value?.id ?? null)

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))
const isZh = computed(() => locale.value.startsWith('zh'))

function formatInstalls(count: number) {
  return numberFormatter.value.format(count)
}

function formatDate(value?: string | null) {
  if (!value)
    return '—'
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

function resolveArtifactTypeLabel(type: DashboardPlugin['artifactType']) {
  const artifactType = type ?? 'plugin'
  return t(`dashboard.sections.plugins.form.artifactTypes.${artifactType}`, artifactType)
}

function resolvePluginStatusClass(status: DashboardPlugin['status']) {
  if (status === 'approved')
    return 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
  if (status === 'pending')
    return 'bg-amber-500/12 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300'
  if (status === 'rejected')
    return 'bg-rose-500/12 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300'
  return 'bg-black/8 text-black/60 dark:bg-white/10 dark:text-white/60'
}

function hasPluginPendingReview(plugin: DashboardPlugin) {
  if (plugin.hasPendingReview)
    return true
  if ((plugin.pendingReviewCount ?? 0) > 0)
    return true
  if (plugin.status === 'pending')
    return true
  if (pluginsWithPendingReview.value.has(plugin.id))
    return true
  return plugin.versions?.some(version => version.status === 'pending') ?? false
}

function resolveChannelClass(channel?: DashboardPluginVersion['channel']) {
  if (channel === 'RELEASE')
    return 'bg-primary/12 text-primary'
  if (channel === 'BETA')
    return 'bg-amber-500/12 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300'
  if (channel === 'SNAPSHOT')
    return 'bg-black/8 text-black/60 dark:bg-white/10 dark:text-white/60'
  return 'bg-black/8 text-black/55 dark:bg-white/10 dark:text-white/55'
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

const ARTIFACT_TYPES: PluginFormData['artifactType'][] = ['plugin', 'layout', 'theme']

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
const pluginFormOverlaySource = ref<HTMLElement | null>(null)
const showAssetCreateOverlay = ref(false)
const assetCreateOverlaySource = ref<HTMLElement | null>(null)
const pluginFormMode = ref<'create' | 'edit'>('create')
const editingPluginId = ref<string | null>(null)
const pluginSaving = ref(false)
const pluginFormError = ref<string | null>(null)
const assetCreateError = ref<string | null>(null)
const assetCreateLoading = ref(false)

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
const pluginIconFiles = ref<FileUploaderFile[]>([])
const pluginPackageFiles = ref<FileUploaderFile[]>([])

const pluginFormVisibleModel = computed({
  get: () => showPluginForm.value,
  set: (nextVisible) => {
    if (!nextVisible)
      closePluginForm()
    else
      showPluginForm.value = true
  },
})

// New UI state for refactored plugin list
const selectedPlugin = ref<DashboardPlugin | null>(null)
const showDetailDrawer = ref(false)
const detailOverlaySource = ref<HTMLElement | null>(null)
const pluginTimeline = ref<DashboardPluginTimelineEvent[]>([])
const pluginTimelineLoading = ref(false)
const pluginTimelineError = ref<string | null>(null)
const showReviewModal = ref(false)
const reviewItem = ref<ReviewItem | null>(null)
const reviewOverlaySource = ref<HTMLElement | null>(null)
const reviewLoading = ref(false)

function resolvePendingReviewUpdatedAt(item: PendingReviewItem) {
  if (item.type === 'version' && item.version)
    return item.version.updatedAt ?? item.version.createdAt
  return item.plugin.updatedAt
}

function resolvePendingReviewTimestamp(item: PendingReviewItem) {
  const parsed = new Date(resolvePendingReviewUpdatedAt(item)).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function resolvePendingReviewKey(item: PendingReviewItem) {
  if (item.type === 'version' && item.version)
    return `version-${item.version.id}`
  return `plugin-${item.plugin.id}`
}

function resolvePendingReviewType(item: PendingReviewItem) {
  return item.type === 'plugin'
    ? t('dashboard.sections.plugins.reviewPlugin')
    : t('dashboard.sections.plugins.reviewVersion')
}

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

  return items.sort((a, b) => resolvePendingReviewTimestamp(b) - resolvePendingReviewTimestamp(a))
})

const pluginsWithPendingReview = computed(() =>
  new Set(pendingReviewItems.value.map(item => item.plugin.id)),
)

// Computed: my plugins (owned by current user)
const myPlugins = computed(() =>
  plugins.value.filter(p => p.userId === currentUserId.value),
)

const pluginsInitialLoading = computed(() =>
  pluginsPending.value && !plugins.value.length && !pluginsLoadError.value,
)

const pluginsLoadErrorMessage = computed(() => {
  const error = pluginsLoadError.value
  if (!error)
    return ''
  return error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
})

function openPluginDetail(plugin: DashboardPlugin, event?: MouseEvent) {
  selectedPlugin.value = plugin
  pluginTimeline.value = []
  pluginTimelineError.value = null
  detailOverlaySource.value = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  showDetailDrawer.value = true
  void loadPluginTimeline(plugin.id)
}

function closePluginDetail() {
  showDetailDrawer.value = false
  selectedPlugin.value = null
  pluginTimeline.value = []
  pluginTimelineLoading.value = false
  pluginTimelineError.value = null
  detailOverlaySource.value = null
}

async function loadPluginTimeline(pluginId: string) {
  pluginTimelineLoading.value = true
  pluginTimelineError.value = null
  try {
    const result = await $fetch<{ timeline: DashboardPluginTimelineEvent[] }>(`/api/dashboard/plugins/${pluginId}/timeline`)
    if (selectedPlugin.value?.id === pluginId)
      pluginTimeline.value = result.timeline ?? []
  }
  catch (error: unknown) {
    if (selectedPlugin.value?.id === pluginId)
      pluginTimelineError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    if (selectedPlugin.value?.id === pluginId)
      pluginTimelineLoading.value = false
  }
}

function openReviewModal(item: PendingReviewItem, event?: MouseEvent) {
  reviewItem.value = item as ReviewItem
  reviewOverlaySource.value = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  showReviewModal.value = true
}

function closeReviewModal() {
  showReviewModal.value = false
  reviewItem.value = null
  reviewOverlaySource.value = null
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

async function handleReviewReject(item: ReviewItem, reason: string) {
  reviewLoading.value = true
  try {
    if (item.type === 'plugin') {
      await rejectPlugin(item.plugin as DashboardPlugin, reason)
    }
    else if (item.version) {
      await rejectVersion(item.plugin as DashboardPlugin, item.version as DashboardPluginVersion, reason)
    }
    closeReviewModal()
  }
  finally {
    reviewLoading.value = false
  }
}

function handleDetailEdit(plugin: DashboardPlugin, event?: MouseEvent) {
  pluginFormOverlaySource.value = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : detailOverlaySource.value
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

function handleDetailReeditVersion(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  closePluginDetail()
  openReeditVersionForm(plugin, version)
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
  pluginIconFiles.value = []
  pluginPackageFiles.value = []
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

function openCreatePluginForm(event?: MouseEvent) {
  assetCreateOverlaySource.value = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  showAssetCreateOverlay.value = true
  assetCreateError.value = null
}

async function handleCreatePluginSubmit(data: PluginFormData) {
  assetCreateLoading.value = true
  assetCreateError.value = null

  try {
    const slug = data.slug.trim()
    const artifactType = ARTIFACT_TYPES.includes(data.artifactType) ? data.artifactType : 'plugin'
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
    formData.append('artifactType', artifactType)
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
    showAssetCreateOverlay.value = false
  }
  catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
    assetCreateError.value = errorMessage
    toast.error(t('dashboard.sections.plugins.errors.createFailed', 'Failed to create plugin'), errorMessage)
  }
  finally {
    assetCreateLoading.value = false
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
  if (!pluginFormOverlaySource.value)
    pluginFormOverlaySource.value = detailOverlaySource.value
  showPluginForm.value = true
}

function handlePluginIconFilesUpdate(files: FileUploaderFile[]) {
  pluginIconFiles.value = files
}

function handlePluginPackageFilesUpdate(files: FileUploaderFile[]) {
  pluginPackageFiles.value = files
}

function handlePluginIconChange(files: FileUploaderFile[]) {
  pluginIconFiles.value = files
  const file = files[0]?.file ?? null
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

async function handlePluginPackageChange(files: FileUploaderFile[]) {
  pluginPackageFiles.value = files
  const file = files[0]?.file ?? null
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

async function updatePluginStatusAction(plugin: DashboardPlugin, status: DashboardPlugin['status'], reason?: string) {
  pluginStatusUpdating.value = plugin.id
  pluginActionError.value = null
  try {
    await $fetch(`/api/dashboard/plugins/${plugin.id}/status`, {
      method: 'PATCH',
      body: {
        status,
        reason: reason?.trim() || undefined,
      },
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

function rejectPlugin(plugin: DashboardPlugin, reason?: string) {
  return updatePluginStatusAction(plugin, 'rejected', reason)
}

async function updateVersionStatus(
  plugin: DashboardPlugin,
  version: DashboardPluginVersion,
  status: DashboardPluginVersion['status'],
  reason?: string,
) {
  versionStatusUpdating.value = version.id
  versionActionError.value = null
  try {
    await $fetch(`/api/dashboard/plugins/${plugin.id}/versions/${version.id}`, {
      method: 'PATCH',
      body: {
        status,
        reason: reason?.trim() || undefined,
      },
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

function rejectVersion(plugin: DashboardPlugin, version: DashboardPluginVersion, reason?: string) {
  return updateVersionStatus(plugin, version, 'rejected', reason)
}

function closePluginForm() {
  showPluginForm.value = false
  pluginFormOverlaySource.value = null
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

// Unified delete confirmation dialog
const deleteConfirmVisible = ref(false)
const deleteConfirmTitle = ref('')
const deleteConfirmMessage = ref('')
const pendingDeleteAction = ref<(() => Promise<void>) | null>(null)

function requestDeleteConfirm(title: string, message: string, action: () => Promise<void>) {
  deleteConfirmTitle.value = title
  deleteConfirmMessage.value = message
  pendingDeleteAction.value = action
  deleteConfirmVisible.value = true
}

async function executeDeleteConfirm(): Promise<boolean> {
  if (pendingDeleteAction.value)
    await pendingDeleteAction.value()
  pendingDeleteAction.value = null
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
  pendingDeleteAction.value = null
}

async function deletePluginItem(plugin: DashboardPlugin) {
  requestDeleteConfirm(
    t('dashboard.sections.plugins.deleteTitle', 'Delete Plugin'),
    t('dashboard.sections.plugins.confirmDelete', { name: plugin.name }),
    async () => {
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
    },
  )
}

function createVersionFormState(plugin?: DashboardPlugin): VersionFormState {
  return {
    pluginId: plugin?.id ?? '',
    versionId: null,
    mode: 'create',
    version: '',
    channel: 'SNAPSHOT',
    changelog: '',
    packageFile: null,
  }
}

const versionForm = reactive(createVersionFormState())
const versionFormPluginName = ref('')
const showVersionForm = ref(false)
const versionFormError = ref<string | null>(null)
const versionSaving = ref(false)

function resetVersionForm(plugin?: DashboardPlugin) {
  Object.assign(versionForm, createVersionFormState(plugin))
  versionFormPluginName.value = plugin?.name ?? ''
  versionFormError.value = null
  showVersionForm.value = Boolean(plugin)
}

function closeVersionForm() {
  showVersionForm.value = false
  versionFormPluginName.value = ''
  resetVersionForm()
}

function openPublishVersionForm(plugin: DashboardPlugin) {
  resetVersionForm(plugin)
  showVersionForm.value = true
}

function openReeditVersionForm(plugin: DashboardPlugin, version: DashboardPluginVersion) {
  resetVersionForm(plugin)
  versionForm.versionId = version.id
  versionForm.mode = 'reedit'
  versionForm.version = version.version
  versionForm.channel = version.channel
  versionForm.changelog = version.changelog ?? ''
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

    if (versionForm.mode === 'reedit') {
      if (!versionForm.versionId)
        throw new Error(t('dashboard.sections.plugins.errors.missingVersion'))
      await $fetch(`/api/dashboard/plugins/${versionForm.pluginId}/versions/${versionForm.versionId}/reedit`, {
        method: 'PATCH',
        body: formData,
      })
    }
    else {
      await $fetch(`/api/dashboard/plugins/${versionForm.pluginId}/versions`, {
        method: 'POST',
        body: formData,
      })
    }

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
  requestDeleteConfirm(
    t('dashboard.sections.plugins.deleteVersionTitle', 'Delete Version'),
    t('dashboard.sections.plugins.confirmDeleteVersion', { version: version.version }),
    async () => {
      try {
        await $fetch(`/api/dashboard/plugins/${plugin.id}/versions/${version.id}`, {
          method: 'DELETE',
        })
        await refreshPlugins()
      }
      catch (error: unknown) {
        versionActionError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
      }
    },
  )
}
</script>

<template>
  <section class="space-y-8">
    <!-- Header -->
    <div>
      <h2 class="apple-heading-md">
        {{ t('dashboard.sections.plugins.title') }}
      </h2>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.plugins.subtitle') }}
      </p>
    </div>

    <!-- Admin: Pending Reviews -->
    <div v-if="isAdmin" class="apple-card-lg p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.04] pb-4 dark:border-white/[0.06]">
        <div>
          <h3 class="apple-section-title">
            {{ t('dashboard.sections.plugins.pendingReviews') }}
            <span class="ml-1 text-black/40 dark:text-white/40">({{ pendingReviewItems.length }})</span>
          </h3>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ isZh ? '在表格里处理待审核发布物，点击 Review 打开审核弹窗。' : 'Handle pending submissions in-table and open the review overlay from each row.' }}
          </p>
        </div>
      </div>

      <div v-if="pendingReviewItems.length" class="overflow-x-auto rounded-2xl border border-black/[0.04] dark:border-white/[0.06]">
        <table class="w-full min-w-[860px]">
          <thead class="bg-black/[0.03] dark:bg-white/[0.03]">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                {{ isZh ? '发布物' : 'Asset' }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                {{ isZh ? '审核类型' : 'Review Type' }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                {{ isZh ? '提交信息' : 'Submission' }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                {{ isZh ? '更新时间' : 'Updated' }}
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                {{ isZh ? '操作' : 'Actions' }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            <tr
              v-for="item in pendingReviewItems"
              :key="resolvePendingReviewKey(item)"
              class="cursor-pointer transition hover:bg-black/[0.025] dark:hover:bg-white/[0.03]"
              @click="openReviewModal(item, $event)"
            >
              <td class="px-4 py-3">
                <TxPluginMetaHeader
                  class="DashboardAssetMetaHeader"
                  :title="item.plugin.name"
                  :description="item.plugin.summary || item.plugin.slug"
                  :icon-url="item.plugin.iconUrl"
                  :icon-alt="item.plugin.name"
                  :official="false"
                >
                  <template #title-extra>
                    <span
                      v-if="item.plugin.isOfficial"
                      class="DashboardAssetMetaHeader-OfficialMark i-carbon-certificate shrink-0 text-sm"
                      :title="t('dashboard.sections.plugins.officialBadge')"
                    />
                  </template>
                </TxPluginMetaHeader>
              </td>
              <td class="px-4 py-3 text-sm text-black/65 dark:text-white/65">
                <p>{{ resolvePendingReviewType(item) }}</p>
                <p class="mt-0.5 text-xs text-black/45 dark:text-white/45">
                  {{ resolvePluginCategory(item.plugin.category) }}
                </p>
              </td>
              <td class="px-4 py-3 text-sm text-black/65 dark:text-white/65">
                <template v-if="item.type === 'version' && item.version">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex rounded-full px-2 py-1 text-xs font-medium" :class="resolveChannelClass(item.version.channel)">
                      {{ `v${item.version.version}` }}
                    </span>
                    <span class="inline-flex rounded-full bg-black/8 px-2 py-1 text-xs font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
                      {{ item.version.channel }}
                    </span>
                  </div>
                </template>
                <template v-else>
                  <span class="inline-flex rounded-full px-2 py-1 text-xs font-medium" :class="resolvePluginStatusClass(item.plugin.status)">
                    {{ t(`dashboard.sections.plugins.statuses.${item.plugin.status}`) }}
                  </span>
                </template>
              </td>
              <td class="px-4 py-3 text-sm text-black/55 dark:text-white/55">
                {{ formatDate(resolvePendingReviewUpdatedAt(item)) }}
              </td>
              <td class="px-4 py-3 text-right">
                <TxButton
                  variant="secondary"
                  size="mini"
                  native-type="button"
                  @click.stop="openReviewModal(item, $event)"
                >
                  {{ t('dashboard.sections.plugins.viewDetails') }}
                </TxButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="py-6 text-center text-sm text-black/45 dark:text-white/45">
        {{ t('dashboard.sections.reviews.empty', 'No pending reviews yet.') }}
      </div>
    </div>

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
    <div class="apple-card-lg p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.04] pb-4 dark:border-white/[0.06]">
        <div>
          <h3 class="apple-section-title">
            {{ t('dashboard.sections.plugins.myPlugins') }}
            <span class="ml-1 text-black/40 dark:text-white/40">({{ myPlugins.length }})</span>
          </h3>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ isZh ? '统一管理发布物元数据、版本与审核状态。' : 'Manage asset metadata, versions, and review states in one table.' }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <TxButton variant="secondary" size="small" :loading="pluginsPending" @click="refreshPlugins()">
            <span class="i-carbon-renew text-sm" />
            {{ t('common.refresh', '刷新') }}
          </TxButton>
          <TxButton type="primary" size="small" @click="openCreatePluginForm($event)">
            <span class="i-carbon-add text-sm" />
            {{ t('dashboard.sections.plugins.addButton') }}
          </TxButton>
        </div>
      </div>

      <PluginMetadataOverlay
        v-model="pluginFormVisibleModel"
        :source="pluginFormOverlaySource"
        :mode="pluginFormMode"
        :form-state="pluginForm"
        :category-options="pluginCategoryOptions"
        :is-admin="isAdmin"
        :editing-plugin-install-text="formatInstalls(editingPluginInstalls ?? 0)"
        :editing-plugin-has-icon="editingPluginHasIcon"
        :plugin-package-loading="pluginPackageLoading"
        :plugin-package-error="pluginPackageError"
        :plugin-manifest-preview="pluginManifestPreview"
        :plugin-readme-preview="pluginReadmePreview"
        :plugin-package-file-name="pluginPackageFileName"
        :plugin-icon-files="pluginIconFiles"
        :plugin-package-files="pluginPackageFiles"
        :saving="pluginSaving"
        :error="pluginFormError"
        :plugin-name-fallback="selectedPlugin?.name || null"
        @update:plugin-icon-files="handlePluginIconFilesUpdate"
        @update:plugin-package-files="handlePluginPackageFilesUpdate"
        @icon-change="handlePluginIconChange"
        @package-change="handlePluginPackageChange"
        @remove-icon="removePluginIconPreview"
        @submit="submitPluginForm"
      />

      <!-- Plugin List -->
      <div v-if="pluginsInitialLoading" class="space-y-3 py-6 text-sm text-black/50 dark:text-white/50">
        <div class="flex items-center justify-center gap-2">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.plugins.loading') }}
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <div
        v-else-if="pluginsLoadError"
        class="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
      >
        <p>{{ pluginsLoadErrorMessage }}</p>
        <TxButton variant="secondary" size="small" @click="refreshPlugins()">
          {{ t('common.retry', '重试') }}
        </TxButton>
      </div>

      <div v-else-if="!myPlugins.length" class="py-8 text-center text-sm text-black/40 dark:text-white/40">
        {{ t('dashboard.sections.plugins.empty') }}
      </div>

      <div v-else class="space-y-2">
        <div v-if="pluginsPending" class="flex items-center justify-end gap-2 pb-1 text-xs text-black/45 dark:text-white/45">
          <TxSpinner :size="14" />
          {{ t('common.refresh', '刷新') }}...
        </div>
        <div class="overflow-x-auto rounded-2xl border border-black/[0.04] dark:border-white/[0.06]">
          <table class="w-full min-w-[980px]">
            <thead class="bg-black/[0.03] dark:bg-white/[0.03]">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '发布物' : 'Asset' }}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '类型 / 分类' : 'Type / Category' }}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '状态' : 'Status' }}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '最新版本' : 'Latest Version' }}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '安装量' : 'Installs' }}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '更新时间' : 'Updated' }}
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
                  {{ isZh ? '操作' : 'Actions' }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              <tr
                v-for="plugin in myPlugins"
                :key="plugin.id"
                class="cursor-pointer transition hover:bg-black/[0.025] dark:hover:bg-white/[0.03]"
                @click="openPluginDetail(plugin, $event)"
              >
                <td class="px-4 py-3">
                  <TxPluginMetaHeader
                    class="DashboardAssetMetaHeader"
                    :title="plugin.name"
                    :description="plugin.summary || plugin.slug"
                    :icon-url="plugin.iconUrl"
                    :icon-alt="plugin.name"
                    :official="false"
                  >
                    <template #title-extra>
                      <span
                        v-if="plugin.isOfficial"
                        class="DashboardAssetMetaHeader-OfficialMark i-carbon-certificate shrink-0 text-sm"
                        :title="t('dashboard.sections.plugins.officialBadge')"
                      />
                    </template>
                  </TxPluginMetaHeader>
                </td>
                <td class="px-4 py-3 text-sm text-black/65 dark:text-white/65">
                  <p>{{ resolveArtifactTypeLabel(plugin.artifactType) }}</p>
                  <p class="mt-0.5 text-xs text-black/45 dark:text-white/45">
                    {{ resolvePluginCategory(plugin.category) }}
                  </p>
                </td>
                <td class="px-4 py-3">
                  <TxTooltip
                    :content="t('dashboard.sections.plugins.reviewingHint')"
                    :disabled="!hasPluginPendingReview(plugin)"
                    :open-delay="0"
                    :close-delay="0"
                    :anchor="{ placement: 'top', showArrow: true }"
                  >
                    <span
                      class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                      :class="resolvePluginStatusClass(plugin.status)"
                      :title="hasPluginPendingReview(plugin) ? t('dashboard.sections.plugins.reviewingHint') : undefined"
                    >
                      {{ t(`dashboard.sections.plugins.statuses.${plugin.status}`) }}
                    </span>
                  </TxTooltip>
                </td>
                <td class="px-4 py-3 text-sm text-black/65 dark:text-white/65">
                  <TxTooltip
                    v-if="plugin.latestVersion"
                    :content="t('dashboard.sections.plugins.reviewingHint')"
                    :disabled="!hasPluginPendingReview(plugin)"
                    :open-delay="0"
                    :close-delay="0"
                    :anchor="{ placement: 'top', showArrow: true }"
                  >
                    <span
                      class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                      :class="resolveChannelClass(plugin.latestVersion.channel)"
                      :title="hasPluginPendingReview(plugin) ? t('dashboard.sections.plugins.reviewingHint') : undefined"
                    >
                      {{ `v${plugin.latestVersion.version}` }}
                    </span>
                  </TxTooltip>
                  <span v-else class="text-xs text-black/35 dark:text-white/35">—</span>
                </td>
                <td class="px-4 py-3 text-sm text-black/65 dark:text-white/65">
                  {{ formatInstalls(plugin.installs) }}
                </td>
                <td class="px-4 py-3 text-sm text-black/55 dark:text-white/55">
                  {{ formatDate(plugin.updatedAt) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <TxButton
                    variant="secondary"
                    size="mini"
                    native-type="button"
                    @click.stop="openPluginDetail(plugin, $event)"
                  >
                    {{ isZh ? '详情' : 'Details' }}
                  </TxButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Drawers & Modals -->
    <VersionDrawer
      :is-open="showVersionForm"
      :plugin-id="versionForm.pluginId"
      :plugin-name="versionFormPluginName"
      :mode="versionForm.mode"
      :initial-version="versionForm.version"
      :initial-channel="versionForm.channel"
      :initial-changelog="versionForm.changelog"
      :loading="versionSaving"
      :error="versionFormError"
      @close="closeVersionForm"
      @submit="submitVersionForm"
    />

    <AssetCreateOverlay
      v-model="showAssetCreateOverlay"
      :source="assetCreateOverlaySource"
      :is-admin="isAdmin"
      :plugin-loading="assetCreateLoading"
      :plugin-error="assetCreateError"
      @submit-plugin="handleCreatePluginSubmit"
    />

    <PluginDetailDrawer
      :is-open="showDetailDrawer"
      :source="detailOverlaySource"
      :plugin="selectedPlugin"
      :category-label="selectedPlugin ? resolvePluginCategory(selectedPlugin.category) : ''"
      :is-owner="selectedPlugin ? isPluginOwner(selectedPlugin) : false"
      :is-admin="isAdmin"
      :timeline="pluginTimeline"
      :timeline-loading="pluginTimelineLoading"
      :timeline-error="pluginTimelineError"
      :loading="pluginStatusUpdating !== null"
      @close="closePluginDetail"
      @edit="handleDetailEdit"
      @delete="handleDetailDelete"
      @publish-version="handleDetailPublishVersion"
      @submit-review="handleDetailSubmitReview"
      @withdraw-review="handleDetailWithdrawReview"
      @delete-version="handleDetailDeleteVersion"
      @reedit-version="handleDetailReeditVersion"
    />

    <ReviewOverlayDialog
      :is-open="showReviewModal"
      :source="reviewOverlaySource"
      :item="reviewItem"
      :category-label="reviewItem?.plugin ? resolvePluginCategory(reviewItem.plugin.category) : ''"
      :loading="reviewLoading"
      @close="closeReviewModal"
      @approve="handleReviewApprove"
      @reject="handleReviewReject"
    />

    <!-- Delete Confirmation Dialog -->
    <TxBottomDialog
      v-if="deleteConfirmVisible"
      :title="deleteConfirmTitle"
      :message="deleteConfirmMessage"
      :btns="[
        { content: t('dashboard.sections.plugins.cancel', 'Cancel'), type: 'info', onClick: () => true },
        { content: t('dashboard.sections.plugins.delete', 'Delete'), type: 'error', onClick: executeDeleteConfirm },
      ]"
      :close="closeDeleteConfirm"
    />
  </section>
</template>

<style scoped>
:deep(.DashboardAssetMetaHeader.TxPluginMetaHeader) {
  align-items: center;
  gap: 10px;
}

:deep(.DashboardAssetMetaHeader .TxPluginMetaHeader-Icon) {
  width: 40px;
  height: 40px;
  border-radius: 12px;
}

:deep(.DashboardAssetMetaHeader .TxPluginMetaHeader-Title) {
  font-size: 0.875rem;
  line-height: 1.2;
}

:deep(.DashboardAssetMetaHeader .TxPluginMetaHeader-Description) {
  margin-top: 2px;
  font-size: 0.75rem;
}

:deep(.DashboardAssetMetaHeader .TxPluginMetaHeader-MetaRow),
:deep(.DashboardAssetMetaHeader .TxPluginMetaHeader-Badges) {
  display: none;
}

.DashboardAssetMetaHeader-OfficialMark {
  color: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 88%, transparent);
}
</style>
