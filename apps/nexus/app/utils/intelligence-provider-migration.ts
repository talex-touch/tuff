export interface IntelligenceProviderMigrationReadinessInput {
  dryRun: boolean
  readyForRegistryPrimaryReads: boolean
  blockers?: string[] | null
  failed?: number
}

export interface IntelligenceProviderMigrationEvidenceItem {
  providerId: string
  providerName: string
  action: string
  registryProviderId: string | null
  migratedApiKey: boolean
  reason: string | null
}

export interface IntelligenceProviderMigrationEvidenceInput extends IntelligenceProviderMigrationReadinessInput {
  total: number
  migrated: number
  skipped: number
  items: IntelligenceProviderMigrationEvidenceItem[]
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

export function formatMigrationEvidenceSummary(input: IntelligenceProviderMigrationEvidenceInput): string {
  const readiness = resolveMigrationReadiness(input)
  const lines = [
    '# Provider Registry migration evidence',
    '',
    `mode: ${input.dryRun ? 'dry-run' : 'execute'}`,
    `readiness: ${readiness.status}`,
    `registryPrimaryReady: ${readiness.registryPrimaryReady ? 'yes' : 'no'}`,
    `total: ${input.total}`,
    `migrated: ${input.migrated}`,
    `skipped: ${input.skipped}`,
    `failed: ${input.failed ?? 0}`,
    `blockers: ${readiness.blockers.length ? readiness.blockers.join(', ') : 'none'}`,
    '',
    'items:',
  ]

  for (const item of input.items) {
    const registry = item.registryProviderId ? ` -> ${item.registryProviderId}` : ''
    const keyState = item.migratedApiKey ? 'secret=migrated' : 'secret=unchanged'
    const reason = item.reason ? ` reason=${item.reason}` : ''
    lines.push(`- ${item.providerName} (${item.providerId}): ${item.action}${registry}; ${keyState}${reason}`)
  }

  if (!input.items.length)
    lines.push('- none')

  return lines.join('\n')
}
