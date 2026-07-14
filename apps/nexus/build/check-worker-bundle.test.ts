import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import enLocale from '../i18n/locales/en'
import zhLocale from '../i18n/locales/zh'

const nexusRoot = join(import.meta.dirname, '..')
const shotsRoot = join(nexusRoot, 'public/shots')
const pwaConfigPath = join(nexusRoot, 'app/config/pwa.ts')
const unoConfigPath = join(nexusRoot, 'uno.config.ts')
const nuxtConfigPath = join(nexusRoot, 'nuxt.config.ts')
const notesPagePath = join(nexusRoot, 'app/pages/notes/[slug].vue')
const counterPath = join(nexusRoot, 'app/components/Counter.vue')
const landingEcosystemPath = join(nexusRoot, 'app/components/tuff/landing/TuffLandingEcosystem.vue')
const landingCommunityPath = join(nexusRoot, 'app/components/tuff/landing/TuffLandingCommunity.vue')
const landingFaqPath = join(nexusRoot, 'app/components/tuff/landing/TuffLandingFaq.vue')
const landingWaitlistPath = join(nexusRoot, 'app/components/tuff/landing/TuffLandingWaitlist.vue')
const workerBundleGuardPath = join(nexusRoot, 'build/check-worker-bundle.mjs')
const runtimeEvidenceGuardPath = join(nexusRoot, 'build/check-runtime-evidence.mjs')
const runtimeEvidenceCollectorPath = join(nexusRoot, 'scripts/collect-deployed-preview-evidence.mjs')
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

  it('keeps route HTML and Nuxt Content runtime assets out of the PWA precache', () => {
    const pwaSource = readFileSync(pwaConfigPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(pwaSource).toContain("globPatterns: ['*.{png,ico,svg}']")
    expect(pwaSource).not.toContain('js,css,html')
    expect(pwaSource).not.toContain('**/*.{js,css')
    expect(pwaSource).toContain("'**/__nuxt_content/**'")
    expect(pwaSource).toContain("'**/dump.*.sql'")
    expect(pwaSource).toContain("'**/*.wasm'")
    expect(pwaSource).toContain("'**/sqlite3*'")

    expect(guardSource).toContain('forbiddenServiceWorkerPrecachePatterns')
    expect(guardSource).toContain('/_nuxt\\/(?!builds\\/)/')
    expect(guardSource).toContain('(?:en|zh)\\/docs')
    expect(guardSource).toContain('__nuxt_content\\/')
    expect(guardSource).toContain('dump\\.[^"\']+\\.sql')
    expect(guardSource).toContain('sqlite3[^"\']*')
    expect(guardSource).toContain('\\.wasm')
  })

  it('keeps production builds independent from remote web-font providers', () => {
    const unoSource = readFileSync(unoConfigPath, 'utf8')
    const pwaSource = readFileSync(pwaConfigPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(unoSource).toContain("process.env.UNOCSS_WEBFONTS === 'true'")
    expect(unoSource).not.toContain("process.env.NODE_ENV === 'production' || process.env.UNOCSS_WEBFONTS")
    expect(unoSource).toContain("provider: useWebFonts ? 'google' : 'none'")
    expect(pwaSource).not.toContain('fonts.googleapis.com')
    expect(pwaSource).not.toContain('fonts.gstatic.com')
    expect(guardSource).toContain('forbiddenRemoteFontPatterns')
    expect(guardSource).toContain('checkRemoteFontReferences')
    expect(guardSource).toContain('remote font references found in production HTML/CSS')
  })

  it('keeps component props out of global Attributify CSS extraction', () => {
    const unoSource = readFileSync(unoConfigPath, 'utf8')
    const counterSource = readFileSync(counterPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(unoSource).toContain('presetAttributify({ prefixedOnly: true })')
    expect(counterSource).toContain('class="my-3 inline-flex"')
    expect(counterSource).toContain('class="m-auto inline-block w-15 font-mono"')
    expect(counterSource).not.toContain('m="y-3"')
    expect(counterSource).not.toContain('font="mono"')
    expect(guardSource).toContain('forbiddenUnprefixedAttributifyPatterns')
    expect(guardSource).toContain('checkUnprefixedAttributifyLeaks')
    expect(guardSource).toContain('unprefixed Attributify selectors leaked into production CSS')
  })

  it('keeps oversized route-local icon paths out of the shared entry CSS', () => {
    const unoSource = readFileSync(unoConfigPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')
    const iconSources = [
      'app/pages/dashboard/overview.vue',
      'app/pages/dashboard/devices.vue',
      'app/pages/sign-in/components/SignInPasskeyStep.vue',
      'app/pages/sign-in/components/SignInEmailStep.vue',
      'app/pages/new/components/NewNexusHero.vue',
      'app/pages/new/components/NewLandingStats.vue',
      'app/components/tuff/landing/TuffLandingPlugins.vue',
      'app/components/tuff/landing/TuffLandingStats.vue',
      'app/components/tuff/landing/TuffLandingAiOverview.vue',
      'app/components/dashboard/DashboardNav.vue',
    ].map(file => readFileSync(join(nexusRoot, file), 'utf8')).join('\n')

    expect(unoSource).toContain("['i-simple-icons-linux', 'i-carbon-linux-alt']")
    expect(unoSource).toContain("['i-carbon-settings', 'i-ri-settings-line']")
    expect(unoSource).toContain("['i-carbon-fire', 'i-ri-fire-line']")
    expect(unoSource).toContain("['i-ri-settings-3-line', 'i-ri-settings-line']")
    expect(unoSource).toContain("['i-ri-settings-3-fill', 'i-ri-settings-fill']")
    expect(unoSource).toContain("['i-carbon-data-vis-1', 'i-ri-bar-chart-line']")
    expect(unoSource).toContain("['i-carbon-deployment-pattern', 'i-ri-route-line']")
    expect(unoSource).toContain("['i-carbon-queued', 'i-ri-time-line']")
    expect(unoSource).toContain("['i-carbon-ai-status', 'i-ri-robot-2-line']")
    expect(unoSource).not.toContain("['i-carbon-circle-dash', 'i-ri-loader-4-line']")
    expect(unoSource).not.toContain("['i-carbon-color-palette', 'i-ri-palette-line']")
    const oversizedIcons = [
      ['i-cib', 'apple'],
      ['i-cib', 'linux'],
      ['i-cib', 'safari'],
      ['i-cib', 'microsoft-edge'],
      ['i-carbon', 'fingerprint-recognition'],
      ['i-simple-icons', 'snowflake'],
      ['i-carbon', 'logo-figma'],
      ['i-carbon', 'tool-kit'],
      ['i-carbon', 'machine-learning-model'],
    ].map(parts => parts.join('-'))
    for (const icon of oversizedIcons) {
      expect(iconSources).not.toContain(icon)
    }
    for (const icon of [
      'i-simple-icons-apple',
      'i-simple-icons-linux',
      'i-ri-safari-line',
      'i-ri-edge-line',
      'i-ri-fingerprint-2-line',
      'i-carbon-snowflake',
      'i-ri-figma-fill',
      'i-carbon-tools',
      'i-carbon-machine-learning',
    ]) {
      expect(iconSources).toContain(icon)
    }
    expect(guardSource).toContain('const sharedEntryCssBudget')
    expect(guardSource).toContain('maxBytes: 278_000')
    expect(guardSource).toContain('maxGzipBytes: 50_000')
    expect(guardSource).toContain('const forbiddenSharedEntryIconTokens')
    expect(guardSource).toContain("['i-carbon', 'circle-dash']")
    expect(guardSource).toContain("['i-carbon', 'color-palette']")
    expect(guardSource).toContain('const sharedEntryAliasedIconBudgets')
    expect(guardSource).toContain("{ token: 'i-ri-settings-3-line', maxRuleBytes: 600 }")
    expect(guardSource).toContain("{ token: 'i-ri-settings-3-fill', maxRuleBytes: 550 }")
    expect(guardSource).toContain("{ token: 'i-carbon-data-vis-1', maxRuleBytes: 500 }")
    expect(guardSource).toContain("{ token: 'i-carbon-deployment-pattern', maxRuleBytes: 650 }")
    expect(guardSource).toContain("{ token: 'i-carbon-queued', maxRuleBytes: 600 }")
    expect(guardSource).toContain("{ token: 'i-carbon-ai-status', maxRuleBytes: 750 }")
    expect(guardSource).toContain("candidate.includes('--un-icon:')")
    expect(guardSource).toContain('checkSharedEntryCssBudget')
    expect(guardSource).toContain('shared entry CSS budget violations')
    expect(guardSource).toContain('oversized icon selector returned to shared entry CSS')
    expect(guardSource).toContain('aliased icon selector missing from shared entry CSS')
    expect(guardSource).toContain(`aliased icon selector ${'$'}{token} is`)
    expect(guardSource).toContain('Shared entry CSS verified')
  })

  it('replaces generic Vite chunk warnings with route-aware production budgets', () => {
    const nuxtSource = readFileSync(nuxtConfigPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(nuxtSource).toContain('chunkSizeWarningLimit: 600')
    expect(guardSource).toContain('const clientChunkBudget')
    expect(guardSource).toContain('initialMaxBytes: 420_000')
    expect(guardSource).toContain('heavyBytes: 500_000')
    expect(guardSource).toContain('maxBytes: 600_000')
    expect(guardSource).toContain('checkClientChunkBudgets')
    expect(guardSource).toContain('heavy chunk referenced by prerendered HTML')
    expect(guardSource).toContain('is an initial chunk')
    expect(guardSource).toContain('oversized initial chunks')
    expect(guardSource).toContain('Client chunk budgets verified')
  })

  it('keeps the release notes page off the broad renderer utility barrel', () => {
    const notesSource = readFileSync(notesPagePath, 'utf8')

    expect(notesSource).toContain("from '@talex-touch/utils/renderer/shared/markdown-sanitizer'")
    expect(notesSource).not.toContain("from '@talex-touch/utils/renderer'")
  })

  it('keeps fixed-size landing decoration within the mobile viewport', () => {
    const ecosystemSource = readFileSync(landingEcosystemPath, 'utf8')
    const communitySource = readFileSync(landingCommunityPath, 'utf8')
    const faqSource = readFileSync(landingFaqPath, 'utf8')
    const waitlistSource = readFileSync(landingWaitlistPath, 'utf8')

    expect(ecosystemSource).toContain('w-full max-w-[720px]')
    expect(ecosystemSource).not.toContain('h-[520px] w-[720px]')
    expect(ecosystemSource).toContain('right-0 h-[640px]')
    expect(ecosystemSource).toContain('sm:right-[-240px]')
    expect(communitySource).toContain('right-0 top-[15%]')
    expect(communitySource).toContain('sm:right-[-200px]')
    expect(faqSource).toContain('right-0 h-[520px]')
    expect(faqSource).toContain('sm:right-[-240px]')
    expect(waitlistSource).toContain('right-0 h-[460px]')
    expect(waitlistSource).toContain('sm:right-[-200px]')
  })

  it('keeps Content SQL on the Worker boundary without duplicate client payloads', () => {
    const packageSource = readFileSync(join(nexusRoot, 'package.json'), 'utf8')
    const trimSource = readFileSync(trimContentAssetsPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(packageSource).toContain('node build/trim-content-assets.mjs')
    expect(trimSource).toContain('removed duplicate sqlite wasm')
    expect(trimSource).toContain('workerSource.replaceAll')
    expect(trimSource).toContain('verified Cloudflare root SQL dumps')
    expect(trimSource).toContain('removed prerendered client SQL dumps')
    expect(trimSource).toContain('prerendered client SQL dumps remain')
    expect(guardSource).toContain('forbiddenClientContentDatabaseAssetPatterns')
    expect(guardSource).toContain('forbiddenClientContentDatabaseRuntimePatterns')
    expect(guardSource).toContain('checkClientContentDatabaseRuntime')
    expect(guardSource).toContain('checkRequiredRootSqlDumps')
    expect(guardSource).toContain('sqlite3(?:[.-][^/]+)?\\.wasm')
    expect(guardSource).toContain('sqlite3-worker1-bundler-friendly')
    expect(guardSource).toContain('sqlite3ApiConfig')
    expect(guardSource).toContain('OPFS sqlite3_vfs')
    expect(guardSource).toContain('Database integrity check failed, rebuilding database')
    expect(guardSource).toContain('client Content SQLite runtime found in production assets')
    expect(guardSource).toContain('Client Content SQLite runtime verified')
    expect(guardSource).toContain('Cloudflare root SQL dump runtime assets are invalid')
    expect(guardSource).toContain('prerendered client SQL dump must be trimmed')
    expect(guardSource).toContain('is not excluded from the Worker in _routes.json')
  })

  it('rejects Worker source maps unless diagnostic retention is explicitly enabled', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('const allowWorkerSourceMaps')
    expect(guardSource).toContain('NUXT_ENABLE_NITRO_SOURCEMAP')
    expect(guardSource).toContain('checkWorkerSourceMaps')
    expect(guardSource).toContain('Worker source maps found without explicit retention')
    expect(guardSource).toContain('Worker source maps verified')
  })

  it('keeps sidebase app-side auth runtime out of client assets', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('forbiddenClientAuthRuntimePatterns')
    expect(guardSource).toContain('checkClientSidebaseAuthRuntime')
    expect(guardSource).toContain('checkAuthHandlerSingleton')
    expect(guardSource).toContain('sidebase app-side auth runtime found in client assets')
    expect(guardSource).toContain('auth handler singleton guard failed')
    expect(guardSource).toContain('Auth handler singleton verified')
    expect(guardSource).toContain('cachedAuthHandler ??= NuxtAuthHandler(getAuthOptions())')
    expect(guardSource).toContain('const authHandler = getCachedAuthHandler()')
    expect(guardSource).toContain('NuxtAuthHandler(getAuthOptions(event))')
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
    expect(guardSource).toContain('/api/docs/navigation')
    expect(guardSource).toContain('/api/docs/navigation/:locale/:scope')
    expect(guardSource).toContain('navigation\\/_locale\\/_scope_\\.get\\.mjs')
    expect(guardSource).toContain('/api/docs/sidebar-components')
    expect(guardSource).toContain('/api/docs/sidebar-components/:locale')
    expect(guardSource).toContain('sidebar-components\\/_locale_\\.get\\.mjs')
    expect(guardSource).toContain('/api/docs/search')
    expect(guardSource).toContain('/api/docs/search/:locale')
    expect(guardSource).toContain('search\\/_locale_\\.get\\.mjs')
    expect(guardSource).toContain('/api/content/policy')
    expect(guardSource).toContain('/api/docs/view:get')
    expect(guardSource).toContain('/api/docs/view:post')
    expect(guardSource).toContain('/api/docs/feedback:get')
    expect(guardSource).toContain('/api/docs/feedback:post')
    expect(guardSource).toContain('/api/docs/comments:get')
    expect(guardSource).toContain('/api/docs/comments:post')
    expect(guardSource).toContain('/api/docs/engagement')
    expect(guardSource).toContain('/api/auth/**')
    expect(guardSource).toContain('/api/auth/me')
    expect(guardSource).toContain('/api/app-auth/device/start')
    expect(guardSource).toContain('/api/app-auth/device/poll')
    expect(guardSource).toContain('/api/app-auth/device/approve')
    expect(guardSource).toContain('/api/dashboard/plugins')
    expect(guardSource).toContain('/api/dashboard/team')
    expect(guardSource).toContain('/api/dashboard/provider-registry/providers')
    expect(guardSource).toContain('/api/dashboard/governance/summary')
    expect(guardSource).toContain('/api/dashboard/storage/status')
    expect(guardSource).toContain('/api/dashboard/telemetry/me')
  })

  it('keeps all prerendered docs paths outside the Cloudflare Pages Worker', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')
    const nuxtSource = readFileSync(nuxtConfigPath, 'utf8')

    expect(nuxtSource).toContain("exclude: ['/en/docs', '/en/docs/*', '/zh/docs', '/zh/docs/*']")
    expect(guardSource).toContain('expectedStaticRoutePatterns')
    expect(guardSource).toContain("['/en/docs/*', '/zh/docs/*']")
    expect(guardSource).toContain('expectedStaticRoutePatterns.length} patterns')
  })

  it('guards production route files and page payload boundaries', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('routeToDistPath')
    expect(guardSource).toContain('checkStaticRouteFiles')
    expect(guardSource).toContain('missing static route files')
    expect(guardSource).toContain('Static route files verified')
    expect(guardSource).toContain('workerOwnedAppRoutes')
    expect(guardSource).toContain('checkWorkerOwnedAppRoutes')
    expect(guardSource).toContain('worker-owned app routes were emitted as static routes')
    expect(guardSource).toContain('/dashboard/admin/provider-registry')
    expect(guardSource).toContain('/auth/app-callback')
    expect(guardSource).toContain('/team/join')

    expect(guardSource).toContain('maxDocsDetailHtmlBytes')
    expect(guardSource).toContain('isDocsRootHtml')
    expect(guardSource).toContain('isDocsDetailHtml')
    expect(guardSource).toContain('checkDocsDetailHtmlPayload')
    expect(guardSource).toContain('contains full docs body payload')
    expect(guardSource).toContain('contains navigation API payload')
    expect(guardSource).toContain('forbiddenDocsInitialLifecyclePatterns')
    expect(guardSource).toContain('checkDocsInitialLifecycleBlockers')
    expect(guardSource).toContain('docs initial JS lifecycle blockers found')
    expect(guardSource).toContain('Docs initial lifecycle blockers verified')

    expect(guardSource).toContain('htmlBoundaryChecks')
    expect(guardSource).toContain('checkHtmlCssBoundaries')
    expect(guardSource).toContain('page CSS boundary violations')
    expect(guardSource).toContain('docs HTML pulled non-doc CSS')
    expect(guardSource).toContain('store HTML pulled docs/dashboard/landing CSS')
    expect(guardSource).toContain('landing HTML pulled docs/store/dashboard CSS')
    expect(guardSource).toContain('public info HTML pulled app-surface CSS')
    expect(guardSource).toContain('auth HTML pulled docs/store/dashboard/landing CSS')
  })

  it('guards initial JS and CSS budgets for public route families', () => {
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(guardSource).toContain('htmlInitialAssetBudgets')
    expect(guardSource).toContain('checkHtmlInitialAssetBudgets')
    expect(guardSource).toContain('getAssetStats')
    expect(guardSource).toContain('assetStatsCache')
    expect(guardSource).toContain('maxJsGzipBytes')
    expect(guardSource).toContain('maxCssGzipBytes')
    expect(guardSource).toContain('js gzip')
    expect(guardSource).toContain('css gzip')
    expect(guardSource).toContain('missing js assets')
    expect(guardSource).toContain('missing css assets')
    expect(guardSource).toContain('page initial asset budget violations')
    expect(guardSource).toContain('forbiddenLandingImagePrefetchPattern')
    expect(guardSource).toContain('forbiddenLandingDeferredImagePattern')
    expect(guardSource).toContain('forbiddenLandingShowcaseVideoPattern')
    expect(guardSource).toContain('checkLandingImagePrefetches')
    expect(guardSource).toContain('checkLandingDeferredImageReferences')
    expect(guardSource).toContain('checkLandingShowcaseVideoReferences')
    expect(guardSource).toContain('landing HTML contains below-fold image prefetch hints')
    expect(guardSource).toContain('landing HTML contains deferred plugin image references')
    expect(guardSource).toContain('landing HTML contains deferred showcase video references')
    expect(guardSource).toContain('Landing image prefetch hints verified')
    expect(guardSource).toContain('Landing deferred image references verified')
    expect(guardSource).toContain('Landing showcase video references verified')
    expect(guardSource).toContain('docs initial assets')
    expect(guardSource).toContain('store initial assets')
    expect(guardSource).toContain('landing initial assets')
    expect(guardSource).toContain('public info initial assets')
    expect(guardSource).toContain('auth initial assets')
  })

  it('keeps public pricing and password-reset locale contracts complete', () => {
    const pricingKeys = [
      'freeTitle',
      'freePrice',
      'freeDesc',
      'freeFeature1',
      'freeFeature2',
      'freeFeature3',
      'plusTitle',
      'plusPrice',
      'plusDesc',
      'plusFeature1',
      'plusFeature2',
      'plusFeature3',
      'teamTitle',
      'teamPrice',
      'teamDesc',
      'teamFeature1',
      'teamFeature2',
      'teamFeature3',
      'cta',
    ] as const
    const authKeys = [
      'forgotTitle',
      'forgotSubtitle',
      'sendReset',
      'resetFailed',
      'resetEmailSent',
    ] as const

    for (const key of pricingKeys) {
      expect(enLocale.pricing[key]).toBeTruthy()
      expect(enLocale.pricing[key]).not.toMatch(/\p{Script=Han}/u)
      expect(zhLocale.pricing[key]).toBeTruthy()
    }
    for (const key of authKeys) {
      expect(enLocale.auth[key]).toBeTruthy()
      expect(enLocale.auth[key]).not.toMatch(/\p{Script=Han}/u)
      expect(zhLocale.auth[key]).toBeTruthy()
    }
  })

  it('guards local runtime evidence artifacts as a repeatable check', () => {
    const packageSource = readFileSync(join(nexusRoot, 'package.json'), 'utf8')
    const evidenceGuardSource = readFileSync(runtimeEvidenceGuardPath, 'utf8')

    expect(packageSource).toContain('"check:runtime-evidence": "node build/check-runtime-evidence.mjs"')
    expect(packageSource).toContain('"check:runtime-evidence:deployed": "node build/check-runtime-evidence.mjs --require-deployed-preview"')
    expect(packageSource).toContain('"check:runtime-evidence:template": "node build/check-runtime-evidence.mjs --print-deployed-preview-template"')
    expect(packageSource).toContain('"collect:runtime-evidence:deployed": "node scripts/collect-deployed-preview-evidence.mjs"')
    expect(evidenceGuardSource).toContain('nexus-wrangler-prod-runtime-smoke-')
    expect(evidenceGuardSource).toContain('nexus-cloudflare-pages-preview-runtime-smoke-')
    expect(evidenceGuardSource).toContain('--require-deployed-preview')
    expect(evidenceGuardSource).toContain('--print-deployed-preview-template')
    expect(evidenceGuardSource).toContain('createDeployedPreviewEvidenceTemplate')
    expect(evidenceGuardSource).toContain('nexus-cloudflare-pages-preview-runtime-smoke/v1')
    expect(evidenceGuardSource).toContain('createApiProbeTemplate')
    expect(evidenceGuardSource).toContain('createRouteProbeTemplate')
    expect(evidenceGuardSource).toContain('nexus-local-prod-pwa-precache-trim-')
    expect(evidenceGuardSource).toContain('checkEvidenceSidecars')
    expect(evidenceGuardSource).toContain('missing runtime evidence sidecar')
    expect(evidenceGuardSource).toContain('getDeclaredEvidenceHarFiles')
    expect(evidenceGuardSource).toContain('docs-store-back')
    expect(evidenceGuardSource).toContain('checkEvidenceMarkdownSummaries')
    expect(evidenceGuardSource).toContain('markdown summary is stale or missing')
    expect(evidenceGuardSource).toContain('checkDeployedPreviewEvidence')
    expect(evidenceGuardSource).toContain('checkDeployedPreviewMarkdownSummary')
    expect(evidenceGuardSource).toContain('isLocalEvidenceBaseUrl')
    expect(evidenceGuardSource).toContain('isHttpsEvidenceBaseUrl')
    expect(evidenceGuardSource).toContain('deployed Cloudflare preview baseUrl is not HTTPS')
    expect(evidenceGuardSource).toContain('checkAuthProviderCallback')
    expect(evidenceGuardSource).toContain('errorBoundaryOnly')
    expect(evidenceGuardSource).toContain('checkAuthenticatedDashboard')
    expect(evidenceGuardSource).toContain('did not prove a real bfcache hit')
    expect(evidenceGuardSource).toContain('Auth handler singleton source guard')
    expect(evidenceGuardSource).toContain('checkWranglerWarningBudget')
    expect(evidenceGuardSource).toContain('wrangler console error budget exceeded')
    expect(evidenceGuardSource).toContain('unexpected wrangler warning')
    expect(evidenceGuardSource).toContain('Hydration completed but contains mismatches.')
    expect(evidenceGuardSource).toContain('authHandlerSingleton')
    expect(evidenceGuardSource).toContain('checkApiProbes')
    expect(evidenceGuardSource).toContain('minBytes')
    expect(evidenceGuardSource).toContain('maxBytes')
    expect(evidenceGuardSource).toContain('sampleSnippets')
    expect(evidenceGuardSource).toContain('locationPart')
    expect(evidenceGuardSource).toContain('/api/auth/error?error=Callback')
    expect(evidenceGuardSource).toContain('"message": "Unauthorized"')
    expect(evidenceGuardSource).toContain('checkRouteProbes')
    expect(evidenceGuardSource).toContain('checkRouteRequestBudget')
    expect(evidenceGuardSource).toContain('allowMediaAbortFailures')
    expect(evidenceGuardSource).toContain('leaked translation keys')
    expect(evidenceGuardSource).toContain('checkPublicRouteNetwork')
    expect(evidenceGuardSource).toContain('checkPwaRouteFanout')
    expect(evidenceGuardSource).toContain('checkPwaDocsDetailRoute')
    expect(evidenceGuardSource).toContain('expectedStaticApi404s')
    expect(evidenceGuardSource).toContain('/api/docs/feedback')
    expect(evidenceGuardSource).toContain('checkPwaFailedRequestBudget')
    expect(evidenceGuardSource).toContain('public route cumulative _nuxt request count')
    expect(evidenceGuardSource).toContain('bfcache navigation type')
  })

  it('keeps deployed preview evidence collection explicit and non-local by default', () => {
    const collectorSource = readFileSync(runtimeEvidenceCollectorPath, 'utf8')

    expect(collectorSource).toContain('status: \'DRY_RUN\'')
    expect(collectorSource).toContain('refusing local base URL')
    expect(collectorSource).toContain('refusing non-HTTPS base URL')
    expect(collectorSource).toContain('requiresHttpsBaseUrl')
    expect(collectorSource).toContain('NEXUS_DEPLOYED_PREVIEW_URL')
    expect(collectorSource).toContain('NEXUS_DEPLOYED_AUTH_STATE')
    expect(collectorSource).toContain('NEXUS_DEPLOYED_PROVIDER_CALLBACK_EVIDENCE')
    expect(collectorSource).toContain('--provider-callback-evidence')
    expect(collectorSource).toContain('readProviderCallbackEvidence')
    expect(collectorSource).toContain('resolveOutputEvidenceFile')
    expect(collectorSource).toContain("'provider callback evidence'")
    expect(collectorSource).toContain("'auth state'")
    expect(collectorSource).toContain("page.on('response'")
    expect(collectorSource).toContain('recordHar')
    expect(collectorSource).toContain("storageState: resolveOutputEvidenceFile(authState, 'auth state')")
    expect(collectorSource).toContain('PENDING_AUTH')
    expect(collectorSource).toContain('providerCallbackEvidenceShape')
    expect(collectorSource).toContain('authenticated dashboard smoke is pending')
    expect(collectorSource).toContain('nexus-cloudflare-pages-preview-runtime-smoke/v1')
    expect(collectorSource).toContain('node build/check-runtime-evidence.mjs --require-deployed-preview')
  })
})
