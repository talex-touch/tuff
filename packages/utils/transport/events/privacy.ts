import type {
  PrivacyCategoryDeletePreviewRequest,
  PrivacyCategoryDeletePreviewResult,
  PrivacyCategoryDeleteRequest,
  PrivacyCategoryDeleteResult,
  PrivacyCategoryExportRequest,
  PrivacyCategoryExportResult,
  PrivacyCleanupPreviewRequest,
  PrivacyCleanupPreviewResult,
  PrivacyCleanupRunRequest,
  PrivacyCleanupRunResult,
  PrivacyPolicyGetRequest,
  PrivacyPolicyGetResult,
  PrivacyPolicyUpdateRequest,
  PrivacyPolicyUpdateResult,
  PrivacyProviderDisclosureRequest,
  PrivacyProviderDisclosureResult,
  PrivacySecretBackupPreviewRequest,
  PrivacySecretBackupPreviewResult,
  PrivacySecretBackupWriteRequest,
  PrivacySecretBackupWriteResult,
  PrivacySecretRestoreApplyRequest,
  PrivacySecretRestoreApplyResult,
  PrivacySecretRestorePreviewRequest,
  PrivacySecretRestorePreviewResult,
  PrivacySummaryRequest,
  PrivacySummaryResult,
} from './types/privacy'
import { defineEvent } from '../event/builder'

export const PrivacyEvents = {
  policy: {
    get: defineEvent('privacy').module('policy').event('get').define<PrivacyPolicyGetRequest, PrivacyPolicyGetResult>(),
    update: defineEvent('privacy')
      .module('policy')
      .event('update')
      .define<PrivacyPolicyUpdateRequest, PrivacyPolicyUpdateResult>(),
  },
  summary: {
    get: defineEvent('privacy').module('summary').event('get').define<PrivacySummaryRequest, PrivacySummaryResult>(),
  },
  cleanup: {
    preview: defineEvent('privacy')
      .module('cleanup')
      .event('preview')
      .define<PrivacyCleanupPreviewRequest, PrivacyCleanupPreviewResult>(),
    run: defineEvent('privacy')
      .module('cleanup')
      .event('run')
      .define<PrivacyCleanupRunRequest, PrivacyCleanupRunResult>(),
  },
  category: {
    export: defineEvent('privacy')
      .module('category')
      .event('export')
      .define<PrivacyCategoryExportRequest, PrivacyCategoryExportResult>(),
    deletePreview: defineEvent('privacy')
      .module('category')
      .event('delete-preview')
      .define<PrivacyCategoryDeletePreviewRequest, PrivacyCategoryDeletePreviewResult>(),
    delete: defineEvent('privacy')
      .module('category')
      .event('delete')
      .define<PrivacyCategoryDeleteRequest, PrivacyCategoryDeleteResult>(),
  },
  provider: {
    disclosure: defineEvent('privacy')
      .module('provider')
      .event('disclosure')
      .define<PrivacyProviderDisclosureRequest, PrivacyProviderDisclosureResult>(),
  },
  secret: {
    backupPreview: defineEvent('privacy')
      .module('secret')
      .event('backup-preview')
      .define<PrivacySecretBackupPreviewRequest, PrivacySecretBackupPreviewResult>(),
    backupWrite: defineEvent('privacy')
      .module('secret')
      .event('backup-write')
      .define<PrivacySecretBackupWriteRequest, PrivacySecretBackupWriteResult>(),
    restorePreview: defineEvent('privacy')
      .module('secret')
      .event('restore-preview')
      .define<PrivacySecretRestorePreviewRequest, PrivacySecretRestorePreviewResult>(),
    restoreApply: defineEvent('privacy')
      .module('secret')
      .event('restore-apply')
      .define<PrivacySecretRestoreApplyRequest, PrivacySecretRestoreApplyResult>(),
  },
} as const
