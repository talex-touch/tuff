import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * The composer's style contract, checked against the compiled style block rather
 * than the source, so a rule that moves into a mixin or a grouped selector is
 * still found. Motion and hover are the load-bearing parts: design rules ›
 * Motion forbids colour in any transition a hover can fire, and every transition
 * needs a reduced-motion escape.
 */
const here = dirname(fileURLToPath(import.meta.url))
const COMPONENT = resolve(here, '../src/TxChatComposer.vue')

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

function compileStyles(vuePath: string): string {
  const source = readFileSync(vuePath, 'utf8')
  const blocks = [...source.matchAll(STYLE_BLOCK_RE)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)

  return blocks
    .map(block => sass.compileString(block, {
      url: pathToFileURL(vuePath),
      syntax: 'scss',
    }).css)
    .join('\n')
}

interface Rule { selectors: string[], body: string }

function parseRules(css: string): Rule[] {
  return [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1]!.split(',').map(selector => selector.trim()).filter(Boolean),
    body: match[2]!,
  }))
}

/** Every declaration block that names `selector` exactly, in or out of a group. */
function bodyOf(rules: Rule[], selector: string): string {
  const found = rules.filter(rule => rule.selectors.includes(selector))
  expect(found.length, `${selector} is not in the compiled stylesheet`).toBeGreaterThan(0)
  return found.map(rule => rule.body).join('\n')
}

const REDUCED = '@media (prefers-reduced-motion: reduce)'

describe('txChatComposer style contract', () => {
  const css = compileStyles(COMPONENT)
  const reducedAt = css.indexOf(REDUCED)
  const base = parseRules(reducedAt >= 0 ? css.slice(0, reducedAt) : css)
  const reduced = parseRules(reducedAt >= 0 ? css.slice(reducedAt) : '')

  it('positive control: the compile produced the shell, card and tray rules', () => {
    expect(css.length).toBeGreaterThan(2000)
    expect(bodyOf(base, '.tx-chat-composer')).toContain('position: relative')
    expect(bodyOf(base, '.tx-chat-composer__card')).toContain('z-index: 1')
    expect(bodyOf(base, '.tx-chat-composer__tray')).toContain('min-height')
  })

  it('never transitions a colour, so no hover can ease its ink or plate', () => {
    const transitions = [...css.matchAll(/transition(?:-property)?:\s*([^;]+);/g)].map(match => match[1]!)
    expect(transitions.length).toBeGreaterThan(0)
    for (const value of transitions) {
      expect(value).not.toMatch(/\ball\b|color|background|border/)
    }
  })

  it('changes only the attach button ink on hover, with no plate', () => {
    const hover = bodyOf(base, '.tx-chat-composer__attach:hover:not(:disabled)')
    expect(hover).toMatch(/color:\s*var\(--tx-text-color-primary/)
    expect(hover).not.toMatch(/background|box-shadow|border|transition/)

    const rest = bodyOf(base, '.tx-chat-composer__attach')
    expect(rest).toMatch(/color:\s*var\(--tx-text-color-secondary/)
    expect(rest).toContain('background: transparent')
  })

  it('declares a transition on no hover rule', () => {
    for (const rule of base.filter(candidate => candidate.selectors.some(selector => selector.includes(':hover'))))
      expect(rule.body).not.toContain('transition')
  })

  it('fades the leaving tray out of flow, pinned to its own side, with a slight blur', () => {
    const active = bodyOf(base, '.tx-chat-composer-tray-leave-active')
    expect(active).toContain('position: absolute')
    expect(active).toMatch(/transition:\s*opacity 200ms ease-out, filter 200ms ease-out/)
    expect(bodyOf(base, '.tx-chat-composer-tray-leave-active.is-top')).toContain('top: 0')
    expect(bodyOf(base, '.tx-chat-composer-tray-leave-active.is-bottom')).toContain('bottom: 0')

    const to = bodyOf(base, '.tx-chat-composer-tray-leave-to')
    expect(to).toMatch(/opacity:\s*0\b/)
    expect(to).toContain('filter: blur(2px)')
  })

  it('gives the arriving tray no enter styles: the card uncovers it, nothing fades it in', () => {
    expect(css).not.toContain('tx-chat-composer-tray-enter')
    expect(bodyOf(base, '.tx-chat-composer__tray')).not.toMatch(/opacity|transition|animation/)
  })

  it('cuts the tray fade and the press scale under prefers-reduced-motion', () => {
    expect(reducedAt).toBeGreaterThanOrEqual(0)
    for (const selector of ['.tx-chat-composer-tray-leave-active', '.tx-chat-composer__attach', '.tx-chat-composer__send'])
      expect(bodyOf(reduced, selector)).toContain('transition: none')
  })

  it('answers every transition, including one added later, with a reduced-motion stop', () => {
    const stopped = reduced
      .filter(rule => /transition:\s*none\b/.test(rule.body))
      .flatMap(rule => rule.selectors)
    const moving = base.filter(rule => /transition(?:-property)?:\s*(?!none\b)/.test(rule.body))
    expect(moving.length).toBeGreaterThan(0)
    for (const rule of moving) {
      for (const selector of rule.selectors)
        expect(stopped, `${selector} transitions with no reduced-motion stop`).toContain(selector)
    }
  })

  it('draws the card as a ring plus one elevation step, never a border', () => {
    const card = bodyOf(base, '.tx-chat-composer__card')
    expect(card).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--tx-border-color-lighter[^;]*var\(--tx-elevation-1/)
    expect(card).not.toMatch(/(?:^|\s)border:/)
    expect(bodyOf(base, '.tx-chat-composer__card:focus-within')).toMatch(/inset 0 0 0 1px var\(--tx-border-color,/)
  })

  it('paints the card opaque, because --tx-fill-color-blank is transparent in dark', () => {
    const card = bodyOf(base, '.tx-chat-composer__card')
    expect(card).toMatch(/background-color:\s*var\(--tx-bg-color/)
    expect(card).toMatch(/background-image:\s*linear-gradient\(var\(--tx-fill-color-blank/)
  })

  it('fills the shell only with a tray, and clips it only while it resizes', () => {
    const shell = bodyOf(base, '.tx-chat-composer')
    expect(shell).not.toMatch(/background|overflow/)
    expect(bodyOf(base, '.tx-chat-composer.has-tray')).toMatch(/background:\s*var\(--tx-fill-color-light/)
    expect(bodyOf(base, '.tx-chat-composer.is-resizing')).toContain('overflow: hidden')
  })

  it('lets the textarea inherit the page font and grow between minRows and maxRows', () => {
    const textarea = bodyOf(base, '.tx-chat-composer__textarea')
    // The UA's monospace textarea face was showing through the placeholder.
    expect(textarea).toContain('font: inherit')
    expect(textarea).toContain('field-sizing: content')
    expect(textarea).toContain('resize: none')
    expect(textarea).toMatch(/border:\s*0\b/)
    expect(textarea).toMatch(/min-height:\s*calc\(var\(--tx-chat-composer-min-rows/)
    expect(textarea).toMatch(/max-height:\s*calc\(var\(--tx-chat-composer-max-rows/)
    // `font: inherit` resets size and leading, so they must come after it.
    expect(textarea.indexOf('font-size')).toBeGreaterThan(textarea.indexOf('font: inherit'))
    expect(textarea.indexOf('line-height')).toBeGreaterThan(textarea.indexOf('font: inherit'))
  })
})
