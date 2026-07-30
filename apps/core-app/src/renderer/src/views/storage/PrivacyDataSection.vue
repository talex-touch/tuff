<script setup lang="ts">
import type {
  PrivacyCategoryDeletePreview,
  PrivacyCategorySummary,
  PrivacyCleanupSummary,
  PrivacyDeleteCategoryImpact,
  PrivacyErrorCode,
  PrivacyProviderDisclosure,
  PrivacyRetentionCategory,
  PrivacyRetentionPreset,
  PrivacyRetentionPolicyV1,
  PrivacySecretRestoreConflictPolicy,
  PrivacySecretRestorePreview
} from '@talex-touch/utils/transport/events/types/privacy'
import { TxButton } from '@talex-touch/tuffex/button'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  PRIVACY_ERROR_CODES,
  PRIVACY_RETENTION_CATEGORIES,
  PRIVACY_RETENTION_PRESETS,
  PRIVACY_SETTINGS_DATA_CATEGORIES,
  isPrivacySecretPasswordValid,
  type PrivacyDataCategory
} from '@talex-touch/utils/transport/events/types/privacy'
import { createPrivacySdk } from '@talex-touch/utils/transport/sdk/domains/privacy'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatBytesShort } from '~/components/plugin/runtime/format'
import { focusModalDialog, handleModalDialogKeydown } from '~/utils/modal-dialog'

const DAY = 24 * 60 * 60 * 1000
const RETENTION_MS_BY_PRESET: Readonly<
  Record<Exclude<PrivacyRetentionPreset, 'permanent'>, number>
> = {
  '1-day': DAY,
  '7-days': 7 * DAY,
  '30-days': 30 * DAY,
  '90-days': 90 * DAY,
  '180-days': 180 * DAY,
  '365-days': 365 * DAY
}
const DEFAULT_SELECTIONS: Record<PrivacyRetentionCategory, PrivacyRetentionPreset> = {
  'clipboard-history': '90-days',
  'ocr-screenshot-temp': '1-day',
  'search-history': '30-days',
  'intelligence-audit': '30-days',
  'intelligence-context': '30-days',
  diagnostics: '30-days'
}

const privacySdk = createPrivacySdk(useTuffTransport())
const { t } = useI18n()

const initialLoading = ref(true)
const loadFailed = ref(false)
const pendingOperation = ref<string | null>(null)
const resultStatus = ref('')
const supportedPresets = ref<readonly PrivacyRetentionPreset[]>(PRIVACY_RETENTION_PRESETS)
const selections = ref<Record<PrivacyRetentionCategory, PrivacyRetentionPreset>>({
  ...DEFAULT_SELECTIONS
})
const summaries = ref<readonly PrivacyCategorySummary[]>([])
const providers = ref<readonly PrivacyProviderDisclosure[]>([])
const portableEntryCount = ref(0)
const secretBackupAvailable = ref(false)
const selectedCategories = ref<PrivacyDataCategory[]>([])
const cleanupPreview = ref<PrivacyCleanupSummary | null>(null)
const cleanupPreviewSelectionSignature = ref('')
const deletePreview = ref<PrivacyCategoryDeletePreview | null>(null)
const deletePreviewSelectionSignature = ref('')

const deleteDialogVisible = ref(false)
const deleteCategories = ref<readonly PrivacyDataCategory[]>([])
const deleteDialogImpacts = ref<readonly PrivacyDeleteCategoryImpact[]>([])
const deleteDialogBounded = ref(false)
const deleteDialogPreviewId = ref('')
const deleteDialogElement = ref<HTMLElement | null>(null)
let deleteDialogTrigger: HTMLElement | null = null
let deletePreviewTrigger: HTMLElement | null = null

const backupDialogVisible = ref(false)
const backupDialogElement = ref<HTMLElement | null>(null)
const backupPasswordElement = ref<HTMLInputElement | null>(null)
const backupPassword = ref('')
const backupPasswordConfirmation = ref('')
const backupError = ref('')

const restoreDialogVisible = ref(false)
const restoreDialogElement = ref<HTMLElement | null>(null)
const restorePasswordElement = ref<HTMLInputElement | null>(null)
const restorePassword = ref('')
const restoreError = ref('')
const restorePlan = ref<PrivacySecretRestorePreview | null>(null)
const restoreConflictPolicy = ref<PrivacySecretRestoreConflictPolicy>('skip')

let backupDialogTrigger: HTMLElement | null = null
let restoreDialogTrigger: HTMLElement | null = null
let disposed = false
let loadRevision = 0
let operationRevision = 0

const isPending = computed(() => pendingOperation.value !== null)
const selectedRetentionCategories = computed<PrivacyRetentionCategory[]>(() =>
  PRIVACY_RETENTION_CATEGORIES.filter((category) => selectedCategories.value.includes(category))
)
const selectedSignature = computed(() => selectedCategories.value.join('|'))
const selectedRetentionSignature = computed(() => selectedRetentionCategories.value.join('|'))
const hasUnsupportedRetentionSelection = computed(() =>
  PRIVACY_RETENTION_CATEGORIES.some(
    (category) => !supportedPresets.value.includes(selections.value[category])
  )
)
const hasFreshCleanupPreview = computed(
  () =>
    cleanupPreview.value !== null &&
    cleanupPreviewSelectionSignature.value === selectedRetentionSignature.value &&
    hasExactImpactCoverage(cleanupPreview.value.categories, selectedRetentionCategories.value)
)
const hasFreshDeletePreview = computed(
  () =>
    deletePreview.value !== null &&
    deletePreviewSelectionSignature.value === selectedSignature.value &&
    hasExactImpactCoverage(deletePreview.value.categories, selectedCategories.value)
)
const policySaveLabel = computed(() =>
  t(
    pendingOperation.value === 'policy'
      ? 'privacyData.retention.saving'
      : 'privacyData.retention.save'
  )
)
const backupAvailabilityLabel = computed(() =>
  secretBackupAvailable.value
    ? t('privacyData.secret.backupAvailable', { count: portableEntryCount.value })
    : t('privacyData.secret.backupUnavailable')
)

function hasExactImpactCoverage(
  impacts: readonly PrivacyDeleteCategoryImpact[],
  categories: readonly PrivacyDataCategory[]
): boolean {
  if (categories.length === 0 || impacts.length !== categories.length) return false
  const actual = new Set(impacts.map((impact) => impact.category))
  return categories.every((category) => actual.has(category))
}

function hasExactSummaryCoverage(categories: readonly PrivacyCategorySummary[]): boolean {
  return (
    categories.length === PRIVACY_SETTINGS_DATA_CATEGORIES.length &&
    PRIVACY_SETTINGS_DATA_CATEGORIES.every((category) =>
      categories.some((summary) => summary.category === category)
    )
  )
}

function retentionOptions(category: PrivacyRetentionCategory): readonly PrivacyRetentionPreset[] {
  const selected = selections.value[category]
  return supportedPresets.value.includes(selected)
    ? supportedPresets.value
    : [selected, ...supportedPresets.value]
}

function summaryFor(category: PrivacyDataCategory): PrivacyCategorySummary | undefined {
  return summaries.value.find((summary) => summary.category === category)
}

function lastCleanupLabel(category: PrivacyDataCategory): string {
  const value = summaryFor(category)?.lastCleanupAt
  return value
    ? t('privacyData.summary.lastCleanup', { value: new Date(value).toLocaleString() })
    : t('privacyData.summary.neverCleaned')
}

function cleanupImpactLabel(impact: PrivacyDeleteCategoryImpact): string {
  return t('privacyData.actions.deleteImpact', {
    category: t(`privacyData.categories.${impact.category}`),
    count: impact.eligibleItemCount,
    protected: impact.protectedItemCount,
    size: formatBytesShort(impact.eligibleByteCount)
  })
}

function providerPurposesLabel(provider: PrivacyProviderDisclosure): string {
  return `${t('privacyData.providers.purposes')}: ${provider.purposes
    .map((purpose) => t(`privacyData.providers.purpose.${purpose}`))
    .join(', ')}`
}

function providerDataCategoriesLabel(provider: PrivacyProviderDisclosure): string {
  return `${t('privacyData.providers.dataCategories')}: ${provider.dataCategories
    .map((category) => t(`privacyData.providers.dataCategory.${category}`))
    .join(', ')}`
}

function providerCapabilitiesLabel(provider: PrivacyProviderDisclosure): string {
  return `${t('privacyData.providers.capabilities')}: ${provider.capabilities.join(', ')}`
}

function providerRetentionLabel(provider: PrivacyProviderDisclosure): string {
  return `${t('privacyData.providers.localRetention')}: ${provider.localRetentionCategories
    .map((category) => t(`privacyData.categories.${category}`))
    .join(', ')}`
}

function presetForRetention(retentionMs: number | null): PrivacyRetentionPreset | null {
  if (retentionMs === null) return 'permanent'
  const matched = Object.entries(RETENTION_MS_BY_PRESET).find(([, value]) => value === retentionMs)
  return (matched?.[0] as PrivacyRetentionPreset | undefined) ?? null
}

function applyPolicy(policy: PrivacyRetentionPolicyV1): boolean {
  const next = {} as Record<PrivacyRetentionCategory, PrivacyRetentionPreset>
  for (const category of PRIVACY_RETENTION_CATEGORIES) {
    const preset = presetForRetention(policy.categories[category].retentionMs)
    if (!preset) return false
    next[category] = preset
  }
  selections.value = next
  return true
}

function stableErrorCode(error: unknown): PrivacyErrorCode {
  const candidate = error instanceof Error ? error.message : ''
  return (PRIVACY_ERROR_CODES as readonly string[]).includes(candidate)
    ? (candidate as PrivacyErrorCode)
    : 'PRIVACY_OPERATION_FAILED'
}

function setFailure(code: PrivacyErrorCode): void {
  resultStatus.value = t(`privacyData.errors.${code}`)
}

function setFeedback(key: string, params?: Record<string, number>): void {
  resultStatus.value = params ? t(key, params) : t(key)
}

function beginOperation(name: string): number | null {
  if (disposed || isPending.value) return null
  const revision = ++operationRevision
  pendingOperation.value = name
  return revision
}

function isCurrentOperation(revision: number, name: string): boolean {
  return !disposed && revision === operationRevision && pendingOperation.value === name
}

function finishOperation(revision: number, name: string): void {
  if (isCurrentOperation(revision, name)) pendingOperation.value = null
}

function invalidatePreviews(): void {
  cleanupPreview.value = null
  cleanupPreviewSelectionSignature.value = ''
  deletePreview.value = null
  deletePreviewSelectionSignature.value = ''
  if (deleteDialogVisible.value && pendingOperation.value !== 'category-delete') {
    closeDeleteDialog()
  }
}

async function refreshSummaries(revision: number, operation: string): Promise<boolean> {
  try {
    const result = await privacySdk.summary.get()
    if (!isCurrentOperation(revision, operation)) return false
    if (!result.ok || !hasExactSummaryCoverage(result.data.categories)) {
      setFeedback('privacyData.feedback.summaryRefreshFailed')
      return false
    }
    summaries.value = result.data.categories
    return true
  } catch {
    if (isCurrentOperation(revision, operation)) {
      setFeedback('privacyData.feedback.summaryRefreshFailed')
    }
    return false
  }
}

async function refreshSecretAvailability(revision: number, operation: string): Promise<boolean> {
  try {
    const result = await privacySdk.secret.backupPreview()
    if (!isCurrentOperation(revision, operation)) return false
    if (!result.ok) {
      setFeedback('privacyData.feedback.secretRefreshFailed')
      return false
    }
    portableEntryCount.value = result.data.portableEntryCount
    secretBackupAvailable.value = result.data.available
    return true
  } catch {
    if (isCurrentOperation(revision, operation)) {
      setFeedback('privacyData.feedback.secretRefreshFailed')
    }
    return false
  }
}

function clearBackupSecrets(): void {
  backupPassword.value = ''
  backupPasswordConfirmation.value = ''
}

function clearRestoreSecrets(): void {
  restorePassword.value = ''
  restorePlan.value = null
  restoreConflictPolicy.value = 'skip'
}

function clearAllSecrets(): void {
  clearBackupSecrets()
  clearRestoreSecrets()
}

function focusDialog(
  element: { value: HTMLElement | null },
  preferred?: { value: HTMLElement | null }
): void {
  void nextTick(() => focusModalDialog(element.value, preferred?.value ?? null))
}

function restoreDialogTriggerFocus(trigger: HTMLElement | null): void {
  void nextTick(() => {
    if (trigger?.isConnected) trigger.focus()
  })
}

function handleDeleteDialogKeydown(event: KeyboardEvent): void {
  handleModalDialogKeydown(event, deleteDialogElement.value, {
    close: () => closeDeleteDialog(),
    pending: pendingOperation.value === 'category-delete'
  })
}

function handleBackupDialogKeydown(event: KeyboardEvent): void {
  handleModalDialogKeydown(event, backupDialogElement.value, {
    close: () => closeBackupDialog(),
    pending: pendingOperation.value === 'secret-backup'
  })
}

function handleRestoreDialogKeydown(event: KeyboardEvent): void {
  handleModalDialogKeydown(event, restoreDialogElement.value, {
    close: () => closeRestoreDialog(),
    pending: pendingOperation.value?.startsWith('secret-restore') === true
  })
}

async function loadPrivacyData(): Promise<void> {
  const revision = ++loadRevision
  initialLoading.value = true
  loadFailed.value = false
  resultStatus.value = ''

  try {
    const [policyResult, summaryResult, disclosureResult, backupPreviewResult] = await Promise.all([
      privacySdk.policy.get(),
      privacySdk.summary.get(),
      privacySdk.provider.getDisclosure(),
      privacySdk.secret.backupPreview()
    ])
    if (disposed || revision !== loadRevision) return

    const failure = [policyResult, summaryResult, disclosureResult, backupPreviewResult].find(
      (result) => !result.ok
    )
    if (failure && !failure.ok) {
      loadFailed.value = true
      setFailure(failure.code)
      return
    }
    if (!policyResult.ok || !summaryResult.ok || !disclosureResult.ok || !backupPreviewResult.ok) {
      return
    }

    if (
      !applyPolicy(policyResult.data.policy) ||
      !hasExactSummaryCoverage(summaryResult.data.categories)
    ) {
      loadFailed.value = true
      setFailure('PRIVACY_REQUEST_INVALID')
      return
    }
    supportedPresets.value = policyResult.data.supportedPresets
    summaries.value = summaryResult.data.categories
    providers.value = disclosureResult.data.providers
    portableEntryCount.value = backupPreviewResult.data.portableEntryCount
    secretBackupAvailable.value = backupPreviewResult.data.available
  } catch (error) {
    if (disposed || revision !== loadRevision) return
    loadFailed.value = true
    setFailure(stableErrorCode(error))
  } finally {
    if (!disposed && revision === loadRevision) initialLoading.value = false
  }
}

async function reloadPolicy(revision: number, operation: string): Promise<void> {
  try {
    const result = await privacySdk.policy.get()
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    supportedPresets.value = result.data.supportedPresets
    if (!applyPolicy(result.data.policy)) setFailure('PRIVACY_REQUEST_INVALID')
  } catch (error) {
    if (isCurrentOperation(revision, operation)) setFailure(stableErrorCode(error))
  }
}

async function savePolicy(): Promise<void> {
  if (hasUnsupportedRetentionSelection.value) {
    setFailure('PRIVACY_POLICY_INVALID')
    return
  }
  const operation = 'policy'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const result = await privacySdk.policy.update({
      version: 1,
      selections: { ...selections.value }
    })
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      setFailure(result.code)
      await reloadPolicy(revision, operation)
      return
    }
    if (!applyPolicy(result.data.policy)) {
      setFailure('PRIVACY_REQUEST_INVALID')
      return
    }
    invalidatePreviews()
    const refreshed = await refreshSummaries(revision, operation)
    if (refreshed && isCurrentOperation(revision, operation)) {
      setFeedback('privacyData.feedback.policyUpdated')
    }
  } catch {
    if (!isCurrentOperation(revision, operation)) return
    invalidatePreviews()
    setFeedback('privacyData.feedback.outcomeUnknown')
    await reloadPolicy(revision, operation)
  } finally {
    finishOperation(revision, operation)
  }
}

async function previewCleanup(): Promise<void> {
  const categories = [...selectedRetentionCategories.value]
  if (categories.length === 0) return
  const operation = 'cleanup-preview'
  const revision = beginOperation(operation)
  if (revision === null) return
  cleanupPreview.value = null
  cleanupPreviewSelectionSignature.value = ''
  try {
    const result = await privacySdk.cleanup.preview(categories)
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    if (!hasExactImpactCoverage(result.data.categories, categories)) {
      setFailure('PRIVACY_REQUEST_INVALID')
      return
    }
    cleanupPreview.value = result.data
    cleanupPreviewSelectionSignature.value = categories.join('|')
  } catch (error) {
    if (isCurrentOperation(revision, operation)) setFailure(stableErrorCode(error))
  } finally {
    finishOperation(revision, operation)
  }
}

async function runCleanup(): Promise<void> {
  if (!hasFreshCleanupPreview.value) return
  const categories = [...selectedRetentionCategories.value]
  const operation = 'cleanup-run'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const result = await privacySdk.cleanup.run(categories)
    if (!isCurrentOperation(revision, operation)) return
    invalidatePreviews()
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    const refreshed = await refreshSummaries(revision, operation)
    if (refreshed && isCurrentOperation(revision, operation)) {
      setFeedback(
        result.data.partial
          ? 'privacyData.feedback.cleanupPartial'
          : 'privacyData.feedback.cleanupCompleted'
      )
    }
  } catch {
    if (isCurrentOperation(revision, operation)) {
      invalidatePreviews()
      setFeedback('privacyData.feedback.outcomeUnknown')
    }
  } finally {
    finishOperation(revision, operation)
  }
}

async function previewCategoryDelete(event?: MouseEvent): Promise<void> {
  const categories = [...selectedCategories.value]
  if (categories.length === 0) return
  deletePreviewTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const operation = 'category-delete-preview'
  const revision = beginOperation(operation)
  if (revision === null) return
  deletePreview.value = null
  deletePreviewSelectionSignature.value = ''
  try {
    const result = await privacySdk.category.previewDelete(categories)
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    if (!hasExactImpactCoverage(result.data.categories, categories)) {
      setFailure('PRIVACY_REQUEST_INVALID')
      return
    }
    deletePreview.value = result.data
    deletePreviewSelectionSignature.value = categories.join('|')
  } catch (error) {
    if (isCurrentOperation(revision, operation)) setFailure(stableErrorCode(error))
  } finally {
    finishOperation(revision, operation)
  }
}

async function exportCategories(): Promise<void> {
  const categories = [...selectedCategories.value]
  if (categories.length === 0) return
  const operation = 'category-export'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const result = await privacySdk.category.export(categories)
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    setFeedback(
      result.data.cancelled
        ? 'privacyData.feedback.exportCancelled'
        : 'privacyData.feedback.exportCompleted'
    )
  } catch (error) {
    if (isCurrentOperation(revision, operation)) setFailure(stableErrorCode(error))
  } finally {
    finishOperation(revision, operation)
  }
}

function openDeleteDialog(event: MouseEvent): void {
  if (!hasFreshDeletePreview.value || isPending.value || !deletePreview.value) return
  deleteDialogTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  deleteCategories.value = [...selectedCategories.value]
  deleteDialogImpacts.value = [...deletePreview.value.categories]
  deleteDialogBounded.value = deletePreview.value.bounded
  deleteDialogPreviewId.value = deletePreview.value.previewId
  deleteDialogVisible.value = true
  focusDialog(deleteDialogElement)
}

function closeDeleteDialog(allowPending = false): void {
  if (!allowPending && pendingOperation.value === 'category-delete') return
  deleteDialogVisible.value = false
  deleteCategories.value = []
  deleteDialogImpacts.value = []
  deleteDialogBounded.value = false
  deleteDialogPreviewId.value = ''
  const trigger = deleteDialogTrigger
  deleteDialogTrigger = null
  restoreDialogTriggerFocus(hasFreshDeletePreview.value ? trigger : deletePreviewTrigger)
}

async function deleteSelectedCategories(): Promise<void> {
  if (
    !hasFreshDeletePreview.value ||
    deleteCategories.value.length === 0 ||
    deleteCategories.value.join('|') !== selectedSignature.value ||
    deleteDialogPreviewId.value === '' ||
    deletePreview.value?.previewId !== deleteDialogPreviewId.value ||
    !hasExactImpactCoverage(deleteDialogImpacts.value, deleteCategories.value)
  ) {
    setFailure('PRIVACY_REQUEST_INVALID')
    closeDeleteDialog()
    return
  }
  const categories = [...deleteCategories.value]
  const previewId = deleteDialogPreviewId.value
  const operation = 'category-delete'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const result = await privacySdk.category.delete(categories, 'delete-selected-data', previewId)
    if (!isCurrentOperation(revision, operation)) return
    invalidatePreviews()
    if (!result.ok) {
      setFailure(result.code)
      finishOperation(revision, operation)
      closeDeleteDialog(true)
      return
    }
    const refreshed = await refreshSummaries(revision, operation)
    if (refreshed && isCurrentOperation(revision, operation)) {
      setFeedback(
        result.data.partial
          ? 'privacyData.feedback.deletePartial'
          : 'privacyData.feedback.deleteCompleted'
      )
    }
    finishOperation(revision, operation)
    closeDeleteDialog(true)
  } catch {
    if (!isCurrentOperation(revision, operation)) return
    invalidatePreviews()
    setFeedback('privacyData.feedback.outcomeUnknown')
    finishOperation(revision, operation)
    closeDeleteDialog(true)
  } finally {
    finishOperation(revision, operation)
  }
}

function openBackupDialog(event?: MouseEvent): void {
  if (isPending.value) return
  clearBackupSecrets()
  backupError.value = ''
  backupDialogTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  backupDialogVisible.value = true
  focusDialog(backupDialogElement, backupPasswordElement)
}

function closeBackupDialog(allowPending = false): void {
  if (!allowPending && pendingOperation.value === 'secret-backup') return
  clearBackupSecrets()
  backupError.value = ''
  backupDialogVisible.value = false
  const trigger = backupDialogTrigger
  backupDialogTrigger = null
  restoreDialogTriggerFocus(trigger)
}

async function writeSecretBackup(): Promise<void> {
  backupError.value = ''
  if (!isPrivacySecretPasswordValid(backupPassword.value)) {
    clearBackupSecrets()
    backupError.value = t('privacyData.secret.passwordMinimum')
    return
  }
  if (backupPassword.value !== backupPasswordConfirmation.value) {
    clearBackupSecrets()
    backupError.value = t('privacyData.secret.passwordMismatch')
    return
  }

  const operation = 'secret-backup'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const request = privacySdk.secret.backupWrite(backupPassword.value)
    clearBackupSecrets()
    const result = await request
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      backupError.value = t(`privacyData.errors.${result.code}`)
      setFailure(result.code)
      return
    }
    setFeedback(
      result.data.cancelled
        ? 'privacyData.feedback.backupCancelled'
        : 'privacyData.feedback.backupCompleted'
    )
    finishOperation(revision, operation)
    closeBackupDialog(true)
  } catch {
    clearBackupSecrets()
    if (!isCurrentOperation(revision, operation)) return
    backupError.value = t('privacyData.feedback.outcomeUnknown')
    setFeedback('privacyData.feedback.outcomeUnknown')
  } finally {
    clearBackupSecrets()
    finishOperation(revision, operation)
  }
}

function openRestoreDialog(event?: MouseEvent): void {
  if (isPending.value) return
  clearRestoreSecrets()
  restoreError.value = ''
  restoreDialogTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  restoreDialogVisible.value = true
  focusDialog(restoreDialogElement, restorePasswordElement)
}

function closeRestoreDialog(allowPending = false): void {
  if (!allowPending && pendingOperation.value?.startsWith('secret-restore')) return
  clearRestoreSecrets()
  restoreError.value = ''
  restoreDialogVisible.value = false
  const trigger = restoreDialogTrigger
  restoreDialogTrigger = null
  restoreDialogTriggerFocus(trigger)
}

async function previewSecretRestore(): Promise<void> {
  restoreError.value = ''
  restorePlan.value = null
  if (!isPrivacySecretPasswordValid(restorePassword.value)) {
    restorePassword.value = ''
    restoreError.value = t('privacyData.secret.passwordMinimum')
    return
  }

  const operation = 'secret-restore-preview'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const request = privacySdk.secret.restorePreview(restorePassword.value)
    restorePassword.value = ''
    const result = await request
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      clearRestoreSecrets()
      restoreError.value = t(`privacyData.errors.${result.code}`)
      setFailure(result.code)
      return
    }
    restorePlan.value = result.data
    void nextTick(() => restorePasswordElement.value?.focus())
  } catch (error) {
    clearRestoreSecrets()
    if (!isCurrentOperation(revision, operation)) return
    const code = stableErrorCode(error)
    restoreError.value = t(`privacyData.errors.${code}`)
    setFailure(code)
  } finally {
    restorePassword.value = ''
    finishOperation(revision, operation)
  }
}

async function applySecretRestore(): Promise<void> {
  if (!restorePlan.value) return
  restoreError.value = ''
  if (!isPrivacySecretPasswordValid(restorePassword.value)) {
    restorePassword.value = ''
    restoreError.value = t('privacyData.secret.passwordMinimum')
    return
  }
  const plan = restorePlan.value
  const conflictPolicy = restoreConflictPolicy.value
  const operation = 'secret-restore-apply'
  const revision = beginOperation(operation)
  if (revision === null) return
  try {
    const request = privacySdk.secret.restoreApply(
      plan.restoreId,
      restorePassword.value,
      conflictPolicy
    )
    clearRestoreSecrets()
    const result = await request
    if (!isCurrentOperation(revision, operation)) return
    if (!result.ok) {
      restoreError.value = t(`privacyData.errors.${result.code}`)
      setFailure(result.code)
      return
    }
    const refreshed = await refreshSecretAvailability(revision, operation)
    if (refreshed && isCurrentOperation(revision, operation)) {
      setFeedback('privacyData.feedback.restoreCompleted')
    }
    finishOperation(revision, operation)
    closeRestoreDialog(true)
  } catch {
    clearRestoreSecrets()
    if (!isCurrentOperation(revision, operation)) return
    restoreError.value = t('privacyData.feedback.outcomeUnknown')
    setFeedback('privacyData.feedback.outcomeUnknown')
  } finally {
    clearRestoreSecrets()
    finishOperation(revision, operation)
  }
}

watch(selectedCategories, invalidatePreviews, { deep: true })

watch(selections, invalidatePreviews, { deep: true })

onMounted(() => {
  void loadPrivacyData()
})

onBeforeUnmount(() => {
  disposed = true
  loadRevision += 1
  operationRevision += 1
  pendingOperation.value = null
  clearAllSecrets()
  deleteDialogTrigger = null
  deletePreviewTrigger = null
  backupDialogTrigger = null
  restoreDialogTrigger = null
})
</script>

<template>
  <section
    class="PrivacyDataSection"
    data-testid="privacy-data-section"
    :aria-busy="initialLoading || isPending"
  >
    <header class="PrivacyDataSection-Header">
      <div>
        <h2>{{ t('privacyData.title') }}</h2>
        <p>{{ t('privacyData.description') }}</p>
      </div>
      <TxButton
        v-if="loadFailed"
        data-testid="privacy-load-retry"
        native-type="button"
        :disabled="initialLoading"
        @click="loadPrivacyData"
        >{{ t('privacyData.retry') }}</TxButton
      >
    </header>

    <p
      v-if="initialLoading"
      class="PrivacyDataSection-Loading"
      data-testid="privacy-initial-loading"
      role="status"
      v-text="t('privacyData.loading')"
    />

    <template v-else-if="!loadFailed">
      <section class="PrivacyDataSection-Band">
        <h3>{{ t('privacyData.sections.summary') }}</h3>
        <div class="PrivacyDataSection-SummaryGrid">
          <div
            v-for="category in PRIVACY_SETTINGS_DATA_CATEGORIES"
            :key="category"
            class="PrivacyDataSection-SummaryRow"
            :data-testid="`privacy-summary-${category}`"
          >
            <strong>{{ t(`privacyData.categories.${category}`) }}</strong>
            <span>{{
              t('privacyData.summary.itemCount', { count: summaryFor(category)?.itemCount ?? 0 })
            }}</span>
            <span>{{
              t('privacyData.summary.byteCount', {
                size: formatBytesShort(summaryFor(category)?.byteCount ?? 0)
              })
            }}</span>
            <span>{{ lastCleanupLabel(category) }}</span>
          </div>
        </div>
      </section>

      <section class="PrivacyDataSection-Band">
        <h3>{{ t('privacyData.sections.retention') }}</h3>
        <div class="PrivacyDataSection-RetentionRows">
          <label
            v-for="category in PRIVACY_RETENTION_CATEGORIES"
            :key="category"
            class="PrivacyDataSection-RetentionRow"
          >
            <span>{{ t(`privacyData.categories.${category}`) }}</span>
            <select
              v-model="selections[category]"
              :data-testid="`privacy-retention-${category}`"
              :disabled="isPending"
            >
              <option
                v-for="preset in retentionOptions(category)"
                :key="preset"
                :value="preset"
                :disabled="!supportedPresets.includes(preset)"
                v-text="t(`privacyData.retention.presets.${preset}`)"
              />
            </select>
          </label>
        </div>
        <div class="PrivacyDataSection-Notes">
          <p>{{ t('privacyData.retention.clipboardProtected') }}</p>
          <p>{{ t('privacyData.retention.contextProtected') }}</p>
          <p>{{ t('privacyData.retention.memoryIndependent') }}</p>
        </div>
        <p
          v-if="hasUnsupportedRetentionSelection"
          class="PrivacyDataSection-Warning"
          role="status"
          v-text="t('privacyData.retention.unsupportedSelection')"
        />
        <TxButton
          data-testid="privacy-policy-save"
          native-type="button"
          :disabled="isPending || hasUnsupportedRetentionSelection"
          :loading="pendingOperation === 'policy'"
          @click="savePolicy"
          >{{ policySaveLabel }}</TxButton
        >
      </section>

      <section class="PrivacyDataSection-Band">
        <h3>{{ t('privacyData.sections.actions') }}</h3>
        <fieldset class="PrivacyDataSection-CategorySelection" :disabled="isPending">
          <legend>{{ t('privacyData.actions.selectCategories') }}</legend>
          <label v-for="category in PRIVACY_SETTINGS_DATA_CATEGORIES" :key="category">
            <input
              v-model="selectedCategories"
              type="checkbox"
              :value="category"
              :data-testid="`privacy-category-${category}`"
            />
            <span>{{ t(`privacyData.categories.${category}`) }}</span>
          </label>
        </fieldset>
        <div class="PrivacyDataSection-Actions">
          <TxButton
            data-testid="privacy-cleanup-preview"
            native-type="button"
            :disabled="isPending || selectedRetentionCategories.length === 0"
            @click="previewCleanup"
            >{{ t('privacyData.actions.previewCleanup') }}</TxButton
          >
          <TxButton
            data-testid="privacy-cleanup-run"
            native-type="button"
            :disabled="isPending || !hasFreshCleanupPreview"
            @click="runCleanup"
            >{{ t('privacyData.actions.runCleanup') }}</TxButton
          >
          <TxButton
            data-testid="privacy-category-export"
            native-type="button"
            :disabled="isPending || selectedCategories.length === 0"
            @click="exportCategories"
            >{{ t('privacyData.actions.export') }}</TxButton
          >
          <TxButton
            data-testid="privacy-category-delete-preview"
            native-type="button"
            type="danger"
            :disabled="isPending || selectedCategories.length === 0"
            @click="previewCategoryDelete"
            >{{ t('privacyData.actions.previewDelete') }}</TxButton
          >
          <TxButton
            data-testid="privacy-category-delete-open"
            native-type="button"
            type="danger"
            :disabled="isPending || !hasFreshDeletePreview"
            @click="openDeleteDialog"
            >{{ t('privacyData.actions.delete') }}</TxButton
          >
        </div>
        <div v-if="cleanupPreview" class="PrivacyDataSection-ImpactList">
          <strong>{{ t('privacyData.actions.cleanupImpactTitle') }}</strong>
          <p
            v-for="impact in cleanupPreview.categories"
            :key="impact.category"
            :data-testid="`privacy-cleanup-impact-${impact.category}`"
            v-text="cleanupImpactLabel(impact)"
          />
          <p
            v-if="cleanupPreview.bounded"
            class="PrivacyDataSection-Warning"
            v-text="t('privacyData.actions.previewBounded')"
          />
        </div>
        <div v-if="deletePreview" class="PrivacyDataSection-ImpactList">
          <strong>{{ t('privacyData.actions.deleteImpactTitle') }}</strong>
          <p
            v-for="impact in deletePreview.categories"
            :key="impact.category"
            :data-testid="`privacy-delete-impact-${impact.category}`"
            v-text="cleanupImpactLabel(impact)"
          />
          <p
            v-if="deletePreview.bounded"
            class="PrivacyDataSection-Warning"
            v-text="t('privacyData.actions.previewBounded')"
          />
        </div>
      </section>

      <section class="PrivacyDataSection-Band PrivacyDataSection-SecretGrid">
        <div>
          <h3>{{ t('privacyData.sections.secretBackup') }}</h3>
          <p data-testid="privacy-secret-backup-availability">{{ backupAvailabilityLabel }}</p>
          <TxButton
            data-testid="privacy-secret-backup-open"
            native-type="button"
            :disabled="isPending || !secretBackupAvailable"
            @click="openBackupDialog"
            >{{ t('privacyData.secret.backupOpen') }}</TxButton
          >
        </div>
        <div>
          <h3>{{ t('privacyData.sections.secretRestore') }}</h3>
          <TxButton
            data-testid="privacy-secret-restore-open"
            native-type="button"
            :disabled="isPending"
            @click="openRestoreDialog"
            >{{ t('privacyData.secret.restoreOpen') }}</TxButton
          >
        </div>
      </section>

      <section class="PrivacyDataSection-Band">
        <h3>{{ t('privacyData.sections.providers') }}</h3>
        <div class="PrivacyDataSection-ProviderList">
          <article
            v-for="provider in providers"
            :key="provider.providerId"
            class="PrivacyDataSection-Provider"
            :data-testid="`privacy-provider-${provider.providerId}`"
          >
            <header>
              <span>
                <strong>{{ provider.displayName }}</strong>
                <code>{{ provider.providerId }}</code>
              </span>
              <span>{{ t(`privacyData.providers.destination.${provider.destinationClass}`) }}</span>
            </header>
            <p>{{ providerPurposesLabel(provider) }}</p>
            <p>{{ providerDataCategoriesLabel(provider) }}</p>
            <p>{{ providerCapabilitiesLabel(provider) }}</p>
            <p>{{ providerRetentionLabel(provider) }}</p>
          </article>
        </div>
        <p>{{ t('privacyData.providers.externalRetentionLimitation') }}</p>
        <p>{{ t('privacyData.providers.disableAndClearGuidance') }}</p>
      </section>
    </template>

    <p data-testid="privacy-result-status" class="PrivacyDataSection-Status" aria-live="polite">
      {{ resultStatus }}
    </p>

    <div
      v-if="deleteDialogVisible"
      class="PrivacyDataSection-DialogBackdrop"
      role="presentation"
      @click.self="closeDeleteDialog()"
    >
      <section
        ref="deleteDialogElement"
        class="PrivacyDataSection-Dialog"
        data-testid="privacy-delete-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-delete-dialog-title"
        aria-describedby="privacy-delete-dialog-description"
        :aria-busy="pendingOperation === 'category-delete'"
        tabindex="-1"
        @keydown="handleDeleteDialogKeydown"
      >
        <h3 id="privacy-delete-dialog-title">{{ t('privacyData.actions.confirmDelete') }}</h3>
        <p
          id="privacy-delete-dialog-description"
          v-text="t('privacyData.actions.confirmDeleteDescription')"
        />
        <ul class="PrivacyDataSection-DialogImpact">
          <li v-for="impact in deleteDialogImpacts" :key="impact.category">
            {{ cleanupImpactLabel(impact) }}
          </li>
        </ul>
        <p
          v-if="deleteDialogBounded"
          class="PrivacyDataSection-Warning"
          v-text="t('privacyData.actions.previewBounded')"
        />
        <div class="PrivacyDataSection-DialogActions">
          <TxButton
            data-testid="privacy-delete-cancel"
            native-type="button"
            :disabled="pendingOperation === 'category-delete'"
            @click="closeDeleteDialog()"
          >
            {{ t('privacyData.actions.cancel') }}
          </TxButton>
          <TxButton
            data-testid="privacy-delete-confirm"
            native-type="button"
            type="danger"
            :disabled="pendingOperation === 'category-delete'"
            :loading="pendingOperation === 'category-delete'"
            @click="deleteSelectedCategories"
          >
            {{ t('privacyData.actions.delete') }}
          </TxButton>
        </div>
      </section>
    </div>

    <div
      v-if="backupDialogVisible"
      class="PrivacyDataSection-DialogBackdrop"
      role="presentation"
      @click.self="closeBackupDialog()"
    >
      <section
        ref="backupDialogElement"
        class="PrivacyDataSection-Dialog"
        data-testid="privacy-secret-backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-secret-backup-dialog-title"
        aria-describedby="privacy-secret-backup-dialog-description"
        :aria-busy="pendingOperation === 'secret-backup'"
        tabindex="-1"
        @keydown="handleBackupDialogKeydown"
      >
        <h3 id="privacy-secret-backup-dialog-title">
          {{ t('privacyData.sections.secretBackup') }}
        </h3>
        <p
          id="privacy-secret-backup-dialog-description"
          v-text="t('privacyData.secret.backupDescription')"
        />
        <label>
          <span>{{ t('privacyData.secret.password') }}</span>
          <input
            ref="backupPasswordElement"
            v-model="backupPassword"
            data-testid="privacy-secret-backup-password"
            type="password"
            autocomplete="new-password"
            :disabled="pendingOperation === 'secret-backup'"
          />
        </label>
        <label>
          <span>{{ t('privacyData.secret.passwordConfirmation') }}</span>
          <input
            v-model="backupPasswordConfirmation"
            data-testid="privacy-secret-backup-password-confirmation"
            type="password"
            autocomplete="new-password"
            :disabled="pendingOperation === 'secret-backup'"
          />
        </label>
        <p v-if="backupError" data-testid="privacy-secret-backup-error" role="alert">
          {{ backupError }}
        </p>
        <div class="PrivacyDataSection-DialogActions">
          <TxButton
            data-testid="privacy-secret-backup-cancel"
            native-type="button"
            :disabled="pendingOperation === 'secret-backup'"
            @click="closeBackupDialog()"
          >
            {{ t('privacyData.actions.cancel') }}
          </TxButton>
          <TxButton
            data-testid="privacy-secret-backup-submit"
            native-type="button"
            :disabled="pendingOperation === 'secret-backup'"
            :loading="pendingOperation === 'secret-backup'"
            @click="writeSecretBackup"
          >
            {{ t('privacyData.secret.backupSubmit') }}
          </TxButton>
        </div>
      </section>
    </div>

    <div
      v-if="restoreDialogVisible"
      class="PrivacyDataSection-DialogBackdrop"
      role="presentation"
      @click.self="closeRestoreDialog()"
    >
      <section
        ref="restoreDialogElement"
        class="PrivacyDataSection-Dialog"
        data-testid="privacy-secret-restore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-secret-restore-dialog-title"
        aria-describedby="privacy-secret-restore-dialog-description"
        :aria-busy="pendingOperation?.startsWith('secret-restore') === true"
        tabindex="-1"
        @keydown="handleRestoreDialogKeydown"
      >
        <h3 id="privacy-secret-restore-dialog-title">
          {{ t('privacyData.sections.secretRestore') }}
        </h3>
        <p
          id="privacy-secret-restore-dialog-description"
          v-text="t('privacyData.secret.restoreDescription')"
        />
        <label>
          <span>{{ t('privacyData.secret.password') }}</span>
          <input
            ref="restorePasswordElement"
            v-model="restorePassword"
            data-testid="privacy-secret-restore-password"
            type="password"
            autocomplete="current-password"
            :disabled="pendingOperation?.startsWith('secret-restore')"
          />
        </label>
        <p v-if="restoreError" data-testid="privacy-secret-restore-error" role="alert">
          {{ restoreError }}
        </p>
        <div v-if="restorePlan" data-testid="privacy-secret-restore-plan">
          <p>{{ t('privacyData.secret.totalEntries', { count: restorePlan.totalEntryCount }) }}</p>
          <p>
            {{ t('privacyData.secret.conflictingEntries', { count: restorePlan.conflictCount }) }}
          </p>
          <p>{{ t('privacyData.secret.newEntries', { count: restorePlan.newEntryCount }) }}</p>
          <label>
            <input
              v-model="restoreConflictPolicy"
              data-testid="privacy-secret-restore-conflict-skip"
              type="radio"
              value="skip"
              :disabled="pendingOperation === 'secret-restore-apply'"
            />
            <span>{{ t('privacyData.secret.conflictSkip') }}</span>
          </label>
          <label>
            <input
              v-model="restoreConflictPolicy"
              data-testid="privacy-secret-restore-conflict-overwrite"
              type="radio"
              value="overwrite"
              :disabled="pendingOperation === 'secret-restore-apply'"
            />
            <span>{{ t('privacyData.secret.conflictOverwrite') }}</span>
          </label>
        </div>
        <div class="PrivacyDataSection-DialogActions">
          <TxButton
            native-type="button"
            :disabled="pendingOperation?.startsWith('secret-restore')"
            @click="closeRestoreDialog()"
          >
            {{ t('privacyData.actions.cancel') }}
          </TxButton>
          <TxButton
            v-if="!restorePlan"
            data-testid="privacy-secret-restore-preview"
            native-type="button"
            :disabled="pendingOperation?.startsWith('secret-restore')"
            :loading="pendingOperation === 'secret-restore-preview'"
            @click="previewSecretRestore"
          >
            {{ t('privacyData.secret.restorePreview') }}
          </TxButton>
          <TxButton
            v-else
            data-testid="privacy-secret-restore-apply"
            native-type="button"
            :disabled="pendingOperation === 'secret-restore-apply'"
            :loading="pendingOperation === 'secret-restore-apply'"
            @click="applySecretRestore"
          >
            {{ t('privacyData.secret.restoreApply') }}
          </TxButton>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
.PrivacyDataSection {
  width: 100%;
  color: var(--tx-text-color-primary);
}

.PrivacyDataSection-Header,
.PrivacyDataSection-RetentionRow,
.PrivacyDataSection-Actions,
.PrivacyDataSection-DialogActions,
.PrivacyDataSection-Provider header {
  display: flex;
  align-items: center;
}

.PrivacyDataSection-Header {
  justify-content: space-between;
  gap: 16px;

  h2 {
    margin: 0;
    font-size: 18px;
  }

  p {
    margin: 4px 0 0;
    color: var(--tx-text-color-secondary);
    font-size: 13px;
  }
}

.PrivacyDataSection-Band {
  width: 100%;
  padding: 18px 0;
  border-top: 1px solid var(--tx-border-color);

  h3 {
    margin: 0 0 12px;
    font-size: 14px;
  }
}

.PrivacyDataSection-SummaryGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
  gap: 0 20px;
}

.PrivacyDataSection-SummaryRow,
.PrivacyDataSection-Provider {
  display: grid;
  gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color) 65%, transparent);
  font-size: 12px;

  span,
  p {
    color: var(--tx-text-color-secondary);
  }
}

.PrivacyDataSection-RetentionRows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: 8px 20px;
}

.PrivacyDataSection-RetentionRow {
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;

  select {
    min-width: 132px;
    padding: 6px 8px;
    border: 1px solid var(--tx-border-color);
    border-radius: 6px;
    background: var(--tx-bg-color);
    color: inherit;

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: 2px;
    }
  }
}

.PrivacyDataSection-Notes {
  margin: 12px 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;

  p {
    margin: 4px 0;
  }
}

.PrivacyDataSection-CategorySelection {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  font-size: 13px;

  legend {
    width: 100%;
    margin-bottom: 8px;
    font-weight: 600;
  }

  label {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    gap: 6px;
  }

  input:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 2px;
  }
}

.PrivacyDataSection-Actions,
.PrivacyDataSection-DialogActions {
  flex-wrap: wrap;
  gap: 8px;
}

.PrivacyDataSection-ImpactList,
.PrivacyDataSection-DialogImpact {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.PrivacyDataSection-ImpactList {
  margin-top: 12px;

  p {
    margin: 4px 0;
  }
}

.PrivacyDataSection-Warning {
  color: var(--tx-color-warning);
  font-size: 12px;
}

.PrivacyDataSection-DialogImpact {
  margin: 0;
  padding-left: 20px;
}

.PrivacyDataSection-SecretGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.PrivacyDataSection-ProviderList {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: 0 24px;
}

.PrivacyDataSection-Provider {
  header {
    justify-content: space-between;
    gap: 10px;

    > span:first-child {
      display: grid;
      min-width: 0;
      gap: 2px;
    }
  }

  code,
  p {
    overflow-wrap: anywhere;
  }

  code {
    color: var(--tx-text-color-secondary);
    font-size: 11px;
  }

  p {
    margin: 0;
  }
}

.PrivacyDataSection-Loading,
.PrivacyDataSection-Status {
  min-height: 20px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.PrivacyDataSection-DialogBackdrop {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.38);
}

.PrivacyDataSection-Dialog {
  box-sizing: border-box;
  width: min(480px, 100%);
  max-height: min(680px, calc(100vh - 40px));
  overflow: auto;
  padding: 18px;
  border: 1px solid var(--tx-border-color);
  border-radius: 6px;
  background: var(--tx-bg-color);
  box-shadow: var(--tx-box-shadow-dark);

  h3 {
    margin: 0 0 12px;
    font-size: 15px;
  }

  > p {
    margin: 0 0 12px;
    color: var(--tx-text-color-secondary);
    font-size: 13px;
  }

  label {
    display: grid;
    gap: 6px;
    margin: 10px 0;
    font-size: 13px;
  }

  input[type='password'] {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--tx-border-color);
    border-radius: 6px;
    background: var(--tx-fill-color-blank);
    color: inherit;
  }

  input:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 2px;
  }
}

.PrivacyDataSection-DialogActions {
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 720px) {
  .PrivacyDataSection-SecretGrid {
    grid-template-columns: 1fr;
  }

  .PrivacyDataSection-Header,
  .PrivacyDataSection-RetentionRow {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
