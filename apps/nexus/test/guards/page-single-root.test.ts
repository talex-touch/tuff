import { describe, expect, it } from 'vitest'
import { historicalFixtures, loadHistoricalFixture } from './helpers/fixtures'
import { formatViolations, loadSources } from './helpers/repo'
import { parseSfc } from './helpers/sfc'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 8 — a page template has exactly one root node, comments included.
 *
 * `intelligence-overview.vue` and `intelligence-audits.vue` opened their
 * template with an HTML comment explaining why `<ClientOnly>` must not be the
 * page root, followed by `<AdminPageShell>`. Vue keeps template comments in
 * development, so each page rendered two root nodes. Every admin page declares
 * `pageTransition: { mode: 'out-in' }`; leaving a multi-root page never finishes
 * the leave transition, and the next page never mounts. Navigating from
 * AI Overview to Analytics left `<main>` empty for good. Production builds strip
 * comments by default, which is why it only showed up locally.
 *
 * A root `v-if` / `v-else-if` / `v-else` chain renders one node at a time and
 * counts as a single root.
 */

const RULE = 'page-single-root'

interface RootNode {
  type: number
  tag?: string
  content?: string
  props?: Array<{ type: number, name: string }>
  loc?: { start: { line: number } }
}

function describeRoot(node: RootNode): string {
  if (node.type === 3)
    return 'an HTML comment'
  if (node.type === 1)
    return `<${node.tag}>`
  return 'a text node'
}

function hasDirective(node: RootNode, name: string): boolean {
  return node.type === 1 && (node.props ?? []).some(prop => prop.type === 7 && prop.name === name)
}

function isConditionalChain(nodes: RootNode[]): boolean {
  if (nodes.length < 2 || nodes.some(node => node.type !== 1))
    return false
  return hasDirective(nodes[0]!, 'if')
    && nodes.slice(1).every((node, index, rest) =>
      index === rest.length - 1
        ? hasDirective(node, 'else') || hasDirective(node, 'else-if')
        : hasDirective(node, 'else-if'))
}

export function scanPageSingleRoot(files: SourceFile[]): Violation[] {
  const violations: Violation[] = []

  for (const file of files) {
    const { templateRoot } = parseSfc(file.content, file.path)
    if (!templateRoot)
      continue

    const roots = ((templateRoot.children ?? []) as RootNode[])
      .filter(node => !(node.type === 2 && !(node.content ?? '').trim()))
    if (roots.length <= 1 || isConditionalChain(roots))
      continue

    violations.push({
      file: file.path,
      line: roots[0]!.loc?.start.line ?? 1,
      rule: RULE,
      message: `the template has ${roots.length} root nodes (${roots.map(describeRoot).join(', ')}). `
        + 'Development keeps template comments, so a page like this breaks the `out-in` page transition '
        + 'and the next route never mounts. Fix: keep a single root element; move comments into it or '
        + 'into <script setup>.',
    })
  }

  return violations
}

function synthetic(name: string, template: string): SourceFile {
  return {
    path: `test/guards/synthetic/${name}.vue`,
    content: `<script setup lang="ts">\n</script>\n\n<template>\n${template}\n</template>\n`,
  }
}

describe('guard: a page template has exactly one root node', () => {
  it('flags the shipped multi-root page', () => {
    const entry = historicalFixtures.pageSingleRoot
    const violations = scanPageSingleRoot([loadHistoricalFixture(entry)])
    expect(violations, entry.expectation).toHaveLength(1)
    expect(violations[0]!.line).toBe(19)
    expect(violations[0]!.message).toContain('an HTML comment, <AdminPageShell>')
  })

  it('clears a single root, a comment inside the root, and a root v-if chain', () => {
    // Negative controls: without them, "flags the shipped page" could pass
    // because the scan reports every template.
    const files = [
      synthetic('single-root', '  <AdminPageShell title="x" />'),
      synthetic('comment-inside-root', '  <AdminPageShell title="x">\n    <!-- explanation -->\n    <div />\n  </AdminPageShell>'),
      synthetic('root-if-chain', '  <div v-if="a" />\n  <section v-else-if="b" />\n  <main v-else />'),
    ]
    expect(formatViolations(scanPageSingleRoot(files))).toBe('')
  })

  it('still flags two root elements and a broken conditional chain', () => {
    const files = [
      synthetic('two-elements', '  <div />\n  <footer />'),
      synthetic('if-then-plain', '  <div v-if="a" />\n  <footer />'),
    ]
    expect(scanPageSingleRoot(files)).toHaveLength(2)
  })

  it('reports no multi-root page templates', () => {
    const pages = loadSources('app/pages', ['.vue'])
    // Positive control for the loader: an empty list would make this test pass vacuously.
    expect(pages.length).toBeGreaterThan(50)
    expect(formatViolations(scanPageSingleRoot(pages))).toBe('')
  })
})
