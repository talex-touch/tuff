import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * `SettingSkeleton` deliberately overrides only colour, on the grounds that
 * `TxRowSkeleton`'s geometry defaults already equal `SettingRow`'s. That is a
 * cross-package assumption with nothing holding it in place: `SettingRow` lives
 * in CoreApp, the defaults live in TuffEx, and a change to either silently
 * reintroduces the layout shift the skeleton exists to prevent.
 *
 * So assert it. The values are read out of the compiled CSS rather than the
 * source text, so reformatting the SCSS does not fail the test but changing a
 * number does.
 */
const here = dirname(fileURLToPath(import.meta.url))
// settings -> components -> src -> renderer -> src -> core-app -> apps -> root
const workspaceRoot = resolve(here, '../../../../../../..')

const SETTING_ROW = resolve(here, './SettingRow.vue')
const ROW_SKELETON = resolve(
  workspaceRoot,
  'packages/tuffex/packages/components/src/skeleton/src/TxRowSkeleton.vue'
)

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

function compileStyles(vuePath: string): string {
  const source = readFileSync(vuePath, 'utf8')
  const blocks = [...source.matchAll(STYLE_BLOCK_RE)].map((match) => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)

  return blocks
    .map(
      (block) =>
        sass.compileString(block, {
          // Anchors relative `@use` resolution to the component's own directory.
          url: pathToFileURL(vuePath),
          syntax: 'scss'
        }).css
    )
    .join('\n')
}

/** The body of the first rule whose selector contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}[^{}]*\\{([^}]*)\\}`))
  expect(match, `no rule found for ${selector}`).not.toBeNull()
  return match![1] ?? ''
}

function declaration(css: string, selector: string, property: string): string {
  const body = ruleBody(css, selector)
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`))
  expect(match, `no ${property} on ${selector}`).not.toBeNull()
  return match![1]!.trim()
}

/** Every `var(--x, FALLBACK)` fallback in declaration order. */
function varFallbacks(value: string): string[] {
  return [...value.matchAll(/var\(\s*--[\w-]+\s*,\s*([^)]*)\)/g)].map((m) => m[1]!.trim())
}

describe('setting skeleton geometry contract', () => {
  const settingRowCss = compileStyles(SETTING_ROW)
  const rowSkeletonCss = compileStyles(ROW_SKELETON)

  it("defaults the skeleton row padding to SettingRow's own padding", () => {
    // `padding: 12px 16px` -> ['12px', '16px']
    const real = declaration(settingRowCss, '.SettingRow', 'padding').split(/\s+/)
    expect(real).toHaveLength(2)

    // `padding: var(--...-block, 12px) var(--...-inline, 16px)`
    const skeleton = varFallbacks(declaration(rowSkeletonCss, '.tx-row-skeleton__row', 'padding'))
    expect(skeleton).toHaveLength(2)

    expect(skeleton).toEqual(real)
  })

  it("defaults the skeleton text gap to SettingRow's own text gap", () => {
    const real = declaration(settingRowCss, '.SettingRow-Text', 'gap')
    const skeleton = varFallbacks(declaration(rowSkeletonCss, '.tx-row-skeleton__text', 'gap'))

    expect(skeleton).toEqual([real])
  })

  it("defaults the skeleton row gap to SettingRow's own gap", () => {
    const real = declaration(settingRowCss, '.SettingRow', 'gap')
    const skeleton = varFallbacks(declaration(rowSkeletonCss, '.tx-row-skeleton__row', 'gap'))

    expect(skeleton).toEqual([real])
  })

  it('keeps every geometry default overridable', () => {
    // A hard-coded number here would be unreachable from `SettingSkeleton`, which
    // is what forced each page to hand-roll a skeleton in the first place.
    for (const [selector, property] of [
      ['.tx-row-skeleton__row', 'padding'],
      ['.tx-row-skeleton__row', 'gap'],
      ['.tx-row-skeleton__text', 'gap']
    ] as const) {
      expect(declaration(rowSkeletonCss, selector, property)).toContain('var(--')
    }
  })
})
