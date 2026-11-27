import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveComponentSlugFromPath as resolveFromMatrix } from '~/data/tuffex-framework-matrix'
import {
  isTuffexDocsPath,
  resolveComponentSlugFromPath,
} from './tuffex-component-slug'

const nexusRoot = join(import.meta.dirname, '../..')
const componentDocsDir = join(nexusRoot, 'content/docs/dev/components')

describe('tuffex-component-slug lightweight helper', () => {
  it('agrees 100% with tuffex-framework-matrix across every component doc file', () => {
    const slugs = new Set(
      readdirSync(componentDocsDir)
        .filter(name => name.endsWith('.mdc'))
        .map(name => name.replace(/\.(en|zh)\.mdc$/, '')),
    )

    expect(slugs.size).toBeGreaterThan(150)

    const mismatches: string[] = []
    for (const slug of slugs) {
      for (const path of [
        `/docs/dev/components/${slug}`,
        `/zh/docs/dev/components/${slug}`,
        `/docs/dev/components/${slug}.en`,
      ]) {
        const light = resolveComponentSlugFromPath(path)
        const full = resolveFromMatrix(path)
        if (light !== full)
          mismatches.push(`${path}: light=${String(light)} full=${String(full)}`)
      }
    }

    expect(mismatches).toEqual([])
  })

  it('rejects non-component docs paths and classifies TuffEx docs paths cleanly', () => {
    expect(resolveComponentSlugFromPath('/docs/guide/start')).toBeNull()
    expect(resolveComponentSlugFromPath('/docs/dev/concepts/motion')).toBeNull()
    expect(resolveComponentSlugFromPath('/docs/dev/components/index')).toBeNull()
    expect(resolveComponentSlugFromPath('/docs/dev/components/base-suite')).toBeNull()
    expect(resolveComponentSlugFromPath('/docs/dev/components/avatar-variants')).toBeNull()
    expect(resolveComponentSlugFromPath('/zh/docs/dev/components/button')).toBe('button')

    expect(isTuffexDocsPath('/docs/dev/components/button')).toBe(true)
    expect(isTuffexDocsPath('/zh/docs/dev/tools/tuffex')).toBe(true)
    expect(isTuffexDocsPath('/docs/guide/start')).toBe(false)
  })

  it('keeps tuffex-framework-showcases and tuffex-framework-matrix out of eager hot-path imports', () => {
    const hotPathFiles = [
      'app/components/content/TuffDemoWrapper.vue',
      'app/layouts/docs.vue',
      'app/pages/docs/[...slug].vue',
      'app/components/DocsSidebar.vue',
      'app/composables/useDocsFramework.ts',
    ]

    for (const relPath of hotPathFiles) {
      const source = readFileSync(join(nexusRoot, relPath), 'utf8')
      expect(source, `${relPath} must not statically import tuffex-framework-showcases`).not.toMatch(
        /^\s*import\s+(?!type\b)[\s\S]*?from\s+['"]~\/data\/tuffex-framework-showcases['"]/m,
      )
      expect(source, `${relPath} must not statically import tuffex-framework-matrix`).not.toMatch(
        /^\s*import\s+(?!type\b)[\s\S]*?from\s+['"]~\/data\/tuffex-framework-matrix['"]/m,
      )
    }

    const demoWrapperSource = readFileSync(join(nexusRoot, 'app/components/content/TuffDemoWrapper.vue'), 'utf8')
    expect(demoWrapperSource).toContain("import('~/data/tuffex-framework-showcases')")

    const docsLayoutSource = readFileSync(join(nexusRoot, 'app/layouts/docs.vue'), 'utf8')
    expect(docsLayoutSource).toMatch(/defineAsyncComponent\([^\n]*DocsFrameworkSwitcher\.vue/)

    const docsPageSource = readFileSync(join(nexusRoot, 'app/pages/docs/[...slug].vue'), 'utf8')
    expect(docsPageSource).toMatch(/defineAsyncComponent\([^\n]*DocsFrameworkStatusBar\.vue/)
  })
})
