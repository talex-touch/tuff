import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: vitest never compiles `<style>`, and a rule that reads
// right in source can still lose to a nesting, a loop or a specificity change.
const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxStatusHint.vue')
const MOTION = '@media (prefers-reduced-motion: no-preference)'
const MASKS = '@supports (mask-composite: intersect)'
const ROOT = '.tx-status-hint'
const GATE = '.tx-status-hint.is-animated'
const EASE = 'var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))'
const SPRING = 'var(--tx-status-hint-spring-duration, 620ms) var(--tx-status-hint-spring, cubic-bezier(0.34, 1.56, 0.64, 1))'

interface Rule {
  selectors: string[]
  declarations: Map<string, string>
  media: string | null
}

const source = readFileSync(SFC, 'utf8')

function compileStyles(): string {
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)
  return blocks
    .map(block => sass.compileString(block, { url: pathToFileURL(SFC), syntax: 'scss' }).css)
    .join('\n')
}

/** Flat rules with the at-rule they sit in. Sass's expanded output never nests a brace inside a declaration block. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  const atRules: string[] = []
  let prelude = ''
  let i = 0
  while (i < css.length) {
    const char = css[i++]!
    if (char === '{') {
      const head = prelude.trim()
      prelude = ''
      if (head.startsWith('@')) {
        atRules.push(head)
        continue
      }
      const end = css.indexOf('}', i)
      const declarations = new Map<string, string>()
      for (const part of css.slice(i, end).split(';')) {
        const colon = part.indexOf(':')
        if (colon > 0)
          declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
      }
      // Top-level commas only: `:is([data-theme=dark], .dark) .x` is one selector.
      rules.push({ selectors: splitList(head), declarations, media: atRules.at(-1) ?? null })
      i = end + 1
    }
    else if (char === '}') {
      atRules.pop()
      prelude = ''
    }
    else {
      prelude += char
    }
  }
  return rules
}

/** Splits on top-level commas, leaving `var(…, cubic-bezier(…))` whole. */
function splitList(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(')
      depth++
    else if (char === ')')
      depth--
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  out.push(current.trim())
  return out
}

/** Property names a rule's transition declarations would animate. */
function transitioned(rule: Rule): string[] {
  const names: string[] = []
  const shorthand = rule.declarations.get('transition')
  if (shorthand && shorthand !== 'none')
    names.push(...splitList(shorthand).map(item => item.split(/\s+/)[0]!))
  const property = rule.declarations.get('transition-property')
  if (property)
    names.push(...splitList(property))
  return names
}

const css = compileStyles()
const rules = parseRules(css)
const keyframes = rules.filter(rule => rule.media?.startsWith('@keyframes'))
const styleRules = rules.filter(rule => !rule.media?.startsWith('@keyframes'))
const gated = styleRules.filter(rule => rule.media === MOTION)

/** What the rules naming `selector` inside `media` declare between them, later rules winning. */
function find(selector: string, media: string | null = null): Map<string, string> | undefined {
  const matching = styleRules.filter(rule => rule.media === media && rule.selectors.includes(selector))
  if (!matching.length)
    return undefined
  const merged = new Map<string, string>()
  for (const rule of matching) {
    for (const [property, value] of rule.declarations)
      merged.set(property, value)
  }
  return merged
}

/** A keyframe set as `[stop, declarations]` pairs, in source order. */
function frames(name: string): Array<[string, Array<[string, string]>]> {
  return keyframes
    .filter(rule => rule.media === `@keyframes ${name}`)
    .map(rule => [rule.selectors.join(', '), [...rule.declarations]])
}

const moving = (rule: Rule) => rule.declarations.has('animation')
  || rule.declarations.has('animation-name')
  || transitioned(rule).length > 0

describe('txStatusHint style contract', () => {
  it('positive control: the compile produced the hint, its wash, its motion and its gate', () => {
    for (const selector of [ROOT, '.tx-status-hint__wash', '.tx-status-hint__icon', '.tx-status-hint__text'])
      expect(find(selector), selector).toBeDefined()
    expect(find('.tx-status-hint__wash', MASKS)).toBeDefined()
    expect(keyframes.length).toBeGreaterThan(0)
    // Three entrance legs plus three legs for each of the two replays.
    expect(gated.filter(rule => rule.declarations.has('animation'))).toHaveLength(9)
    expect(gated.filter(rule => transitioned(rule).length)).toHaveLength(2)
  })

  it('declares every animation and transition under no-preference, on .is-animated', () => {
    // One form (as TxChoiceCard): there is nothing to cancel under `reduce`, and a host that
    // passes `animated=false` drops the class and with it every tween, the leave fade included.
    expect(styleRules.filter(moving).length).toBeGreaterThan(0)
    for (const rule of styleRules.filter(moving)) {
      expect(rule.media, rule.selectors.join(', ')).toBe(MOTION)
      for (const selector of rule.selectors)
        expect(selector.startsWith(GATE), selector).toBe(true)
    }
    expect(styleRules.some(rule => rule.media?.includes('prefers-reduced-motion: reduce'))).toBe(false)
  })

  it('keeps every resting style an end frame', () => {
    // No keyframe set names its end, so each one ends on the resting style: dropping the
    // animations leaves the hint fully drawn and in place, never mid-entrance.
    for (const rule of keyframes)
      expect(['from', '30%'], `${rule.media} ${rule.selectors.join(', ')}`).toContain(rule.selectors.join(', '))

    // The only hidden state is the leave's last frame, and it exists only inside the gate.
    for (const rule of styleRules.filter(rule => rule.declarations.get('opacity') === '0')) {
      expect(rule.media, rule.selectors.join(', ')).toBe(MOTION)
      for (const selector of rule.selectors)
        expect(selector, selector).toContain('.tx-status-hint-leave-to')
    }
  })

  it('moves only compositor properties, and no keyframe reads a custom property', () => {
    const allowed = new Set(['opacity', 'scale', 'rotate', 'translate'])
    for (const rule of keyframes) {
      for (const [property, value] of rule.declarations) {
        expect(allowed.has(property), `${rule.media} { ${property} }`).toBe(true)
        expect(value, `${rule.media} { ${property} }`).not.toContain('var(')
      }
    }
    for (const rule of styleRules) {
      for (const name of transitioned(rule))
        expect(name, rule.selectors.join(', ')).toBe('opacity')
    }
  })

  it('names only keyframes that exist, and replays through two identical sets', () => {
    const names = new Set(keyframes.map(rule => rule.media!.slice('@keyframes '.length)))
    for (const rule of gated) {
      const animation = rule.declarations.get('animation')
      if (animation)
        expect(names.has(animation.split(/\s+/)[0]!), animation).toBe(true)
    }

    // Swapping `is-pulse-a` for `is-pulse-b` restarts the replay only because the names
    // differ; it only looks the same both times because the bodies do not.
    for (const leg of ['wash-bloom', 'icon-pulse', 'text-pulse']) {
      const a = frames(`tx-status-hint-${leg}-a`)
      expect(a.length, leg).toBeGreaterThan(0)
      expect(frames(`tx-status-hint-${leg}-b`), leg).toEqual(a)
    }
    for (const replay of ['a', 'b']) {
      for (const part of ['wash', 'icon', 'text']) {
        const animation = find(`${GATE}.is-pulse-${replay} .tx-status-hint__${part}`, MOTION)?.get('animation')
        expect(animation, `${replay} ${part}`).toMatch(new RegExp(`^tx-status-hint-[a-z-]+-${replay} `))
      }
    }
  })

  it('keeps the calibrated entrance, replay and leave', () => {
    // research/visual-calibration.md, 2026-09-27. Re-run the prototype before moving any of these.
    expect(frames('tx-status-hint-wash-in')).toEqual([['from', [['opacity', '0'], ['scale', '0.3 1']]]])
    expect(frames('tx-status-hint-icon-in')).toEqual([['from', [['scale', '0.4'], ['rotate', '-30deg']]]])
    expect(frames('tx-status-hint-text-in')).toEqual([['from', [['scale', '1.18']]]])
    expect(frames('tx-status-hint-wash-bloom-a')).toEqual([['from', [['opacity', '0.45'], ['scale', '0.72 1']]]])
    expect(frames('tx-status-hint-icon-pulse-a')).toEqual([['30%', [['scale', '1.22']]]])
    expect(frames('tx-status-hint-text-pulse-a')).toEqual([['30%', [['scale', '1.12']]]])

    const animation = (part: string, state = '') => find(`${GATE}${state} .tx-status-hint__${part}`, MOTION)?.get('animation')
    expect(animation('wash')).toBe(`tx-status-hint-wash-in 680ms ${EASE}`)
    // The spring is written onto the root after mount; the fallbacks cover the frames before.
    expect(animation('icon')).toBe(`tx-status-hint-icon-in ${SPRING}`)
    expect(animation('text')).toBe(`tx-status-hint-text-in ${SPRING}`)
    expect(animation('wash', '.is-pulse-a')).toBe(`tx-status-hint-wash-bloom-a 560ms ${EASE}`)
    expect(animation('icon', '.is-pulse-a')).toBe(`tx-status-hint-icon-pulse-a 460ms ${EASE}`)
    expect(animation('text', '.is-pulse-a')).toBe(`tx-status-hint-text-pulse-a 460ms ${EASE}`)

    expect(find(`${GATE}.tx-status-hint-leave-active`, MOTION)?.get('transition')).toBe(`opacity 240ms ${EASE}`)
    for (const part of ['icon', 'text'])
      expect(find(`${GATE}.tx-status-hint-leave-active .tx-status-hint__${part}`, MOTION)?.get('transition'), part).toBe(`opacity 120ms ${EASE}`)

    // Grown from the leading edge: the wash rises out of it and the text lands towards the icon.
    expect(find('.tx-status-hint__wash')?.get('transform-origin')).toBe('0 50%')
    expect(find('.tx-status-hint__text')?.get('transform-origin')).toBe('0 50%')
  })

  it('draws the wash as a gradient intersected with grain, and only where masks can composite', () => {
    // Unmasked, the wash would be a solid block of the accent behind the text.
    const wash = find('.tx-status-hint__wash')!
    expect(wash.has('background') || wash.has('background-color')).toBe(false)

    const masked = find('.tx-status-hint__wash', MASKS)!
    expect(masked.get('background-color')).toBe('var(--tx-status-hint-accent, #67c23a)')
    expect(masked.get('mask-composite')).toBe('intersect')
    expect(masked.get('mask-size')).toBe('100% 100%, 140px 140px')
    expect(masked.get('mask-repeat')).toBe('no-repeat, repeat')

    const [gradient, grain] = splitList(masked.get('mask-image')!)
    expect(gradient).toMatch(/^linear-gradient\(to right, /)
    expect(gradient).toContain('var(--tx-status-hint-wash-strength, 0.26))')
    expect(gradient).toContain('calc(var(--tx-status-hint-wash-strength, 0.26) * 0.45)) 38%')
    expect(gradient).toMatch(/, transparent\)$/)
    for (const piece of ['fractalNoise', 'baseFrequency=\'.85\'', 'numOctaves=\'3\'', 'slope=\'1.6\'', 'intercept=\'-0.2\'', 'width=\'140\''])
      expect(grain, piece).toContain(piece)

    expect(find(ROOT)?.get('--tx-status-hint-wash-strength')).toBe('0.26')
    // A theme selector written as a descendant of the theme root. `:global()` means nothing
    // in an unscoped block and would reach the browser as an invalid selector.
    expect(find(':is([data-theme=dark], .dark) .tx-status-hint')?.get('--tx-status-hint-wash-strength')).toBe('0.2')
    expect(source).not.toContain(':global(')
  })

  it('fades out its end padding, so a long value dissolves instead of being cut', () => {
    const root = find(ROOT)!
    expect(root.get('mask-image')).toBe('linear-gradient(to left, transparent, #000 var(--tx-status-hint-pad-x, 10px))')
    expect(root.get('overflow')).toBe('hidden')
    expect(root.get('white-space')).toBe('nowrap')
    expect(root.get('isolation')).toBe('isolate')
    expect(find('.tx-status-hint__wash')?.get('z-index')).toBe('-1')
  })

  it('reaches nothing outside the component, though the block is not scoped', () => {
    expect(source).toMatch(/<style lang="scss">/)
    for (const rule of styleRules) {
      for (const selector of rule.selectors)
        expect(selector, selector).toMatch(/\.tx-status-hint(?:$|[\s.:>_-])/)
    }
    for (const rule of keyframes)
      expect(rule.media, rule.media!).toMatch(/^@keyframes tx-status-hint-/)
  })

  it('takes each tone from its token, and reads it in the wash and the icon', () => {
    expect(find(ROOT)?.get('--tx-status-hint-accent')).toBe('var(--tx-color-success, #67c23a)')
    const expected = {
      warning: 'var(--tx-color-warning, #e6a23c)',
      danger: 'var(--tx-color-danger, #f56c6c)',
      // Primary, not --tx-color-info (a grey), as in TxStatusBadge.
      info: 'var(--tx-color-primary, #409eff)',
      muted: 'var(--tx-text-color-secondary, #909399)',
    }
    for (const [tone, value] of Object.entries(expected))
      expect(find(`${ROOT}.is-${tone}`)?.get('--tx-status-hint-accent'), tone).toBe(value)

    expect(find('.tx-status-hint__icon')?.get('color')).toBe('var(--tx-status-hint-accent, #67c23a)')
    // The words keep the primary ink on every tone; the table in the SFC records the contrast.
    expect(find(ROOT)?.get('color')).toBe('var(--tx-text-color-primary, #303133)')
  })

  it('gives every var() a fallback and reads only --tx-* properties', () => {
    // A host that loads the component's CSS without variables.scss still gets colour.
    expect(css.match(/var\(--[\w-]+\)/g) ?? []).toEqual([])
    const names = [...css.matchAll(/var\((--[\w-]+)/g)].map(match => match[1]!)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names)
      expect(name.startsWith('--tx-'), name).toBe(true)
  })

  it('sets the two sizes through the root\'s own properties', () => {
    const root = find(ROOT)!
    expect(root.get('font-size')).toBe('13px')
    expect(root.get('line-height')).toBe('18px')
    expect(root.get('gap')).toBe('6px')
    expect(root.get('--tx-status-hint-pad-x')).toBe('10px')
    expect(root.get('--tx-status-hint-pad-y')).toBe('6px')
    expect(root.get('--tx-status-hint-icon-size')).toBe('16px')
    expect(root.get('padding')).toBe('var(--tx-status-hint-pad-y, 6px) var(--tx-status-hint-pad-x, 10px)')
    expect(root.get('border-radius')).toBe('var(--tx-status-hint-radius, 8px)')

    const small = find('.tx-status-hint--sm')!
    expect(small.get('font-size')).toBe('12px')
    expect(small.get('line-height')).toBe('16px')
    expect(small.get('gap')).toBe('5px')
    expect(small.get('--tx-status-hint-pad-x')).toBe('8px')
    expect(small.get('--tx-status-hint-pad-y')).toBe('3px')
    expect(small.get('--tx-status-hint-icon-size')).toBe('14px')

    // The icon box sizes TxIcon's 1em glyph and whatever the slot brings.
    const icon = find('.tx-status-hint__icon')!
    expect(icon.get('font-size')).toBe('var(--tx-status-hint-icon-size, 16px)')
    expect(icon.get('width')).toBe('1em')
    expect(icon.get('height')).toBe('1em')
    expect(icon.get('display')).toBe('inline-flex')
  })

  it('sets the words at 600, with no tracking', () => {
    expect(find(ROOT)?.get('font-weight')).toBe('600')
    for (const rule of styleRules) {
      expect(rule.declarations.has('letter-spacing'), rule.selectors.join(', ')).toBe(false)
      expect(rule.declarations.get('font-weight') ?? '', rule.selectors.join(', ')).not.toMatch(/^(?:700|bold)$/)
    }
  })
})
