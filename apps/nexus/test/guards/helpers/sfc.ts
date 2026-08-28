import { parse } from '@vue/compiler-sfc'
import { stripCommentsAndStrings } from './js-text'

/**
 * Structural view of the compiler-sfc template AST. Only the fields the guards
 * read are declared, so a Vue minor bump cannot break the guards on a field
 * none of them touch.
 */
export interface TemplateProp {
  /** 6 = plain attribute, 7 = directive (`v-bind`, `v-on`, …). */
  type: number
  name: string
  value?: { content: string }
  arg?: { content?: string }
  exp?: { content?: string }
  modifiers?: Array<{ content: string } | string>
}

export interface TemplateElement {
  type: number
  tag: string
  props: TemplateProp[]
  children?: TemplateNode[]
  loc: { start: { line: number, offset: number } }
}

export type TemplateNode = TemplateElement | { type: number, children?: TemplateNode[] }

export interface BlockRange {
  start: number
  end: number
}

export interface ParsedSfc {
  /** Root of `<template>`, or `undefined` when the file has no template. */
  templateRoot?: TemplateNode
  scriptSetup?: { content: string, startLine: number }
  script?: { content: string, startLine: number }
  styles: Array<{ startLine: number, scoped: boolean, lang?: string }>
  /** Character ranges of the file's blocks, for masking code out of text scans. */
  ranges: { template?: BlockRange, scripts: BlockRange[], styles: BlockRange[] }
  /** Non-fatal parse diagnostics; guards report these rather than silently skipping. */
  errors: string[]
}

const ELEMENT = 1

export function parseSfc(source: string, filename: string): ParsedSfc {
  const { descriptor, errors } = parse(source, { filename })
  const toRange = (block: { loc: { start: { offset: number }, end: { offset: number } } }): BlockRange => ({
    start: block.loc.start.offset,
    end: block.loc.end.offset,
  })
  return {
    templateRoot: descriptor.template?.ast as TemplateNode | undefined,
    scriptSetup: descriptor.scriptSetup
      ? { content: descriptor.scriptSetup.content, startLine: descriptor.scriptSetup.loc.start.line }
      : undefined,
    script: descriptor.script
      ? { content: descriptor.script.content, startLine: descriptor.script.loc.start.line }
      : undefined,
    styles: descriptor.styles.map(style => ({
      startLine: style.loc.start.line,
      scoped: Boolean(style.scoped),
      lang: style.lang,
    })),
    ranges: {
      template: descriptor.template ? toRange(descriptor.template) : undefined,
      scripts: [descriptor.script, descriptor.scriptSetup].filter(Boolean).map(block => toRange(block!)),
      styles: descriptor.styles.map(toRange),
    },
    errors: errors.map(error => String((error as Error).message ?? error)),
  }
}

export function isElement(node: TemplateNode | undefined): node is TemplateElement {
  return Boolean(node) && node!.type === ELEMENT
}

/** Depth-first walk over every element in a template. */
export function walkElements(
  node: TemplateNode | undefined,
  visit: (element: TemplateElement, ancestors: TemplateElement[]) => void,
  ancestors: TemplateElement[] = [],
): void {
  if (!node)
    return
  const nextAncestors = isElement(node) ? [...ancestors, node] : ancestors
  if (isElement(node))
    visit(node, ancestors)
  for (const child of node.children ?? [])
    walkElements(child, visit, nextAncestors)
}

/**
 * Length-preserving mask marking the parts of a file that are not live code, so
 * a text scan can tell a real call from one inside a comment.
 *
 * Applying the JavaScript stripper to a whole `.vue` file is wrong and quietly
 * destructive: in the template, `:text="tt('a.b', 'x')"` is an *expression*
 * wrapped in the attribute's double quotes, and blanking "string bodies" erases
 * it. That silently hid 11 governance keys — and every `t()` written inside a
 * double-quoted binding, repo-wide — from the i18n guard.
 *
 * So the mask is applied per block: JavaScript rules inside `<script>`, HTML
 * comments inside `<template>`, and `<style>` blanked outright.
 */
export function maskInertRegions(source: string, filename: string): string {
  if (!filename.endsWith('.vue'))
    return stripCommentsAndStrings(source)

  const { ranges } = parseSfc(source, filename)
  const out = source.split('')

  const blank = (start: number, end: number): void => {
    for (let index = start; index < end && index < out.length; index += 1) {
      if (out[index] !== '\n')
        out[index] = ' '
    }
  }

  const splice = (start: number, replacement: string): void => {
    for (let index = 0; index < replacement.length; index += 1)
      out[start + index] = replacement[index]!
  }

  for (const range of ranges.scripts)
    splice(range.start, stripCommentsAndStrings(source.slice(range.start, range.end)))

  for (const range of ranges.styles)
    blank(range.start, range.end)

  if (ranges.template) {
    const { start, end } = ranges.template
    const region = source.slice(start, end)
    for (const match of region.matchAll(/<!--[\s\S]*?-->/g)) {
      const offset = start + (match.index ?? 0)
      blank(offset, offset + match[0].length)
    }
  }

  return out.join('')
}

const ATTRIBUTE = 6
const DIRECTIVE = 7

/** True when `<Foo bar>`, `<Foo bar="x">`, `<Foo :bar="x">` or `<Foo v-bind:bar="x">` is present. */
export function hasAttribute(element: TemplateElement, attributeName: string): boolean {
  return element.props.some((prop) => {
    if (prop.type === ATTRIBUTE)
      return prop.name === attributeName
    if (prop.type === DIRECTIVE && prop.name === 'bind')
      return prop.arg?.content === attributeName
    return false
  })
}

/** True when the element listens for `eventName`, written either `@evt` or `v-on:evt`. */
export function hasEventListener(element: TemplateElement, eventName: string): boolean {
  return element.props.some(prop => prop.type === DIRECTIVE && prop.name === 'on' && prop.arg?.content === eventName)
}

/** True for `v-bind="obj"` / `v-on="obj"`, where individual attribute names are not statically visible. */
export function hasSpreadBinding(element: TemplateElement): boolean {
  return element.props.some(prop => prop.type === DIRECTIVE && (prop.name === 'bind' || prop.name === 'on') && !prop.arg)
}
