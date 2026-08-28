import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { runOrchestratorPrivacyAcceptance } from './orchestrator-run-privacy-acceptance'
import { ORCHESTRATOR_PRIVACY_GATE_KEYS } from './orchestrator-run-privacy-gates'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../../resources/db/migrations/', import.meta.url)
)
const RETENTION_MIGRATION = '0041_ai_orchestrator_run_retention.sql'
const RETENTION_INDEX = 'idx_ai_orchestrator_runs_retention'

describe('orchestrator run packaged Privacy acceptance', () => {
  it('rejects the legacy same-name partial index migration after a positive control', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tuff privacy #%-'))
    try {
      const checks = await runOrchestratorPrivacyAcceptance({
        migrationsFolder: MIGRATIONS_FOLDER,
        temporaryRoot
      })
      expect(ORCHESTRATOR_PRIVACY_GATE_KEYS.every((key) => checks[key] === true)).toBe(true)

      const mutatedMigrations = path.join(temporaryRoot, 'mutated migrations')
      await cp(MIGRATIONS_FOLDER, mutatedMigrations, { recursive: true })
      const migrationPath = path.join(mutatedMigrations, RETENTION_MIGRATION)
      const migrationSql = await readFile(migrationPath, 'utf8')
      const weakenedMigration = migrationSql
        .replace(`DROP INDEX IF EXISTS \`${RETENTION_INDEX}\`;\n--> statement-breakpoint\n`, '')
        .replace(
          `CREATE INDEX \`${RETENTION_INDEX}\``,
          `CREATE INDEX IF NOT EXISTS \`${RETENTION_INDEX}\``
        )
      expect(weakenedMigration).not.toBe(migrationSql)
      expect(weakenedMigration).not.toContain('DROP INDEX IF EXISTS')
      expect(weakenedMigration).toContain(`CREATE INDEX IF NOT EXISTS \`${RETENTION_INDEX}\``)
      await writeFile(migrationPath, weakenedMigration, 'utf8')

      await expect(
        runOrchestratorPrivacyAcceptance({
          migrationsFolder: mutatedMigrations,
          temporaryRoot
        })
      ).rejects.toThrow('ORCHESTRATOR_PRIVACY_ACCEPTANCE_FAILED:MIGRATION_INDEX_SQL')
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
