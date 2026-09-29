import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const readArg = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const database = readArg('--database')
const backupPath = resolve(readArg('--backup') || `/tmp/${database || 'nexus'}-before-intelligence-config-drop.sql`)
const execute = args.includes('--execute')
const remote = !args.includes('--local')
const acknowledgement = process.env.NEXUS_LEGACY_PROVIDER_DROP_ACK

if (!database) {
  console.error('Usage: node scripts/drop-legacy-intelligence-providers.mjs --database <name> [--backup <path>] [--local] [--execute]')
  process.exit(2)
}

function runWrangler(commandArgs) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...commandArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'wrangler failed\n')
    process.exit(result.status || 1)
  }
  return result.stdout
}

const targetArgs = remote ? ['--remote'] : ['--local']
runWrangler(['d1', 'export', database, ...targetArgs, '--output', backupPath])
if (!existsSync(backupPath) || statSync(backupPath).size === 0) {
  console.error(`Backup was not created: ${backupPath}`)
  process.exit(1)
}

const preflightSql = `
SELECT
  (SELECT COUNT(*) FROM provider_registry) AS providers,
  (SELECT COUNT(*) FROM provider_registry WHERE status = 'enabled') AS enabled_providers,
  (SELECT COUNT(*) FROM scene_registry WHERE status = 'enabled') AS enabled_scenes,
  (SELECT COUNT(*)
     FROM provider_registry p
     LEFT JOIN provider_secure_store s
       ON s.auth_ref = p.auth_ref AND s.purpose = 'provider-credential'
    WHERE p.status = 'enabled' AND p.auth_type <> 'none' AND s.auth_ref IS NULL) AS missing_credentials,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'intelligence_providers') AS legacy_providers,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'intelligence_settings') AS legacy_settings;
`.trim()
const raw = runWrangler(['d1', 'execute', database, ...targetArgs, '--json', '--command', preflightSql])
const payload = JSON.parse(raw)
const row = payload?.[0]?.results?.[0]
if (!row) {
  console.error('Could not read cutover preflight state.')
  process.exit(1)
}

console.log(JSON.stringify({ backupPath, ...row }, null, 2))
if (Number(row.providers) < 1 || Number(row.enabled_providers) < 1 || Number(row.enabled_scenes) < 1) {
  console.error('Provider Registry and Scene are not ready for legacy-table removal.')
  process.exit(1)
}
if (Number(row.missing_credentials) !== 0) {
  console.error('At least one enabled credentialed provider has no secure-store credential.')
  process.exit(1)
}
if (Number(row.legacy_providers) === 0 && Number(row.legacy_settings) === 0) {
  console.log('Legacy provider and settings tables are already absent; nothing to drop.')
  process.exit(0)
}
if (!execute) {
  console.log('Preflight complete. Re-run with --execute and NEXUS_LEGACY_PROVIDER_DROP_ACK=DROP_intelligence_providers_and_settings.')
  process.exit(0)
}
if (acknowledgement !== 'DROP_intelligence_providers_and_settings') {
  console.error('Refusing destructive DDL without NEXUS_LEGACY_PROVIDER_DROP_ACK=DROP_intelligence_providers_and_settings.')
  process.exit(2)
}

runWrangler(['d1', 'execute', database, ...targetArgs, '--command', 'DROP TABLE IF EXISTS intelligence_providers; DROP TABLE IF EXISTS intelligence_settings;'])
const verifyRaw = runWrangler([
  'd1',
  'execute',
  database,
  ...targetArgs,
  '--json',
  '--command',
  "SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'intelligence_providers') AS legacy_providers, (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'intelligence_settings') AS legacy_settings;",
])
const verify = JSON.parse(verifyRaw)?.[0]?.results?.[0]
if (Number(verify?.legacy_providers) !== 0 || Number(verify?.legacy_settings) !== 0) {
  console.error('At least one legacy Intelligence configuration table still exists after DROP TABLE.')
  process.exit(1)
}
console.log(`Dropped intelligence_providers and intelligence_settings after verified backup: ${backupPath}`)
