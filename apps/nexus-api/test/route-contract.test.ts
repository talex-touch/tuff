import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiRoot = join(appRoot, 'server/api')
const serverRoot = join(appRoot, 'server')

function walkFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      files.push(...walkFiles(full))
    else if (st.isFile())
      files.push(full)
  }
  return files
}

describe('nexus-api route & architecture contract guard', () => {
  const apiRoutes = walkFiles(apiRoot).map(f => relative(apiRoot, f).replace(/\\/g, '/')).sort()

  it('has zero forbidden governance, checkin, runtime docs, oauth-idp, or ip-ban routes', () => {
    const forbiddenPrefixes = [
      'admin/emergency/',
      'admin/oob/',
      'admin/risk/',
      'admin/audits/',
      'admin/release-evidence/',
      'admin/doc-comments/',
      'admin/telemetry/ip-blocks',
      'admin/analytics',
      'dashboard/governance/',
      'dashboard/intelligence/',
      'dashboard/provider-registry/',
      'dashboard/oauth/',
      'dashboard/notifications/',
      'dashboard/storage/alerts/',
      'dashboard/storage/channels/',
      'dashboard/storage/credentials',
      'dashboard/storage/policies',
      'dashboard/storage/details',
      'dashboard/storage/status',
      'dashboard/privacy-export-jobs/',
      'dashboard/account-deletion/',
      'dashboard/telemetry/',
      'dashboard/updates/fx-rate/',
      'credits/checkin',
      'docs/',
      'content/',
      'notes/',
      'oauth/',
      'telemetry/messages',
      'pageview',
      'login-history',
    ]

    const offending = apiRoutes.filter(route =>
      forbiddenPrefixes.some(prefix => route.startsWith(prefix))
      || /\.test\.ts$/.test(route)
      || /(?:^|\/)__tests__(?:\/|$)/.test(route),
    )

    expect(offending).toEqual([])
  })

  it('exposes all critical CI, core-app, console, and Module A/B/C/D routes', () => {
    const requiredRoutes = [
      // Clean H3 Auth & Device Flow
      'auth/session.get.ts',
      'auth/csrf.get.ts',
      'auth/providers.get.ts',
      'auth/signout.post.ts',
      'auth/signin/credentials.post.ts',
      'auth/signin/github.get.ts',
      'auth/callback/github.get.ts',
      'auth/signin/linuxdo.get.ts',
      'auth/callback/linuxdo.get.ts',
      'auth/signin/email.post.ts',
      'auth/callback/email.get.ts',
      'auth/me.get.ts',
      'app-auth/device/start.post.ts',
      'app-auth/device/poll.get.ts',
      'app-auth/device/approve.post.ts',
      'app-auth/refresh.post.ts',
      'passkeys/options.get.ts',
      'passkeys/verify.post.ts',
      'passkeys/register-options.post.ts',
      'passkeys/register-verify.post.ts',
      // CI Releases & Updates
      'releases/index.get.ts',
      'releases/index.post.ts',
      'releases/latest.get.ts',
      'releases/signing-key.get.ts',
      'releases/[tag]/publish.post.ts',
      'releases/[tag]/assets.post.ts',
      'releases/[tag]/link-github.post.ts',
      'releases/[tag]/download/[platform]/[arch].get.ts',
      'releases/[tag]/signature/[platform]/[arch].get.ts',
      'updates.get.ts',
      'updates/index.post.ts',
      'updates/[id]/payload.get.ts',
      'dashboard/updates.post.ts',
      // Store & Publishing
      'store/search.get.ts',
      'store/plugins.get.ts',
      'store/plugins/[slug]/download.get.ts',
      'dashboard/auth/publisher.get.ts',
      'dashboard/plugins.get.ts',
      'dashboard/plugin-signing-keys.get.ts',
      'plugins/assets/[key].get.ts',
      // Tier 2 v1
      'v1/sync/handshake.post.ts',
      'v1/ai/audio/handoff/[requestId].get.ts',
      'v1/scenes/[id]/run.post.ts',
      // Module A: Exchange & Unified AI Gateway Admin
      'exchange/latest.get.ts',
      'exchange/convert.get.ts',
      'exchange/history.get.ts',
      'admin/exchange/refresh.post.ts',
      'admin/ai/providers/index.get.ts',
      'admin/ai/providers/index.post.ts',
      'admin/ai/providers/[id].patch.ts',
      'admin/ai/providers/[id].delete.ts',
      'admin/ai/providers/[id]/check.post.ts',
      'admin/ai/scenes/index.get.ts',
      'admin/ai/scenes/index.put.ts',
      'admin/ai/scenes/[id].put.ts',
      'admin/ai/scenes/[id].delete.ts',
      'admin/ai/usage.get.ts',
      // Module B: Slim Notifications + Sync Storage
      'notifications/index.get.ts',
      'notifications/read.post.ts',
      'notifications/push.get.ts',
      'notifications/push.post.ts',
      'notifications/push/[id].delete.ts',
      'dashboard/storage/index.get.ts',
      'dashboard/storage/sessions.get.ts',
      // Module C: Privacy & Single-step Deletion / Sync Export
      'user/me.delete.ts',
      'user/me/export.get.ts',
      'dashboard/api-keys.get.ts',
      'dashboard/privacy-settings.get.ts',
      'dashboard/security-settings.get.ts',
      // Module D: Minimal Telemetry + Boss Usage Analytics
      'telemetry/ingest.post.ts',
      'telemetry/record.post.ts',
      'telemetry/batch.post.ts',
      'admin/usage.get.ts',
    ]

    const missing = requiredRoutes.filter(route => !apiRoutes.includes(route))
    expect(missing).toEqual([])
  })

  it('has zero Nuxt, Vue, @nuxt/content, or @sidebase/nuxt-auth dependencies or server imports', () => {
    const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'))
    const allDepNames = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ]
    const forbiddenDeps = ['nuxt', 'vue', '@nuxt/content', '@sidebase/nuxt-auth', 'next-auth', 'pinia']
    expect(allDepNames.filter(dep => forbiddenDeps.includes(dep))).toEqual([])

    const serverFiles = walkFiles(serverRoot).filter(f => /\.[cm]?ts$/.test(f))
    const badImportPattern = /(?:from|import)\s+['"](?:#imports|nuxt|vue|@nuxt\/content|@sidebase\/nuxt-auth|next-auth|.*(?:platformGovernanceStore|adminAuditStore|ipSecurityStore|uploadGovernance|notificationDispatcher))['"]/
    const violations: string[] = []
    for (const file of serverFiles) {
      const content = readFileSync(file, 'utf8')
      if (badImportPattern.test(content))
        violations.push(relative(appRoot, file))
    }
    expect(violations).toEqual([])
  })

  it('preserves production Cloudflare bindings, smart placement, 8h cron trigger, and zero leaked secrets in wrangler.jsonc', () => {
    const raw = readFileSync(join(appRoot, 'wrangler.jsonc'), 'utf8')
    const config = JSON.parse(raw)

    expect(config.placement?.mode).toBe('smart')
    expect(config.triggers?.crons).toContain('0 */8 * * *')
    expect(config.d1_databases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: 'DB',
          database_name: 'tuff-nexus-prod',
          database_id: 'ebdeb7fc-74a4-4963-9bca-310a9aa0e4d6',
        }),
      ]),
    )
    expect(config.r2_buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: 'R2',
          bucket_name: 'tuff-nexus-imgable-prod',
        }),
      ]),
    )
    expect(config.kv_namespaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: 'TUFF_INTELLIGENCE_RUNTIME',
          id: '8c235ea8b96d4209bed631ee6c698803',
        }),
      ]),
    )
    expect(config.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pattern: 'tuff.tagzxia.com/api/*' }),
      ]),
    )

    const vars = config.vars || {}
    const secretLikeKeys = Object.keys(vars).filter(k => /(SECRET|KEY|TOKEN|PASSWORD)/i.test(k))
    expect(secretLikeKeys).toEqual([])
  })
})
