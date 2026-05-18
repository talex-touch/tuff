import { describe, expect, it } from 'vitest'
import { formatMigrationEvidenceSummary, resolveMigrationReadiness } from './intelligence-provider-migration'

describe('resolveMigrationReadiness', () => {
  it('keeps dry-run migration in planning state', () => {
    expect(resolveMigrationReadiness({
      dryRun: true,
      readyForRegistryPrimaryReads: false,
      blockers: ['migration_dry_run_only', 'migration_not_executed'],
      failed: 0,
    })).toEqual({
      status: 'planning',
      tone: 'warning',
      registryPrimaryReady: false,
      blockers: ['migration_dry_run_only', 'migration_not_executed'],
    })
  })

  it('marks executed migration ready only when registry reads are safe', () => {
    expect(resolveMigrationReadiness({
      dryRun: false,
      readyForRegistryPrimaryReads: true,
      blockers: [],
      failed: 0,
    })).toEqual({
      status: 'ready',
      tone: 'success',
      registryPrimaryReady: true,
      blockers: [],
    })
  })

  it('blocks executed migration when failures or blockers remain', () => {
    expect(resolveMigrationReadiness({
      dryRun: false,
      readyForRegistryPrimaryReads: false,
      blockers: ['migration_failed', 'registry_mirror_missing', 'migration_failed'],
      failed: 1,
    })).toEqual({
      status: 'blocked',
      tone: 'danger',
      registryPrimaryReady: false,
      blockers: ['migration_failed', 'registry_mirror_missing'],
    })
  })
})

describe('formatMigrationEvidenceSummary', () => {
  it('formats dry-run migration evidence without claiming registry-primary readiness', () => {
    expect(formatMigrationEvidenceSummary({
      dryRun: true,
      readyForRegistryPrimaryReads: false,
      blockers: ['migration_dry_run_only'],
      total: 1,
      migrated: 0,
      skipped: 1,
      failed: 0,
      items: [{
        providerId: 'legacy-a',
        providerName: 'Legacy A',
        action: 'mirror',
        registryProviderId: 'registry-a',
        migratedApiKey: false,
        reason: null,
      }],
    })).toBe([
      '# Provider Registry migration evidence',
      '',
      'mode: dry-run',
      'readiness: planning',
      'registryPrimaryReady: no',
      'total: 1',
      'migrated: 0',
      'skipped: 1',
      'failed: 0',
      'blockers: migration_dry_run_only',
      '',
      'items:',
      '- Legacy A (legacy-a): mirror -> registry-a; secret=unchanged',
    ].join('\n'))
  })

  it('formats ready execute evidence with secret migration state', () => {
    expect(formatMigrationEvidenceSummary({
      dryRun: false,
      readyForRegistryPrimaryReads: true,
      blockers: [],
      total: 1,
      migrated: 1,
      skipped: 0,
      failed: 0,
      items: [{
        providerId: 'legacy-a',
        providerName: 'Legacy A',
        action: 'migrated',
        registryProviderId: 'registry-a',
        migratedApiKey: true,
        reason: null,
      }],
    })).toContain('readiness: ready\nregistryPrimaryReady: yes')
  })

  it('keeps failed item reasons in copied evidence', () => {
    expect(formatMigrationEvidenceSummary({
      dryRun: false,
      readyForRegistryPrimaryReads: false,
      blockers: ['migration_failed'],
      total: 1,
      migrated: 0,
      skipped: 0,
      failed: 1,
      items: [{
        providerId: 'legacy-a',
        providerName: 'Legacy A',
        action: 'failed',
        registryProviderId: null,
        migratedApiKey: false,
        reason: 'decrypt_failed',
      }],
    })).toContain('- Legacy A (legacy-a): failed; secret=unchanged reason=decrypt_failed')
  })
})
