import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const nexusRoot = join(import.meta.dirname, '..')
const shotsRoot = join(nexusRoot, 'public/shots')
const pwaConfigPath = join(nexusRoot, 'app/config/pwa.ts')
const workerBundleGuardPath = join(nexusRoot, 'build/check-worker-bundle.mjs')
const trimContentAssetsPath = join(nexusRoot, 'build/trim-content-assets.mjs')

describe('Nexus deploy asset budget', () => {
  it('keeps landing showcase videos small and silent', () => {
    const showcaseVideos = [
      'SearchApp.mp4',
      'SearchFileImmediately.mp4',
      'PluginTranslate.mp4',
    ]

    for (const fileName of showcaseVideos) {
      const filePath = join(shotsRoot, fileName)
      const bytes = statSync(filePath).size
      expect(bytes, `${fileName} should stay below 2 MiB`).toBeLessThan(2 * 1024 * 1024)
    }
  })

  it('keeps retired legacy GIFs out of the public source tree', () => {
    expect(existsSync(join(shotsRoot, 'SearchApp.gif'))).toBe(false)
    expect(existsSync(join(shotsRoot, 'PluginTranslate.gif'))).toBe(false)
  })

  it('keeps Nuxt Content runtime assets out of the PWA precache', () => {
    const pwaSource = readFileSync(pwaConfigPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(pwaSource).toContain("globPatterns: ['**/*.{js,css,html,png,ico,svg}']")
    expect(pwaSource).toContain("'**/__nuxt_content/**'")
    expect(pwaSource).toContain("'**/dump.*.sql'")
    expect(pwaSource).toContain("'**/*.wasm'")
    expect(pwaSource).toContain("'**/sqlite3*'")

    expect(guardSource).toContain('forbiddenServiceWorkerPrecachePatterns')
    expect(guardSource).toContain('__nuxt_content\\/')
    expect(guardSource).toContain('dump\\.[^"\']+\\.sql')
    expect(guardSource).toContain('sqlite3[^"\']*')
    expect(guardSource).toContain('\\.wasm')
  })

  it('deduplicates Nuxt Content sqlite wasm and SQL dumps after build', () => {
    const packageSource = readFileSync(join(nexusRoot, 'package.json'), 'utf8')
    const trimSource = readFileSync(trimContentAssetsPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(packageSource).toContain('node build/trim-content-assets.mjs')
    expect(trimSource).toContain('removed duplicate sqlite wasm')
    expect(trimSource).toContain('workerSource.replaceAll')
    expect(trimSource).toContain('removed duplicate root SQL dumps')
    expect(trimSource).toContain('replaceJsonObjectEntry')
    expect(guardSource).toContain('checkDuplicateSqliteWasm')
    expect(guardSource).toContain('checkDuplicateRootSqlDumps')
    expect(guardSource).toContain('duplicate sqlite wasm files found')
    expect(guardSource).toContain('duplicate root SQL dump files found')
  })

  it('keeps sidebase app-side auth runtime out of client assets', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('forbiddenClientAuthRuntimePatterns')
    expect(guardSource).toContain('checkClientSidebaseAuthRuntime')
    expect(guardSource).toContain('sidebase app-side auth runtime found in client assets')
    expect(guardSource).toContain('nuxt-auth-app-side')
    expect(guardSource).toContain('useAuthState')
    expect(guardSource).toContain('navigateToAuthPages')
    expect(guardSource).toContain('SessionRequired')
  })

  it('guards runtime-only route chunks needed by docs and auth smoke flows', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('requiredWorkerRouteChunks')
    expect(guardSource).toContain('checkRequiredWorkerRouteChunks')
    expect(guardSource).toContain('required runtime route chunks are missing')
    expect(guardSource).toContain('/api/docs/page')
    expect(guardSource).toContain('/api/auth/**')
    expect(guardSource).toContain('/api/auth/me')
    expect(guardSource).toContain('/api/app-auth/device/start')
    expect(guardSource).toContain('/api/app-auth/device/poll')
    expect(guardSource).toContain('/api/app-auth/device/approve')
  })

  it('guards production route files and page payload boundaries', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('routeToDistPath')
    expect(guardSource).toContain('checkStaticRouteFiles')
    expect(guardSource).toContain('missing static route files')
    expect(guardSource).toContain('Static route files verified')

    expect(guardSource).toContain('maxDocsDetailHtmlBytes')
    expect(guardSource).toContain('isDocsRootHtml')
    expect(guardSource).toContain('isDocsDetailHtml')
    expect(guardSource).toContain('checkDocsDetailHtmlPayload')
    expect(guardSource).toContain('contains full docs body payload')
    expect(guardSource).toContain('contains navigation API payload')

    expect(guardSource).toContain('htmlBoundaryChecks')
    expect(guardSource).toContain('checkHtmlCssBoundaries')
    expect(guardSource).toContain('page CSS boundary violations')
    expect(guardSource).toContain('docs HTML pulled non-doc CSS')
    expect(guardSource).toContain('store HTML pulled docs/dashboard/landing CSS')
    expect(guardSource).toContain('landing HTML pulled docs/store/dashboard CSS')
    expect(guardSource).toContain('auth HTML pulled docs/store/dashboard/landing CSS')
  })

  it('guards initial JS and CSS budgets for public route families', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('htmlInitialAssetBudgets')
    expect(guardSource).toContain('checkHtmlInitialAssetBudgets')
    expect(guardSource).toContain('getAssetStats')
    expect(guardSource).toContain('missing js assets')
    expect(guardSource).toContain('missing css assets')
    expect(guardSource).toContain('page initial asset budget violations')
    expect(guardSource).toContain('docs initial assets')
    expect(guardSource).toContain('store initial assets')
    expect(guardSource).toContain('landing initial assets')
    expect(guardSource).toContain('auth initial assets')
  })
})
