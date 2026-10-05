import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileStyle, parse } from 'vue/compiler-sfc'

/**
 * The agent bar's scoped style, compiled the way the app compiles it. jsdom lays nothing out, so the
 * rule that keeps every agent's chip in view — wrapping, not scrolling sideways — can only be held in
 * place by what it compiles to. Measured in the app: twelve chips need about 1380px; the chip row has
 * 570px of the 760px row at the 1100px window minimum.
 */
function compiledStyle(): string {
  const source = readFileSync(
    fileURLToPath(new URL('./ResourceAgentBar.vue', import.meta.url)),
    'utf8'
  )
  const [style] = parse(source).descriptor.styles
  return compileStyle({
    source: style!.content,
    filename: 'ResourceAgentBar.vue',
    id: 'data-v-test',
    scoped: true,
    preprocessLang: 'scss'
  }).code.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('ResourceAgentBar style', () => {
  it('wraps the chips onto more lines instead of scrolling them sideways', () => {
    const match = compiledStyle().match(
      /\.ResourceAgentBar-Chips\[data-v-test\]\s+\.tx-bui-filter-chips\s*\{([^}]*)\}/
    )
    expect(match).not.toBeNull()
    const declarations = match![1]!
    expect(declarations).toMatch(/flex-wrap:\s*wrap/)
    expect(declarations).toMatch(/overflow:\s*visible/)
  })
})
