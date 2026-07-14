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

describe('Tuff demo client boundary', () => {
  it('keeps the generated demo registry out of the SSR wrapper', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')

    expect(wrapper).not.toContain('./demo-registry')
    expect(wrapper).toContain('<LazyTuffDemoClientRenderer')
    expect(wrapper).not.toContain('<TuffDemoClientRenderer')
  })

  it('loads the generated demo registry only from the client renderer', () => {
    const renderer = readComponent('./TuffDemoClientRenderer.client.vue')

    expect(renderer).not.toContain("import { createAsyncDemo, demoLoaders } from './demo-registry'")
    expect(renderer).toContain("import('./demo-registry')")
  })

  it('keeps the client renderer behind active demo state', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')

    expect(wrapper).toContain('v-if="isDemoActive"')
    expect(wrapper).toContain('<LazyTuffDemoClientRenderer')
    expect(wrapper).toContain('if (!props.demo || isDemoActive.value)')
    expect(wrapper).not.toContain("from './demo-lazy'")
    expect(wrapper).toContain('class="tuff-demo__run-btn"')
    expect(wrapper).not.toContain('IntersectionObserver')
    expect(wrapper).not.toContain('scheduleDemoActivation')
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

  it('normalizes TuffEx dev component aliases to one source module id', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('const tuffexComponentSourceEntry = ')
    expect(config).toContain('const tuffexComponentSourceTypePathEntry = ')
    expect(config).toContain('tuffexComponentsSourceRoot')
    expect(config).toContain('/$1/index.ts')
    expect(config).toContain('{ find: /^@tuffex-components\\/(.+)$/, replacement: tuffexComponentSourceEntry }')
    expect(config).toContain("'@tuffex-components/*': [tuffexComponentSourceTypePathEntry]")
  })

  it('pre-bundles TuffEx runtime dependencies used by docs chrome', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'@floating-ui/vue'")
    expect(config).toContain("'v-wave'")
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
    expect(config).toContain("'dompurify'")
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
