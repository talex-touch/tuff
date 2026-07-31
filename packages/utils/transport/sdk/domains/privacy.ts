import type {
  PrivacyCategoryDeletePreviewResult,
  PrivacyCategoryDeleteResult,
  PrivacyCategoryExportResult,
  PrivacyCleanupPreviewResult,
  PrivacyCleanupRunResult,
  PrivacyDataCategory,
  PrivacyPolicyGetResult,
  PrivacyPolicyUpdateResult,
  PrivacyProviderDisclosureResult,
  PrivacyRetentionCategory,
  PrivacyRetentionSelectionV1,
  PrivacySecretBackupPreviewResult,
  PrivacySecretBackupWriteResult,
  PrivacySecretRestoreApplyResult,
  PrivacySecretRestoreConflictPolicy,
  PrivacySecretRestorePreviewResult,
  PrivacySummaryResult,
} from '../../events/types/privacy'
import type { ITuffTransport } from '../../types'
import { PrivacyEvents } from '../../events/privacy'
import { normalizePrivacyRequest, normalizePrivacyResult } from '../../events/types/privacy'

export interface PrivacySdk {
  readonly policy: {
    get: () => Promise<PrivacyPolicyGetResult>
    update: (policy: PrivacyRetentionSelectionV1) => Promise<PrivacyPolicyUpdateResult>
  }
  readonly summary: {
    get: (categories?: readonly PrivacyDataCategory[]) => Promise<PrivacySummaryResult>
  }
  readonly cleanup: {
    preview: (categories: readonly PrivacyRetentionCategory[]) => Promise<PrivacyCleanupPreviewResult>
    run: (categories: readonly PrivacyRetentionCategory[]) => Promise<PrivacyCleanupRunResult>
  }
  readonly category: {
    export: (categories: readonly PrivacyDataCategory[]) => Promise<PrivacyCategoryExportResult>
    previewDelete: (categories: readonly PrivacyDataCategory[]) => Promise<PrivacyCategoryDeletePreviewResult>
    delete: (
      categories: readonly PrivacyDataCategory[],
      confirmation: 'delete-selected-data',
      previewId: string,
    ) => Promise<PrivacyCategoryDeleteResult>
  }
  readonly provider: {
    getDisclosure: () => Promise<PrivacyProviderDisclosureResult>
  }
  readonly secret: {
    backupPreview: () => Promise<PrivacySecretBackupPreviewResult>
    backupWrite: (password: string) => Promise<PrivacySecretBackupWriteResult>
    restorePreview: (password: string) => Promise<PrivacySecretRestorePreviewResult>
    restoreApply: (
      restoreId: string,
      password: string,
      conflictPolicy: PrivacySecretRestoreConflictPolicy,
    ) => Promise<PrivacySecretRestoreApplyResult>
  }
}

export function createPrivacySdk(transport: ITuffTransport): PrivacySdk {
  return {
    policy: {
      get: async () =>
        normalizePrivacyResult(
          'policy.get',
          await transport.send(PrivacyEvents.policy.get, normalizePrivacyRequest({ operation: 'policy.get' })),
        ),
      update: async policy =>
        normalizePrivacyResult(
          'policy.update',
          await transport.send(
            PrivacyEvents.policy.update,
            normalizePrivacyRequest({ operation: 'policy.update', policy }),
          ),
        ),
    },
    summary: {
      get: async categories =>
        normalizePrivacyResult(
          'summary.get',
          await transport.send(
            PrivacyEvents.summary.get,
            normalizePrivacyRequest({
              operation: 'summary.get',
              ...(categories === undefined ? {} : { categories }),
            }),
          ),
        ),
    },
    cleanup: {
      preview: async categories =>
        normalizePrivacyResult(
          'cleanup.preview',
          await transport.send(
            PrivacyEvents.cleanup.preview,
            normalizePrivacyRequest({ operation: 'cleanup.preview', categories }),
          ),
        ),
      run: async categories =>
        normalizePrivacyResult(
          'cleanup.run',
          await transport.send(
            PrivacyEvents.cleanup.run,
            normalizePrivacyRequest({ operation: 'cleanup.run', categories }),
          ),
        ),
    },
    category: {
      export: async categories =>
        normalizePrivacyResult(
          'category.export',
          await transport.send(
            PrivacyEvents.category.export,
            normalizePrivacyRequest({ operation: 'category.export', categories }),
          ),
        ),
      previewDelete: async categories =>
        normalizePrivacyResult(
          'category.delete-preview',
          await transport.send(
            PrivacyEvents.category.deletePreview,
            normalizePrivacyRequest({ operation: 'category.delete-preview', categories }),
          ),
        ),
      delete: async (categories, confirmation, previewId) =>
        normalizePrivacyResult(
          'category.delete',
          await transport.send(
            PrivacyEvents.category.delete,
            normalizePrivacyRequest({
              operation: 'category.delete',
              categories,
              confirmation,
              previewId,
            }),
          ),
        ),
    },
    provider: {
      getDisclosure: async () =>
        normalizePrivacyResult(
          'provider-disclosure.get',
          await transport.send(
            PrivacyEvents.provider.disclosure,
            normalizePrivacyRequest({ operation: 'provider-disclosure.get' }),
          ),
        ),
    },
    secret: {
      backupPreview: async () =>
        normalizePrivacyResult(
          'secret-backup.preview',
          await transport.send(
            PrivacyEvents.secret.backupPreview,
            normalizePrivacyRequest({ operation: 'secret-backup.preview' }),
          ),
        ),
      backupWrite: async password =>
        normalizePrivacyResult(
          'secret-backup.write',
          await transport.send(
            PrivacyEvents.secret.backupWrite,
            normalizePrivacyRequest({ operation: 'secret-backup.write', password }),
          ),
        ),
      restorePreview: async password =>
        normalizePrivacyResult(
          'secret-restore.preview',
          await transport.send(
            PrivacyEvents.secret.restorePreview,
            normalizePrivacyRequest({ operation: 'secret-restore.preview', password }),
          ),
        ),
      restoreApply: async (restoreId, password, conflictPolicy) =>
        normalizePrivacyResult(
          'secret-restore.apply',
          await transport.send(
            PrivacyEvents.secret.restoreApply,
            normalizePrivacyRequest({
              operation: 'secret-restore.apply',
              restoreId,
              password,
              conflictPolicy,
            }),
          ),
        ),
    },
  }
}

export type {
  PrivacyDataCategory,
  PrivacyRetentionCategory,
  PrivacyRetentionSelectionV1,
  PrivacySecretRestoreConflictPolicy,
} from '../../events/types/privacy'
