import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readComponent(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

function readProjectFile(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

function readNuxtFile(file: string) {
  return readFileSync(new URL(`../../../.nuxt/${file}`, import.meta.url), 'utf8')
}

/**
 * Vite discovers a dependency imported through a package entry as a nested id
 * (`owner > dep`), which changes the `optimizeDeps.include` spelling. Accept either the
 * bare or the nested entry so this test keeps asserting the pre-bundle, not the id shape.
 */
function preBundlesDependency(config: string, dependency: string): boolean {
  const escaped = dependency.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`['"](?:[^'"]* > )?${escaped}['"]`).test(config)
}

describe('Tuff demo client boundary', () => {
  it('keeps the generated demo registry out of the SSR wrapper', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')

    // The wrapper may *start* the registry download on activation, but only through the
    // shared loader's dynamic import — a static import here would pull 370+ demo entries
    // into the server graph of every docs page.
    expect(wrapper).not.toMatch(/from ['"]\.\/demo-registry['"]/)
    expect(wrapper).toContain("from './demo-registry-loader'")
    expect(wrapper).toMatch(/if \(import\.meta\.client\)\s*\n\s*void loadDemoRegistry\(\)/)
    expect(wrapper).toContain('<LazyTuffDemoClientRenderer')
    expect(wrapper).not.toContain('<TuffDemoClientRenderer')
  })

  it('loads the generated demo registry through one shared dynamic import', () => {
    const loader = readComponent('./demo-registry-loader.ts')
    const renderer = readComponent('./TuffDemoClientRenderer.client.vue')

    expect(loader).toContain("import('./demo-registry')")
    expect(loader).not.toMatch(/from ['"]\.\/demo-registry['"]/)
    expect(renderer).toContain("from './demo-registry-loader'")
    expect(renderer).not.toContain("import('./demo-registry')")
    expect(renderer).not.toMatch(/from ['"]\.\/demo-registry['"]/)
  })

  it('keeps the client renderer behind viewport-driven demo activation', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')

    expect(wrapper).toContain('v-if="isDemoActive"')
    expect(wrapper).toContain('<LazyTuffDemoClientRenderer')
    expect(wrapper).toContain("from './demo-lazy'")
    expect(wrapper).toContain('new IntersectionObserver')
    expect(wrapper).toContain('DEMO_LAZY_ROOT_MARGIN')
    expect(wrapper).not.toContain('class="tuff-demo__run-btn"')
  })

  it('keeps embedded code blocks behind the code toggle', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')
    const codeBlock = readComponent('./TuffCodeBlock.vue')
    const codeBlockRenderer = readComponent('./TuffCodeBlockRenderer.vue')

    expect(wrapper).toContain("const LazyEmbeddedCodeBlock = defineAsyncComponent(() => import('./TuffCodeBlock.vue'))")
    expect(wrapper).toContain('<LazyEmbeddedCodeBlock')
    expect(wrapper).toContain('v-if="hasCode && showCode"')
    expect(wrapper).not.toContain('<LazyTuffCodeBlock')
    expect(wrapper).not.toContain('<TuffCodeBlock')
    expect(codeBlock).toContain("const LazyTuffCodeBlockRenderer = defineAsyncComponent(() => import('./TuffCodeBlockRenderer.vue'))")
    expect(codeBlock).not.toContain('<style')
    expect(codeBlockRenderer).toContain('<style scoped>')
  })

  it('removes generated demos from Nuxt component auto-registration', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'components:extend'")
    expect(config).toContain('/app/components/content/demos/')
    expect(config).toContain('/app/components/content/demo-registry.ts')
    expect(config).toContain('/app/components/content/demo-loader.ts')
    expect(config).toContain('/app/components/content/demo-lazy.ts')
    expect(config).toContain('/app/components/content/demo-registry-loader.ts')
    expect(config).toContain('/app/components/content/TuffCodeBlockRenderer.vue')
  })

  it('keeps internal server helpers with duplicate type names out of auto-imports', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("!normalized.endsWith('/server/utils/telemetryRetentionCore.ts')")
  })

  it('keeps legacy sonner out of first-paint app modules', () => {
    const config = readProjectFile('../../../nuxt.config.ts')
    const signInPage = readProjectFile('../../pages/sign-in/index.vue')
    const signInComposable = readProjectFile('../../composables/useSignIn.ts')
    const adminBootstrapPage = readProjectFile('../../pages/auth/admin-bootstrap.vue')

    expect(config).not.toContain("'vue-sonner/style.css'")
    expect(config).not.toContain("'vue-sonner'")
    expect(signInPage).not.toContain("from 'vue-sonner'")
    expect(signInPage).not.toContain("vue-sonner/style.css")
    expect(signInPage).not.toContain('<Toaster')
    expect(signInComposable).not.toContain("from 'vue-sonner'")
    expect(signInComposable).toContain('const toast = useToast()')
    expect(adminBootstrapPage).not.toContain("from 'vue-sonner'")
    expect(adminBootstrapPage).toContain('const toast = useToast()')
  })

  it('normalizes TuffEx dev component aliases to one mode-selected module id', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    // Source mode remains an explicit escape hatch, so its component targets must survive.
    expect(config).toContain('const tuffexComponentSourceEntry = ')
    expect(config).toContain('const tuffexComponentSourceTypePathEntry = ')
    expect(config).toContain('tuffexComponentsSourceRoot')
    expect(config).toContain('/$1/index.ts')
    expect(config).toMatch(/\$\{tuffexComponentsSourceRoot\}\/\*\/index\.ts/)

    // Dist mode is the dev default, so its component targets must exist to be selected.
    expect(config).toContain('const tuffexComponentDistEntry = ')
    expect(config).toContain('const tuffexComponentDistTypePathEntry = ')
    expect(config).toContain('/$1/index.js')
    expect(config).toContain('/*/index.d.ts')

    // Dev picks the entry from the resolved mode, while production keeps the source registry
    // that the generated demo module auto-imports against.
    expect(config).toContain('const tuffexComponentEntry = useTuffexSource ? tuffexComponentSourceEntry : tuffexComponentDistEntry')
    expect(config).toContain('const tuffexComponentAutoImportEntry = isDev ? tuffexComponentEntry : tuffexComponentSourceEntry')
    expect(config.replace(/\s+/g, ' ')).toContain('const tuffexComponentTypePathEntry = !isDev ? tuffexComponentSourceTypePathEntry : useTuffexSource ? tuffexComponentSourceTypePathEntry : tuffexComponentDistTypePathEntry')

    // The auto-import alias keeps its module id stable in production; the package-subpath alias
    // and both type paths stay mode-selected in dev.
    expect(config).toContain('{ find: /^@tuffex-components\\/(.+)$/, replacement: tuffexComponentAutoImportEntry }')
    expect(config).toContain('{ find: /^@talex-touch\\/tuffex\\/([a-z0-9-]+)$/, replacement: tuffexComponentEntry }')
    expect(config).toContain("'@tuffex-components/*': [tuffexComponentTypePathEntry]")
    expect(config).toContain("'@talex-touch/tuffex/*': [tuffexComponentTypePathEntry]")
  })

  it('pre-bundles TuffEx runtime dependencies used by docs chrome', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(preBundlesDependency(config, '@floating-ui/vue')).toBe(true)
    expect(preBundlesDependency(config, 'v-wave')).toBe(true)
  })

  it('pre-bundles WebGL background dependencies used by Nexus visual routes', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'@vueuse/core'")
    expect(config).toContain("'ogl'")
  })

  it('pre-bundles route-local dev runtime dependencies discovered by Vite', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'marked'")
    expect(config).toContain("'echarts/core'")
    expect(config).toContain("'echarts/charts'")
    expect(config).toContain("'echarts/components'")
    expect(config).toContain("'echarts/renderers'")
    expect(preBundlesDependency(config, 'dompurify')).toBe(true)
  })

  it('keeps Sentry out of local dev startup unless explicitly enabled', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('const enableSentry = isProd || isEnvFlagEnabled(process.env.NUXT_ENABLE_SENTRY)')
    expect(config).toContain("...(disableSentry ? [] : ['@sentry/nuxt/module'])")
  })

  it('tree-shakes unused Sentry tracing and replay runtime independently of source maps', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('__SENTRY_DEBUG__: false')
    expect(config).toContain('__SENTRY_TRACING__: false')
    expect(config).toContain('__RRWEB_EXCLUDE_IFRAME__: true')
    expect(config).toContain('__RRWEB_EXCLUDE_SHADOW_DOM__: true')
    expect(config).toContain('__SENTRY_EXCLUDE_REPLAY_WORKER__: true')
  })

  it('loads the Sentry client after mount instead of before hydration', () => {
    const config = readProjectFile('../../../nuxt.config.ts')
    const plugin = readProjectFile('../../plugins/sentry-deferred.client.ts')
    const clientConfig = readProjectFile('../../../sentry.client.config.ts')

    // The module's two client plugins awaited the SDK download in the plugin phase, so it sat
    // on the hydration critical path of every page. They are removed and replaced by a plugin
    // that loads on the first idle slot after mount and replays anything caught in between.
    expect(config).toContain('function removeSentryClientPlugins(')
    expect(config).toMatch(/'app:resolve'\(app\) \{[\s\S]*removeSentryClientPlugins\(app\)/)
    expect(config).toContain('sentryClientEnabled: !disableSentry')
    expect(plugin).toContain("nuxtApp.hook('app:mounted'")
    expect(plugin).toContain('installErrorBuffer(window)')
    expect(plugin).toContain('buffer.flush(')
    expect(plugin).toContain("import('@sentry/nuxt')")
    // Importing the config file must stay side-effect free: the module still `await import`s
    // it if its plugin ever comes back, and a top-level init would undo the deferral.
    expect(clientConfig).not.toMatch(/^Sentry\.init\(/m)
    expect(clientConfig).toContain('export function initSentryClient(')
  })

  it('only retains Nitro source maps for explicit diagnostics and lets Sentry own upload maps', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('const enableNitroSourceMap = isEnvFlagEnabled(process.env.NUXT_ENABLE_NITRO_SOURCEMAP)')
    expect(config).toContain('const nitroSourceMap = disableNitroSourceMap')
    expect(config).toContain(': enableSentrySourceMaps')
    expect(config).toContain('? undefined')
    expect(config).toContain('sourceMap: nitroSourceMap')
    expect(config).not.toContain('sourceMap: !disableNitroSourceMap')
  })

  it('keeps route-local marketing and store components out of auto-registration', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('/app/components/store/')
    expect(config).toContain('/app/components/tuff/')
    expect(config).toContain('/app/components/theme/components/')
  })

  it('keeps page-local components out of generated routes', () => {
    const config = readProjectFile('../../../nuxt.config.ts')
    const routeFilter = readProjectFile('../../../build/nexus-page-routes.ts')

    expect(config).toContain("import { removeRouteLocalPageComponents } from './build/nexus-page-routes'")
    expect(config).toContain('removeRouteLocalPageComponents(pages)')
    expect(routeFilter).toContain('removeRouteLocalPageComponents(page.children)')
    expect(routeFilter).toContain("normalized.includes('/app/pages/')")
    expect(routeFilter).toContain("normalized.includes('/components/')")
  })

  it('keeps docs demos and demo helpers out of generated Nuxt components', () => {
    const generatedComponents = [
      readNuxtFile('components.d.ts'),
      readNuxtFile('types/components.d.ts'),
    ].join('\n')

    expect(generatedComponents).not.toContain('content/demos')
    expect(generatedComponents).not.toContain('demo-registry')
    expect(generatedComponents).not.toContain('demo-registry-loader')
    expect(generatedComponents).not.toContain('demo-loader')
    expect(generatedComponents).not.toContain('demo-lazy')
  })

  it('keeps route-local marketing and store components out of generated Nuxt components', () => {
    const generatedComponents = [
      readNuxtFile('components.d.ts'),
      readNuxtFile('types/components.d.ts'),
    ].join('\n')

    expect(generatedComponents).not.toContain('components/store/')
    expect(generatedComponents).not.toContain('components/tuff/')
    expect(generatedComponents).not.toContain('components/theme/components/')
  })
})
