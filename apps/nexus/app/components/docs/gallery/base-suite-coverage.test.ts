import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUITE_CATEGORY_KEYS } from '~/utils/docs-suites'

const nexusRoot = join(import.meta.dirname, '../../../..')
const galleryBasePath = join(import.meta.dirname, 'GalleryBaseSuite.vue')
const taxonomyScriptPath = join(nexusRoot, 'scripts/recategorize-component-docs.py')

function parseBaseTaxonomy(): Record<string, string[]> {
  const py = readFileSync(taxonomyScriptPath, 'utf8')
  const result: Record<string, string[]> = {}
  for (const category of SUITE_CATEGORY_KEYS.base) {
    const match = py.match(new RegExp(`"${category}":\\s*\\[([\\s\\S]*?)\\],`))
    if (!match)
      throw new Error(`Category ${category} missing in recategorize-component-docs.py`)
    result[category] = Array.from(match[1]!.matchAll(/"([a-z0-9-]+)"/g), m => m[1]!)
  }
  return result
}

describe('GalleryBaseSuite coverage', () => {
  const source = readFileSync(galleryBasePath, 'utf8')
  const taxonomy = parseBaseTaxonomy()

  it('renders a dedicated category section for every Basics Suite category in order', () => {
    const sectionPositions = SUITE_CATEGORY_KEYS.base.map((category) => {
      const marker = `id="base-cat-${category.toLowerCase()}"`
      const index = source.indexOf(marker)
      expect(index, `missing section marker ${marker} in GalleryBaseSuite.vue`).toBeGreaterThan(-1)
      return index
    })

    for (let i = 1; i < sectionPositions.length; i += 1) {
      expect(sectionPositions[i]!).toBeGreaterThan(sectionPositions[i - 1]!)
    }
  })

  it('covers 100% of Basics Suite components across all 7 categories with no omissions', () => {
    const slugsInTemplate = new Set<string>()
    for (const match of source.matchAll(/docPath\(['"]([a-z0-9-]+)['"]\)/g))
      slugsInTemplate.add(match[1]!)
    for (const match of source.matchAll(/slug:\s*['"]([a-z0-9-]+)['"]/g))
      slugsInTemplate.add(match[1]!)

    const missing: string[] = []
    for (const [category, slugs] of Object.entries(taxonomy)) {
      for (const slug of slugs) {
        if (!slugsInTemplate.has(slug))
          missing.push(`${category}/${slug}`)
      }
    }

    expect(missing, 'Basics Suite components missing from GalleryBaseSuite.vue').toEqual([])
  })
})
