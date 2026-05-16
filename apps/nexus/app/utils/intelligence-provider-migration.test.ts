import { describe, expect, it } from 'vitest'
import { resolveMigrationReadiness } from './intelligence-provider-migration'

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
