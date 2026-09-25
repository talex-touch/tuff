// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const variables = readFileSync(resolve(here, '../../style/variables.scss'), 'utf8')

/**
 * The normal dark block's fill tints (`-light-8` / `-light-9`) are what soft
 * badges, banners and selected rows paint with. They were copied from the light
 * theme as mixes toward white, so on the dark page every such fill came out as a
 * light tile. They now mix toward the dark surface, like the hand-picked primary
 * ramp (`#18222c` is primary 10% over `#141414`).
 */
function normalDarkBlock(): string {
  const start = variables.indexOf("[data-theme='dark'],\n.dark {")
  expect(start, 'normal dark token block').toBeGreaterThan(-1)
  let depth = 0
  let i = variables.indexOf('{', start)
  const open = i
  for (; i < variables.length; i++) {
    if (variables[i] === '{')
      depth++
    else if (variables[i] === '}' && --depth === 0)
      break
  }
  return variables.slice(open, i)
}

const FILL_TINTS = [
  '--tx-color-primary-light-8',
  '--tx-color-success-light-8',
  '--tx-color-success-light-9',
  '--tx-color-warning-light-8',
  '--tx-color-warning-light-9',
  '--tx-color-info-light-8',
  '--tx-color-info-light-9',
]

describe('dark fill tints', () => {
  const block = normalDarkBlock()

  it.each(FILL_TINTS)('%s mixes toward the dark surface, not white', (token) => {
    const declarations = [...block.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))].map(m => m[1]!.trim())
    expect(declarations, `${token} declared in the dark block`).toHaveLength(1)
    // Its own hue, at the primary ramp's share for the step: -light-9 is 10%, -light-8 is 20%.
    const [, hue, step] = token.match(/^--tx-color-([a-z]+)-light-(\d)$/)!
    const share = step === '9' ? 10 : 20
    expect(declarations[0]).toBe(`color-mix(in srgb, var(--tx-color-${hue}) ${share}%, var(--tx-bg-color, #141414))`)
    expect(declarations[0]).not.toContain('white')
  })
})
