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
})
