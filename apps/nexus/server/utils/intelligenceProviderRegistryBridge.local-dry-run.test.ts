import { describe, expect, it } from 'vitest'
import { formatMigrationEvidenceSummary } from '../../app/utils/intelligence-provider-migration'
import { MockD1Database, makeProviderRegistryEvent, seedOpenAiIntelligenceProvider } from '../../test/helpers/provider-registry-test-utils'
import { migrateLegacyIntelligenceProvidersToRegistry } from './intelligenceProviderRegistryBridge'

function makeEvent(db: MockD1Database) {
  const event = makeProviderRegistryEvent()
  return {
    ...event,
    context: {
      ...event.context,
      cloudflare: {
        env: {
          DB: db,
          PROVIDER_REGISTRY_SECURE_STORE_KEY: 'local-test-secure-store-key',
        },
      },
    },
  } as any
}

describe('Provider Registry migration local dry-run evidence', () => {
  it('produces copyable evidence from the real migration bridge without writing registry or secrets', async () => {
    const db = new MockD1Database()
    seedOpenAiIntelligenceProvider(db)

    const result = await migrateLegacyIntelligenceProvidersToRegistry(
      makeEvent(db),
      'admin-user-1',
      'admin-user-1',
    )
    const summary = formatMigrationEvidenceSummary(result)

    expect(summary).toBe([
      '# Provider Registry migration evidence',
      '',
      'mode: dry-run',
      'readiness: planning',
      'registryPrimaryReady: no',
      'total: 1',
      'migrated: 0',
      'skipped: 0',
      'failed: 0',
      'blockers: migration_dry_run_only, migration_not_executed',
      '',
      'items:',
      '- OpenAI Main (ip_local_dry_run): would_create; secret=unchanged reason=legacy_api_key_would_move_to_secure_store',
    ].join('\n'))
    expect(summary).not.toContain('encrypted-local-secret-placeholder')
    expect(db.providers.size).toBe(0)
    expect(db.credentials.size).toBe(0)
  })
})
