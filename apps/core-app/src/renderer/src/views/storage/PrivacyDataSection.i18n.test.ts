import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PRIVACY_DATA_CATEGORIES,
  PRIVACY_ERROR_CODES,
  PRIVACY_RETENTION_PRESETS
} from '@talex-touch/utils/transport/events/types/privacy'
import { describe, expect, it } from 'vitest'

const componentPath = fileURLToPath(new URL('./PrivacyDataSection.vue', import.meta.url))
const enCatalogPath = fileURLToPath(new URL('../../modules/lang/en-US.json', import.meta.url))
const zhCatalogPath = fileURLToPath(new URL('../../modules/lang/zh-CN.json', import.meta.url))

function readCatalog(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function getLeafPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    getLeafPaths(child, prefix ? `${prefix}.${key}` : key)
  )
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, value)
}

const providerDataCategories = [
  'text',
  'clipboard',
  'image-ocr',
  'audio',
  'file-context',
  'usage-metadata'
] as const
const providerPurposes = [
  'text-processing',
  'translation',
  'vision-and-ocr',
  'speech-processing',
  'retrieval-and-context',
  'clipboard-processing',
  'other-configured-capability'
] as const

const requiredPrivacyKeys = [
  'privacyData.title',
  'privacyData.description',
  'privacyData.loading',
  'privacyData.retry',
  'privacyData.sections.summary',
  'privacyData.sections.retention',
  'privacyData.sections.actions',
  'privacyData.sections.secretBackup',
  'privacyData.sections.secretRestore',
  'privacyData.sections.providers',
  'privacyData.summary.itemCount',
  'privacyData.summary.byteCount',
  'privacyData.summary.lastCleanup',
  'privacyData.summary.neverCleaned',
  'privacyData.retention.save',
  'privacyData.retention.saving',
  'privacyData.retention.clipboardProtected',
  'privacyData.retention.contextProtected',
  'privacyData.retention.memoryIndependent',
  'privacyData.retention.unsupportedSelection',
  'privacyData.actions.selectCategories',
  'privacyData.actions.preview',
  'privacyData.actions.previewCleanup',
  'privacyData.actions.previewDelete',
  'privacyData.actions.runCleanup',
  'privacyData.actions.export',
  'privacyData.actions.delete',
  'privacyData.actions.cancel',
  'privacyData.actions.cleanupImpactTitle',
  'privacyData.actions.deleteImpactTitle',
  'privacyData.actions.confirmDelete',
  'privacyData.actions.confirmDeleteDescription',
  'privacyData.actions.previewBounded',
  'privacyData.actions.deleteImpact',
  'privacyData.feedback.policyUpdated',
  'privacyData.feedback.exportCompleted',
  'privacyData.feedback.exportCancelled',
  'privacyData.feedback.cleanupCompleted',
  'privacyData.feedback.cleanupPartial',
  'privacyData.feedback.deleteCompleted',
  'privacyData.feedback.deletePartial',
  'privacyData.feedback.backupCompleted',
  'privacyData.feedback.backupCancelled',
  'privacyData.feedback.restoreCompleted',
  'privacyData.feedback.summaryRefreshFailed',
  'privacyData.feedback.secretRefreshFailed',
  'privacyData.feedback.outcomeUnknown',
  'privacyData.secret.backupAvailable',
  'privacyData.secret.backupUnavailable',
  'privacyData.secret.backupOpen',
  'privacyData.secret.backupDescription',
  'privacyData.secret.backupSubmit',
  'privacyData.secret.restoreOpen',
  'privacyData.secret.restoreDescription',
  'privacyData.secret.restorePreview',
  'privacyData.secret.restoreApply',
  'privacyData.secret.password',
  'privacyData.secret.passwordConfirmation',
  'privacyData.secret.passwordMinimum',
  'privacyData.secret.passwordMismatch',
  'privacyData.secret.totalEntries',
  'privacyData.secret.conflictingEntries',
  'privacyData.secret.newEntries',
  'privacyData.secret.conflictSkip',
  'privacyData.secret.conflictOverwrite',
  'privacyData.providers.destination.local',
  'privacyData.providers.destination.remote',
  'privacyData.providers.destination.nexus-managed',
  'privacyData.providers.purposes',
  'privacyData.providers.dataCategories',
  'privacyData.providers.capabilities',
  'privacyData.providers.localRetention',
  'privacyData.providers.externalRetentionLimitation',
  'privacyData.providers.disableAndClearGuidance',
  ...PRIVACY_DATA_CATEGORIES.map((category) => `privacyData.categories.${category}`),
  ...PRIVACY_RETENTION_PRESETS.map((preset) => `privacyData.retention.presets.${preset}`),
  ...PRIVACY_ERROR_CODES.map((code) => `privacyData.errors.${code}`),
  ...providerDataCategories.map((category) => `privacyData.providers.dataCategory.${category}`),
  ...providerPurposes.map((purpose) => `privacyData.providers.purpose.${purpose}`)
]

const requiredPluginUninstallKeys = [
  'plugin.uninstall.dataDispositionTitle',
  'plugin.uninstall.dataDispositionDescription',
  'plugin.uninstall.ordinaryExportLabel',
  'plugin.uninstall.ordinaryExportDescription',
  'plugin.uninstall.secretBackupLabel',
  'plugin.uninstall.secretBackupDescription',
  'plugin.uninstall.passwordLabel',
  'plugin.uninstall.passwordConfirmationLabel',
  'plugin.uninstall.passwordMinimum',
  'plugin.uninstall.passwordMismatch',
  'plugin.uninstall.finalImpactLabel',
  'plugin.uninstall.finalImpactDescription',
  'plugin.uninstall.pending',
  'plugin.uninstall.cancelled',
  'plugin.uninstall.retryableFailure',
  'plugin.uninstall.terminalFailure',
  'plugin.uninstall.identityUnavailable',
  'plugin.uninstall.alreadyRemoved'
]

describe('Privacy & Data message catalog and source contracts', () => {
  it('keeps every Privacy and plugin-uninstall key present and aligned in en-US and zh-CN', () => {
    const en = readCatalog(enCatalogPath)
    const zh = readCatalog(zhCatalogPath)
    const enPrivacyKeys = getLeafPaths(getPath(en, 'privacyData'), 'privacyData').sort()
    const zhPrivacyKeys = getLeafPaths(getPath(zh, 'privacyData'), 'privacyData').sort()
    const enPluginKeys = getLeafPaths(getPath(en, 'plugin.uninstall'), 'plugin.uninstall').sort()
    const zhPluginKeys = getLeafPaths(getPath(zh, 'plugin.uninstall'), 'plugin.uninstall').sort()

    expect(enPrivacyKeys).toEqual(zhPrivacyKeys)
    expect(enPluginKeys).toEqual(zhPluginKeys)

    for (const key of [...requiredPrivacyKeys, ...requiredPluginUninstallKeys]) {
      expect(getPath(en, key), `missing en-US message: ${key}`).toEqual(expect.any(String))
      expect(getPath(zh, key), `missing zh-CN message: ${key}`).toEqual(expect.any(String))
    }
  })

  it('uses only the typed Privacy domain SDK and carries no renderer-owned authority fields', () => {
    expect(existsSync(componentPath), 'PrivacyDataSection.vue must be page-owned').toBe(true)
    if (!existsSync(componentPath)) return

    const source = readFileSync(componentPath, 'utf8')
    expect(source).toMatch(/createPrivacySdk\s*\(/)
    expect(source).toMatch(/useTuffTransport\s*\(/)
    expect(source).not.toMatch(/defineRawEvent|PrivacyEvents|\.send\s*\(/)
    expect(source).not.toMatch(
      /\b(?:filePath|tableName|sql|secretKey|secretPrefix|providerEndpoint)\s*:/i
    )
    expect(source).not.toMatch(/window\.\$(?:t|i18n)|localStorage|sessionStorage/)
  })

  it('contains no hardcoded user-visible text in the PrivacyDataSection template', () => {
    expect(existsSync(componentPath), 'PrivacyDataSection.vue must be page-owned').toBe(true)
    if (!existsSync(componentPath)) return

    const source = readFileSync(componentPath, 'utf8')
    const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ''
    const withoutComments = template.replace(/<!--[\s\S]*?-->/g, '')
    const staticText = [...withoutComments.matchAll(/>([^<{][^<]*)</g)]
      .map((match) => match[1].trim())
      .filter((text) => /[A-Za-z\u3400-\u9fff]/.test(text))
    const staticAccessibleAttributes = [
      ...withoutComments.matchAll(
        /(?:^|\s)(?:title|placeholder|aria-label|aria-description|alt)="([^"{]*[A-Za-z\u3400-\u9fff][^"]*)"/gm
      )
    ].map((match) => match[1])

    expect(staticText).toEqual([])
    expect(staticAccessibleAttributes).toEqual([])
  })
})
