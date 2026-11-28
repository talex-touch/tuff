import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUITE_CATEGORY_KEYS } from '../../../utils/docs-suites'

const appRoot = join(import.meta.dirname, '../../../..')
const galleryMotionPath = join(import.meta.dirname, 'suites/GalleryMotionSuite.vue')
const componentsContentDir = join(appRoot, 'content/docs/components')

function parseMotionTaxonomy(): Record<string, string[]> {
  const result: Record<string, string[]> = Object.fromEntries(
    SUITE_CATEGORY_KEYS.motion.map(category => [category, [] as string[]]),
  )

  for (const file of readdirSync(componentsContentDir).sort()) {
    if (!file.endsWith('.en.mdc'))
      continue
    const content = readFileSync(join(componentsContentDir, file), 'utf8')
    const match = content.match(/^category:\s*(\S+)/m)
    const category = match?.[1]
    if (category && category in result) {
      result[category]!.push(file.slice(0, -'.en.mdc'.length))
    }
  }

  for (const category of SUITE_CATEGORY_KEYS.motion) {
    if (!result[category]?.length)
      throw new Error(`Category ${category} has no component docs in ${componentsContentDir}`)
  }

  return result
}

describe('gallery-motion-suite coverage', () => {
  const source = readFileSync(galleryMotionPath, 'utf8')
  const taxonomy = parseMotionTaxonomy()

  it('renders a dedicated category section for every Motion Suite category in order', () => {
    const sectionPositions = SUITE_CATEGORY_KEYS.motion.map((category) => {
      const marker = `id="motion-cat-${category.toLowerCase()}"`
      const index = source.indexOf(marker)
      expect(index, `missing section marker ${marker} in GalleryMotionSuite.vue`).toBeGreaterThan(-1)
      return index
    })

    for (let i = 1; i < sectionPositions.length; i += 1) {
      expect(sectionPositions[i]!).toBeGreaterThan(sectionPositions[i - 1]!)
    }
  })

  it('covers 100% of Motion Suite components across all 11 categories with no omissions', () => {
    const slugsInTemplate = new Set<string>()
    for (const match of source.matchAll(/docPath\(['"]([a-z0-9-]+)['"]\)/g))
      slugsInTemplate.add(match[1]!)
    for (const match of source.matchAll(/doc:\s*['"]([a-z0-9-]+)['"]/g))
      slugsInTemplate.add(match[1]!)

    const missing: string[] = []
    for (const [category, slugs] of Object.entries(taxonomy)) {
      for (const slug of slugs) {
        if (!slugsInTemplate.has(slug))
          missing.push(`${category}/${slug}`)
      }
    }

    expect(missing, 'Motion Suite components missing from GalleryMotionSuite.vue').toEqual([])
  })
})
