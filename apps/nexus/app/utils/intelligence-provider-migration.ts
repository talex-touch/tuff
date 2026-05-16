export interface IntelligenceProviderMigrationReadinessInput {
  dryRun: boolean
  readyForRegistryPrimaryReads: boolean
  blockers?: string[] | null
  failed?: number
}

export type IntelligenceProviderMigrationReadinessStatus = 'ready' | 'blocked' | 'planning'
export type IntelligenceProviderMigrationReadinessTone = 'success' | 'warning' | 'danger'

export interface IntelligenceProviderMigrationReadiness {
  status: IntelligenceProviderMigrationReadinessStatus
  tone: IntelligenceProviderMigrationReadinessTone
  registryPrimaryReady: boolean
  blockers: string[]
}

function normalizeBlockers(blockers: string[] | null | undefined): string[] {
  const unique = new Set<string>()
  for (const blocker of blockers ?? []) {
    const normalized = typeof blocker === 'string' ? blocker.trim() : ''
    if (normalized)
      unique.add(normalized)
  }
  return [...unique]
}

export function resolveMigrationReadiness(
  input: IntelligenceProviderMigrationReadinessInput,
): IntelligenceProviderMigrationReadiness {
  const blockers = normalizeBlockers(input.blockers)

  if (input.dryRun) {
    return {
      status: 'planning',
      tone: 'warning',
      registryPrimaryReady: false,
      blockers: blockers.length ? blockers : ['migration_dry_run_only'],
    }
  }

  if (input.readyForRegistryPrimaryReads && blockers.length === 0 && (input.failed ?? 0) === 0) {
    return {
      status: 'ready',
      tone: 'success',
      registryPrimaryReady: true,
      blockers: [],
    }
  }

  return {
    status: 'blocked',
    tone: 'danger',
    registryPrimaryReady: false,
    blockers: blockers.length ? blockers : ['migration_not_executed'],
  }
}
