import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const appRoot = join(currentDir, '..')
const apiRoot = join(appRoot, 'server/api')

const forbiddenFilePatterns = [
  /(?:^|\/)__tests__(?:\/|$)/,
  /\.test\.ts$/,
  /\.api\.test\.ts$/,
  /(?:^|\/)test-utils\.ts$/,
]

const forbiddenRoutePrefixes = [
  'admin/emergency/',
  'admin/oob/',
  'admin/risk/',
  'admin/audits/',
  'admin/release-evidence/',
  'admin/doc-comments/',
  'admin/telemetry/ip-blocks',
  'admin/analytics',
  'admin/credits/',
  'admin/codes/',
  'admin/subscriptions/',
  'dashboard/governance/',
  'dashboard/intelligence/',
  'dashboard/provider-registry/',
  'dashboard/oauth/',
  'dashboard/notifications/',
  'dashboard/storage/',
  'dashboard/team',
  'dashboard/privacy-export-jobs/',
  'dashboard/account-deletion/',
  'dashboard/telemetry/',
  'dashboard/updates/fx-rate/',
  'team/',
  'credits/',
  'codes/',
  'subscriptions/',
  'subscription/',
  'quotas/',
  'v1/quotas/',
  'v1/sync/',
  'v1/keys/',
  'v1/devices/attest',
  'sync/',
  'keys/',
  'devices/attest',
  'storage/',
  'notifications/',
  'docs/',
  'content/',
  'notes/',
  'oauth/',
  'telemetry/messages',
  'pageview',
  'login-history',
]

const forbiddenRoutePatterns = [
  /^admin\/users\/[^/]+\/(?:credits|subscription)\./,
]

function walkFiles(dir) {
  if (!existsSync(dir))
    return []

  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (stats.isFile())
      files.push(fullPath)
  }
  return files
}

const files = walkFiles(apiRoot).map(file => relative(apiRoot, file).replace(/\\/g, '/')).sort()
const forbiddenFiles = files.filter(file => forbiddenFilePatterns.some(pattern => pattern.test(file)))
const forbiddenRoutes = files.filter(file =>
  forbiddenRoutePrefixes.some(prefix => file.startsWith(prefix))
  || forbiddenRoutePatterns.some(pattern => pattern.test(file)),
)

if (forbiddenFiles.length > 0 || forbiddenRoutes.length > 0) {
  if (forbiddenFiles.length) {
    console.error('[nexus-api] Test/dev files found under server/api:')
    for (const file of forbiddenFiles)
      console.error(`  ${file}`)
  }
  if (forbiddenRoutes.length) {
    console.error('[nexus-api] Forbidden retired routes found under server/api:')
    for (const file of forbiddenRoutes)
      console.error(`  ${file}`)
  }
  process.exit(1)
}

console.log(`[nexus-api] Verified ${files.length} API routes — 0 test files, 0 forbidden routes.`)
