import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '../../../..')
const componentExportsPath = join(repoRoot, 'packages/tuffex/packages/components/src/components.ts')
const componentDocsDir = join(repoRoot, 'apps/nexus/content/docs/dev/components')
const demoRegistryPath = join(repoRoot, 'apps/nexus/app/components/content/demo-registry.ts')
const demoComponentsDir = join(repoRoot, 'apps/nexus/app/components/content/demos')

const componentExportPattern = /export\s+\*\s+from\s+['"]\.\/([^/'"]+)\/index['"]/g
const tuffDemoWrapperPattern = /TuffDemoWrapper\{[^}\n]*\bdemo=["']([^"']+)["'][^}\n]*\}/g
const demoLoaderPattern = /^\s*([A-Za-z_$][\w$]*):\s*\(\)\s*=>\s*import\(['"]\.\/demos\/([^'"]+\.vue)['"]\),?\s*$/gm

const nonComponentExports = new Set<string>([])

function getExportedComponentSlugs() {
  const source = readFileSync(componentExportsPath, 'utf8')
  return Array.from(source.matchAll(componentExportPattern), match => match[1])
    .filter(slug => !nonComponentExports.has(slug))
    .sort((a, b) => a.localeCompare(b))
}

function docsPath(slug: string, locale: 'en' | 'zh') {
  return join(componentDocsDir, `${slug}.${locale}.mdc`)
}

function missingDocsFor(locale: 'en' | 'zh', slugs: string[]) {
  return slugs.filter(slug => !existsSync(docsPath(slug, locale)))
}

function linkTargetsFor(indexSource: string, locale: 'en' | 'zh') {
  const links = new Map<string, string[]>()
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g

  for (const [, rawTarget] of indexSource.matchAll(linkPattern)) {
    const target = rawTarget.split(/[?#]/, 1)[0]
    const fileName = basename(target)
    const match = fileName.match(new RegExp(`^(.+)\\.${locale}\\.mdc?$`))

    if (!match)
      continue

    const [, slug] = match
    const targets = links.get(slug) ?? []
    targets.push(rawTarget)
    links.set(slug, targets)
  }

  return links
}

function componentDocFiles() {
  return readdirSync(componentDocsDir)
    .filter(fileName => fileName.endsWith('.mdc'))
    .map(fileName => join(componentDocsDir, fileName))
    .sort((a, b) => a.localeCompare(b))
}

function referencedDemosByDoc() {
  const references = new Map<string, string[]>()

  for (const filePath of componentDocFiles()) {
    const source = readFileSync(filePath, 'utf8')
    const demos = Array.from(source.matchAll(tuffDemoWrapperPattern), match => match[1])

    if (demos.length)
      references.set(basename(filePath), demos)
  }

  return references
}

function demoLoadersByName() {
  const registrySource = readFileSync(demoRegistryPath, 'utf8')
  return new Map(
    Array.from(registrySource.matchAll(demoLoaderPattern), match => [match[1], match[2]]),
  )
}

describe('TuffEx component docs coverage', () => {
  it('keeps every exported component covered by English and Chinese docs', () => {
    const componentSlugs = getExportedComponentSlugs()

    expect(componentSlugs, 'components.ts should export component directories for docs coverage').not.toEqual([])
    expect(missingDocsFor('en', componentSlugs), 'missing English component docs').toEqual([])
    expect(missingDocsFor('zh', componentSlugs), 'missing Chinese component docs').toEqual([])
  })

  it('links every documented exported component from each localized hub', () => {
    const componentSlugs = getExportedComponentSlugs()

    for (const locale of ['en', 'zh'] as const) {
      const indexSource = readFileSync(docsPath('index', locale), 'utf8')
      const linkedSlugs = linkTargetsFor(indexSource, locale)
      const documentedSlugs = componentSlugs.filter(slug => existsSync(docsPath(slug, locale)))
      const missingHubLinks = documentedSlugs.filter(slug => !linkedSlugs.has(slug))

      expect(missingHubLinks, `${locale} hub missing component links`).toEqual([])
    }
  })

  it('keeps component docs demo references registered with existing Vue demos', () => {
    const demoReferences = referencedDemosByDoc()
    const demoLoaders = demoLoadersByName()
    const missingRegistryEntries = Array.from(demoReferences.entries()).flatMap(([docFile, demos]) =>
      demos
        .filter(demo => !demoLoaders.has(demo))
        .map(demo => `${docFile}: ${demo}`),
    )
    const missingDemoFiles = Array.from(demoLoaders.entries())
      .filter(([, demoFile]) => !existsSync(join(demoComponentsDir, demoFile)))
      .map(([demo, demoFile]) => `${demo}: ${demoFile}`)

    expect(demoReferences.size, 'component docs should reference demos through TuffDemoWrapper').toBeGreaterThan(0)
    expect(missingRegistryEntries, 'TuffDemoWrapper demo references missing from demo-registry.ts').toEqual([])
    expect(missingDemoFiles, 'demo-registry.ts entries pointing at missing Vue demo files').toEqual([])
  })
  it('requires complete localized documentation contracts for every exported component', () => {
    const componentSlugs = getExportedComponentSlugs()

    for (const locale of ['en', 'zh'] as const) {
      for (const slug of componentSlugs) {
        const source = readFileSync(docsPath(slug, locale), 'utf8')
        const requirements = [
          {
            element: 'a live TuffDemoWrapper reference',
            present: Array.from(source.matchAll(tuffDemoWrapperPattern)).length > 0,
          },
          {
            element: 'a level-two ## API section',
            present: /^## API\s*$/m.test(source),
          },
          {
            element: 'a Props or 属性 heading',
            present: /^#{2,6}\s+(?:(?:.+)\s+)?(?:Props|属性)\s*$/m.test(source),
          },
          {
            element: locale === 'en' ? 'a Best Practices heading' : 'a 最佳实践 heading',
            present: locale === 'en'
              ? /^#{2,6}\s+Best Practices\s*$/m.test(source)
              : /^#{2,6}\s+最佳实践\s*$/m.test(source),
          },
        ]

        for (const { element, present } of requirements)
          expect(present, `${slug}.${locale}.mdc (${locale}/${slug}) missing ${element}`).toBe(true)
      }
    }
  })
})
