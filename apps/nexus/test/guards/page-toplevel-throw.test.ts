import { describe, expect, it } from 'vitest'
import { historicalFixtures, loadHistoricalFixture } from './helpers/fixtures'
import { findTopLevelOccurrences } from './helpers/js-text'
import { fileExists, formatViolations, lineAt, loadSources, readSource } from './helpers/repo'
import { parseSfc } from './helpers/sfc'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 4 — a page never throws unconditionally at `<script setup>` top level.
 *
 * `intelligence-lab.vue` retired itself with a bare
 * `throw createError({ statusCode: 410, fatal: false })`. On a server render
 * that produces an error page, but on a client-side navigation it becomes an
 * unhandled promise rejection inside the suspended setup and the router lands
 * on a route that renders zero characters — a white screen with no error UI.
 *
 * Deliberately narrow: only unconditional top-level throws are reported. The
 * idiomatic Nuxt `if (!data.value) throw createError({ statusCode: 404 })`
 * lives inside a block and is not flagged, because a page that can still render
 * for other inputs is not this bug.
 */

const RULE = 'page-toplevel-throw'
const THROW_KEYWORD = /\bthrow\b/g

export function scanPageTopLevelThrows(files: SourceFile[]): Violation[] {
  const violations: Violation[] = []

  for (const file of files) {
    const { scriptSetup, script } = parseSfc(file.content, file.path)
    for (const block of [scriptSetup, script]) {
      if (!block)
        continue
      for (const offset of findTopLevelOccurrences(block.content, THROW_KEYWORD)) {
        const line = block.startLine + lineAt(block.content, offset) - 1
        const statement = block.content.slice(offset, offset + 120).split('\n')[0]!.trim()
        violations.push({
          file: file.path,
          line,
          rule: RULE,
          message: `\`${statement}\` runs unconditionally while the page's setup evaluates. On a client-side `
            + `navigation this rejects the suspended setup instead of rendering, and the route paints nothing. `
            + `Fix: return navigateTo('/somewhere') for a retired route, or move the throw inside the branch `
            + `that actually cannot render.`,
        })
      }
    }
  }

  return violations
}

function loadPagesAndLayouts(): SourceFile[] {
  return [...loadSources('app/pages', ['.vue']), ...loadSources('app/layouts', ['.vue'])]
}

describe('guard: pages do not throw at setup top level', () => {
  it('flags the shipped white-screen page', () => {
    const entry = historicalFixtures.pageTopLevelThrow
    const violations = scanPageTopLevelThrows([loadHistoricalFixture(entry)])
    expect(violations, entry.expectation).toHaveLength(1)
    expect(violations[0]!.line).toBe(11)
    expect(violations[0]!.message).toContain('throw createError({')
  })

  it('clears the navigateTo rewrite', () => {
    const fixed = 'app/pages/dashboard/admin/intelligence-lab.vue'
    if (!fileExists(fixed))
      return
    expect(formatViolations(scanPageTopLevelThrows([readSource(fixed)]))).toBe('')
  })

  it('does not flag a throw guarded by a branch', () => {
    // Negative control for the depth analysis: without it, the guard would
    // report the officially recommended Nuxt 404 pattern on every detail page.
    const synthetic: SourceFile = {
      path: 'test/guards/synthetic/guarded-throw.vue',
      content: [
        '<script setup lang="ts">',
        'const { data } = await useFetch(\'/api/thing/\' + route.params.id)',
        'if (!data.value)',
        '  throw createError({ statusCode: 404, statusMessage: \'Not found\' })',
        'function reload() {',
        '  throw new Error(\'nope\')',
        '}',
        '</script>',
        '<template><div /></template>',
      ].join('\n'),
    }
    expect(formatViolations(scanPageTopLevelThrows([synthetic]))).toBe('')
  })

  it('is not fooled by the keyword in a comment or a string', () => {
    const synthetic: SourceFile = {
      path: 'test/guards/synthetic/inert-keyword.vue',
      content: [
        '<script setup lang="ts">',
        '// throw createError({ statusCode: 410 }) — removed, see the guard',
        'const hint = \'throw createError\'',
        '</script>',
        '<template><div /></template>',
      ].join('\n'),
    }
    expect(formatViolations(scanPageTopLevelThrows([synthetic]))).toBe('')
  })

  it('reports no unconditional top-level throws in pages or layouts', () => {
    expect(formatViolations(scanPageTopLevelThrows(loadPagesAndLayouts()))).toBe('')
  })
})
