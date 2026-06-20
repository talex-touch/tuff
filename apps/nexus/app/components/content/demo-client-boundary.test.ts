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
    expect(wrapper).toContain('<TuffDemoClientRenderer')
  })

  it('loads the generated demo registry only from the client renderer', () => {
    const renderer = readComponent('./TuffDemoClientRenderer.client.vue')

    expect(renderer).not.toContain("import { createAsyncDemo, demoLoaders } from './demo-registry'")
    expect(renderer).toContain("import('./demo-registry')")
  })

  it('keeps the client renderer behind active demo state', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')

    expect(wrapper).toContain('v-if="isDemoActive"')
  })

  it('removes generated demos from Nuxt component auto-registration', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'components:extend'")
    expect(config).toContain('/app/components/content/demos/')
    expect(config).toContain('/app/components/content/demo-registry.ts')
    expect(config).toContain('/app/components/content/demo-loader.ts')
    expect(config).toContain('/app/components/content/demo-lazy.ts')
  })

  it('keeps internal server helpers with duplicate type names out of auto-imports', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("!normalized.endsWith('/server/utils/telemetryRetentionCore.ts')")
  })

  it('keeps legacy sonner styles route-local instead of loading them on every docs page', () => {
    const config = readProjectFile('../../../nuxt.config.ts')
    const signInPage = readProjectFile('../../pages/sign-in/index.vue')

    expect(config).not.toContain("'vue-sonner/style.css'")
    expect(signInPage).toContain("import 'vue-sonner/style.css'")
  })

  it('normalizes TuffEx dev component aliases to one source module id', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('const tuffexComponentSourceEntry = ')
    expect(config).toContain('tuffexComponentsSourceRoot')
    expect(config).toContain('/$1/index.ts')
    expect(config).toContain('{ find: /^@tuffex-components\\/(.+)$/, replacement: tuffexComponentSourceEntry }')
    expect(config).toContain("'@tuffex-components/*': [tuffexComponentSourceEntry]")
  })

  it('pre-bundles TuffEx runtime dependencies used by docs chrome', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'@floating-ui/vue'")
    expect(config).toContain("'v-wave'")
  })

  it('pre-bundles WebGL background dependencies used by Nexus visual routes', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain("'ogl'")
  })

  it('keeps Sentry out of local dev startup unless explicitly enabled', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('const enableSentry = isProd || isEnvFlagEnabled(process.env.NUXT_ENABLE_SENTRY)')
    expect(config).toContain("...(disableSentry ? [] : ['@sentry/nuxt/module'])")
  })

  it('keeps route-local marketing and store components out of auto-registration', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('/app/components/store/')
    expect(config).toContain('/app/components/tuff/')
    expect(config).toContain('/app/components/theme/components/')
  })

  it('keeps page-local components out of generated routes', () => {
    const config = readProjectFile('../../../nuxt.config.ts')

    expect(config).toContain('function isRouteLocalPageComponent')
    expect(config).toContain("normalized.includes('/app/pages/')")
    expect(config).toContain("normalized.includes('/components/')")
    expect(config).toContain("pages.splice(index, 1)")
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
