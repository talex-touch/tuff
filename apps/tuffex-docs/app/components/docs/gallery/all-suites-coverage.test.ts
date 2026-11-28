import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATEGORY_SUITE_MAP, SUITE_CATEGORY_KEYS, type DocsSuiteKey } from '../../../utils/docs-suites'

const appRoot = join(import.meta.dirname, '../../../..')
const docsDir = join(appRoot, 'content/docs/components')
const suitesDir = join(import.meta.dirname, 'suites')

type GallerySuiteKey = Exclude<DocsSuiteKey, 'concepts' | 'templates'>

const SUITE_FILES: Record<GallerySuiteKey, string> = {
  base: 'GalleryBaseSuite.vue',
  pro: 'GalleryProSuite.vue',
  ai: 'GalleryAiSuite.vue',
  data: 'GalleryDataSuite.vue',
  flow: 'GalleryFlowSuite.vue',
  motion: 'GalleryMotionSuite.vue',
}

function collectDocsBySuite(): Record<GallerySuiteKey, Record<string, string[]>> {
  const result: Record<GallerySuiteKey, Record<string, string[]>> = {
    base: {},
    pro: {},
    ai: {},
    data: {},
    flow: {},
    motion: {},
  }

  for (const file of readdirSync(docsDir)) {
    if (!file.endsWith('.en.mdc'))
      continue
    const slug = file.replace(/\.en\.mdc$/, '')
    if (slug === 'index' || slug.endsWith('-suite'))
      continue
    const content = readFileSync(join(docsDir, file), 'utf8')
    const match = content.match(/^category:\s*["']?([A-Za-z0-9_-]+)["']?/m)
    const category = match?.[1]
    if (!category)
      continue
    const suite = CATEGORY_SUITE_MAP[category]
    if (!suite || suite === 'concepts' || suite === 'templates')
      continue
    result[suite][category] ??= []
    result[suite][category]!.push(slug)
  }

  return result
}

function collectRenderedSlugs(source: string): Set<string> {
  const slugs = new Set<string>()
  for (const m of source.matchAll(/docPath\(['"]([a-z0-9-]+)['"]\)/g))
    slugs.add(m[1]!)
  for (const m of source.matchAll(/(?:slug|doc):\s*['"]([a-z0-9-]+)['"]/g))
    slugs.add(m[1]!)
  return slugs
}

describe('All Suites Gallery 100% Coverage', () => {
  const docsBySuite = collectDocsBySuite()
  const sourceBySuite: Record<GallerySuiteKey, string> = {
    base: readFileSync(join(suitesDir, SUITE_FILES.base), 'utf8'),
    pro: readFileSync(join(suitesDir, SUITE_FILES.pro), 'utf8'),
    ai: readFileSync(join(suitesDir, SUITE_FILES.ai), 'utf8'),
    data: readFileSync(join(suitesDir, SUITE_FILES.data), 'utf8'),
    flow: readFileSync(join(suitesDir, SUITE_FILES.flow), 'utf8'),
    motion: readFileSync(join(suitesDir, SUITE_FILES.motion), 'utf8'),
  }

  it.each(['base', 'pro', 'ai', 'data', 'flow', 'motion'] as const)(
    'covers 100%% of %s suite component docs with zero omissions',
    (suite) => {
      const rendered = collectRenderedSlugs(sourceBySuite[suite])
      const missing: string[] = []
      for (const [category, slugs] of Object.entries(docsBySuite[suite])) {
        for (const slug of slugs.sort()) {
          if (!rendered.has(slug))
            missing.push(`${category}/${slug}`)
        }
      }
      expect(missing, `${suite} suite components missing from ${SUITE_FILES[suite]}`).toEqual([])
    },
  )

  it.each(['base', 'pro', 'ai', 'data'] as const)(
    'renders category section anchors for %s suite in SUITE_CATEGORY_KEYS order',
    (suite) => {
      const source = sourceBySuite[suite]
      const positions = SUITE_CATEGORY_KEYS[suite].map((category) => {
        const marker = `id="${suite}-cat-${category.toLowerCase()}"`
        const index = source.indexOf(marker)
        expect(index, `missing ${marker} in ${SUITE_FILES[suite]}`).toBeGreaterThan(-1)
        return index
      })
      for (let i = 1; i < positions.length; i += 1)
        expect(positions[i]!).toBeGreaterThan(positions[i - 1]!)
    },
  )
})
