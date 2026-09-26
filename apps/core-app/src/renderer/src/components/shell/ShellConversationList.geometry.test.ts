import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * Nothing writes a loaded row's height down. Nav items, project folders and nested conversation rows
 * all take it from their label: one line of `--shell-fs-body` type in the line-height the sidebar
 * inherits, plus the shared vertical padding and 1px borders. That line is taller than the 16px icon
 * (19.5px of 13px type at the page's 1.5), so those rows measure 33.5px.
 *
 * The loading skeleton stands in for the folders, so its rows must get their height the same way. The
 * first version did not: it floored each row at icon + padding + border (30px) and had no line of
 * text, so every placeholder was 3.5px short and each folder after the first landed lower than the
 * row it replaced. The test it shipped with compared the two sides' declarations and passed, because
 * both declared that floor — which is not what sizes a loaded row.
 *
 * So this checks where the height comes from: the skeleton's name column is one line (`1lh`) of the
 * labels' type; nothing on either side restates the line-height or font the line inherits; and the
 * skeleton declares no other height for a hand-kept number to hide in.
 *
 * The rendered height is not asserted here. jsdom does no layout — every box measures 0, and inherited
 * line-heights are never resolved — and the number itself depends on a line-height set page-wide,
 * outside these components, and on the platform's font metrics. It is measured in the real renderer
 * instead: the task's CDP walkthrough snapshots skeleton rows and folder rows across a renderer reload
 * and requires the same tops and heights.
 *
 * Read from the compiled CSS, as SettingSkeleton.geometry.test.ts does: reformatting the SCSS passes,
 * changing a metric fails.
 */
const here = dirname(fileURLToPath(import.meta.url))

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

function compileStyles(file: string): string {
  const vuePath = resolve(here, file)
  const blocks = [...readFileSync(vuePath, 'utf8').matchAll(STYLE_BLOCK_RE)].map(
    (match) => match[1] ?? ''
  )
  expect(blocks.length).toBeGreaterThan(0)
  return blocks
    .map((block) => sass.compileString(block, { url: pathToFileURL(vuePath), syntax: 'scss' }).css)
    .join('\n')
}

/** Splits at `separator` outside parentheses, so `calc(a + b)` and `:not(.a, .b)` stay whole. */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    else if (char === ')') depth--
    if (depth === 0 && separator.test(char)) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

interface CssRule {
  selector: string
  declarations: Map<string, string>
}

/** One entry per selector of every style rule, at-rule bodies included. */
function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, selectorList, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>()
    for (const part of body!.split(';')) {
      const colon = part.indexOf(':')
      if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
    }
    for (const selector of splitTopLevel(selectorList!, /,/)) rules.push({ selector, declarations })
  }
  return rules
}

/** The classes of the element a selector styles: its last compound, pseudo-class arguments dropped. */
function subjectClasses(selector: string): string[] {
  let subject = splitTopLevel(selector.replace(/:deep\(([^)]*)\)/g, ' $1'), /[\s>+~]/).at(-1) ?? ''
  while (/\([^()]*\)/.test(subject)) subject = subject.replace(/\([^()]*\)/g, '')
  return [...subject.matchAll(/\.([\w-]+)/g)].map((match) => match[1]!)
}

const rules = [
  './ShellSidebar.vue',
  './ShellNavItem.vue',
  './ShellConversationList.vue',
  './ShellProjectFolder.vue',
  './ShellProjectRows.vue'
].flatMap((file) => parseRules(compileStyles(file)))

/**
 * Every value declared for `property` on elements of `className`. Rules under `.is-rail` are left
 * out: the rail hides the whole list, skeleton included (asserted below), so its type never meets it.
 */
function values(className: string, property: string): string[] {
  return rules
    .filter(
      ({ selector }) =>
        !/\.is-rail\b/.test(selector) && subjectClasses(selector).includes(className)
    )
    .flatMap(({ declarations }) => declarations.get(property) ?? [])
}

function declared(className: string, property: string): string {
  const found = [...new Set(values(className, property))]
  expect(found, `${property} on .${className}`).toHaveLength(1)
  return found[0]!
}

/** Top and bottom of a `padding` shorthand. */
function blockPadding(padding: string): [string, string] {
  const sides = splitTopLevel(padding, /\s/)
  return [sides[0]!, sides[sides.length > 2 ? 2 : 0]!]
}

const SKELETON_ROW = 'ShellConversationList-SkeletonRow'
const SKELETON_NAME = 'ShellConversationList-SkeletonName'

/** The element holding each loaded row's line of text. */
const LOADED_LABELS = ['ShellNavItem-Label', 'ShellProjectFolder-Name', 'ShellProjectRows-Open']

/**
 * Every element a line passes its line-height and font down through inside the sidebar, on either
 * side. `.ShellSidebar` is left off: whatever it sets, both sides inherit alike.
 */
const LINE_CHAIN = [
  'ShellSidebar-Context',
  'ShellSidebar-Nav',
  'ShellNavItem',
  'ShellNavItem-Label',
  'ShellConversationList',
  'ShellConversationList-Section',
  'ShellConversationList-Section--projects',
  'ShellConversationList-Section--chats',
  'ShellConversationList-Skeleton',
  SKELETON_ROW,
  SKELETON_NAME,
  'ShellProjectFolder',
  'ShellProjectFolder-Row',
  'ShellProjectFolder-Name',
  'ShellProjectFolder-Children',
  'ShellProjectRows-Row',
  'ShellProjectRows-Open',
  'ShellProjectRows-Session'
]

describe('shell conversation list skeleton geometry', () => {
  it("makes a skeleton row's name column one line of a loaded label's type", () => {
    const size = declared(SKELETON_NAME, 'font-size')

    for (const label of LOADED_LABELS) {
      expect(declared(label, 'font-size'), label).toBe(size)
    }
    expect(declared(SKELETON_NAME, 'height')).toBe('1lh')
  })

  it('lets both sides inherit the one line-height and font', () => {
    for (const className of LINE_CHAIN) {
      expect(values(className, 'line-height'), className).toEqual([])
      expect(values(className, 'font'), className).toEqual([])
      for (const family of values(className, 'font-family')) {
        expect(family, className).toBe('inherit')
      }
    }
  })

  it('declares no height on the skeleton side but that line', () => {
    const heights = ['height', 'min-height', 'max-height', 'block-size', 'min-block-size']
    for (const property of heights) {
      expect(values(SKELETON_ROW, property), property).toEqual([])
      expect(values('ShellConversationList-Skeleton', property), property).toEqual([])
      if (property !== 'height') {
        expect(values(SKELETON_NAME, property), property).toEqual([])
      }
    }

    // Edges on the name column would add to its line; the row's padding and border are the only ones.
    const edges = [
      'padding',
      'padding-top',
      'padding-bottom',
      'padding-block',
      'border',
      'border-top',
      'border-bottom',
      'border-block',
      'border-width',
      'margin',
      'margin-top',
      'margin-bottom',
      'margin-block'
    ]
    for (const property of edges) {
      expect(values(SKELETON_NAME, property), property).toEqual([])
    }
  })

  it("draws a skeleton row in a loaded row's vertical box", () => {
    const padY = 'var(--shell-row-pad-y)'
    // The padding around each side's line: the skeleton and nav rows pad themselves; a folder row
    // and a nested row pad the button that holds their text.
    const lineBoxes = [
      SKELETON_ROW,
      'ShellNavItem',
      'ShellProjectFolder-Name',
      'ShellProjectRows-Open'
    ]
    for (const box of lineBoxes) {
      expect(blockPadding(declared(box, 'padding')), box).toEqual([padY, padY])
    }

    const border = declared(SKELETON_ROW, 'border')
    for (const row of ['ShellNavItem', 'ShellProjectFolder-Row', 'ShellProjectRows-Row']) {
      expect(declared(row, 'border'), row).toBe(border)
    }
  })

  it('leaves the rail out: the rail hides the whole list, skeleton included', () => {
    const rail = rules.find(({ selector }) => selector === '.is-rail .ShellConversationList')
    expect(rail?.declarations.get('display')).toBe('none')
  })
})

/**
 * Visibility and motion that only CSS decides. jsdom resolves neither `:hover` nor transitions, so
 * the contract is read from the compiled rules; the real window shows the result.
 */
describe('shell list action styles', () => {
  it('shows the Chats title + under the pointer, on keyboard focus, and while ⌘ hints show', () => {
    const reveal = 'ShellConversationList-SectionAction--reveal'
    const own = rules.filter(({ selector }) => selector === `.${reveal}`)
    expect(own.map(({ declarations }) => declarations.get('opacity'))).toEqual(['0'])

    const shownBy = rules
      .filter(
        ({ selector, declarations }) =>
          subjectClasses(selector).includes(reveal) && declarations.get('opacity') === '1'
      )
      .map(({ selector }) => selector)
      .sort()
    expect(shownBy).toEqual(
      [
        `.${reveal}:focus-visible`,
        `.ShellConversationList-SectionHeader:has(.MetaHintBadge) .${reveal}`,
        `.ShellConversationList-SectionHeader:hover .${reveal}`
      ].sort()
    )
    // Hidden by opacity alone: it keeps its box and stays reachable by Tab.
    for (const property of ['display', 'visibility']) {
      expect(values(reveal, property), property).toEqual([])
    }
  })

  it('runs the armed delete from the icon slot to the label, and not under reduced motion', () => {
    const css = compileStyles('./ShellProjectRows.vue')
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/.exec(css)
    expect(reduced, 'reduced-motion block').not.toBeNull()
    const reducedRules = parseRules(reduced![1]!)
    const outside = parseRules(css.replace(reduced![0], ''))

    const base = outside.find(({ selector }) => selector === '.ShellProjectRows-Delete')
    expect(base?.declarations.get('interpolate-size')).toBe('allow-keywords')
    expect(base?.declarations.get('transition')).toMatch(/\bwidth\b/)

    const armed = outside.find(({ selector }) => selector === '.ShellProjectRows-Delete.is-armed')
    expect(armed?.declarations.get('width')).toBe('auto')
    // Same slot height as the icon it replaces, so the row does not grow.
    for (const property of ['height', 'min-height', 'line-height', 'margin']) {
      expect(armed?.declarations.has(property), property).toBe(false)
    }
    expect(declared('ShellProjectRows-Action', 'height')).toBe('24px')

    const calm = reducedRules.find(({ selector }) => selector === '.ShellProjectRows-Delete')
    expect(calm?.declarations.get('transition')).toBeDefined()
    expect(calm?.declarations.get('transition')).not.toMatch(/\b(width|padding)\b/)
  })
})
