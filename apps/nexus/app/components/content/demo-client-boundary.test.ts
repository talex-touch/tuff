import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readComponent(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('Tuff demo client boundary', () => {
  it('keeps the generated demo registry out of the SSR wrapper', () => {
    const wrapper = readComponent('./TuffDemoWrapper.vue')

    expect(wrapper).not.toContain('./demo-registry')
    expect(wrapper).toContain('<TuffDemoClientRenderer')
  })

  it('loads the generated demo registry only from the client renderer', () => {
    const renderer = readComponent('./TuffDemoClientRenderer.client.vue')

    expect(renderer).toContain("from './demo-registry'")
  })
})
