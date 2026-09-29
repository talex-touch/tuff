import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditVersionChangelog } from '../../../../scripts/audit-version-changelog.mjs'

const TUFFEX_ROOT = process.cwd()
const SRC_DIR = join(TUFFEX_ROOT, 'packages/components/src')

function exportDirs(): string[] {
  const source = readFileSync(join(SRC_DIR, 'components.ts'), 'utf-8')
  return [...source.matchAll(/^export \* from '\.\/([a-z0-9-]+)\/index'/gm)].map(match => match[1]!)
}

describe('tuffex version bump and component lifecycle gate', () => {
  it('covers all exported components in components-lifecycle.json with valid since versions', () => {
    const exportedSlugs = exportDirs()
    const lifecyclePath = join(TUFFEX_ROOT, 'components-lifecycle.json')
    expect(existsSync(lifecyclePath)).toBe(true)

    const lifecycle = JSON.parse(readFileSync(lifecyclePath, 'utf-8'))
    const registeredSlugs = Object.keys(lifecycle.components || {})

    expect(registeredSlugs.sort()).toEqual(exportedSlugs.sort())

    for (const [slug, meta] of Object.entries<any>(lifecycle.components)) {
      expect(meta.since, `${slug} must have a valid since version`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it('passes the version changelog gate for the current package release', () => {
    const pkg = JSON.parse(readFileSync(join(TUFFEX_ROOT, 'package.json'), 'utf-8'))
    const lifecycle = JSON.parse(readFileSync(join(TUFFEX_ROOT, 'components-lifecycle.json'), 'utf-8'))
    const changelogText = readFileSync(join(TUFFEX_ROOT, 'CHANGELOG.md'), 'utf-8')
    const exportedSlugs = exportDirs()

    const problems = auditVersionChangelog({
      currentVersion: pkg.version,
      exportedSlugs,
      lifecycleData: lifecycle,
      changelogText,
    })

    expect(problems).toEqual([])
  })
})
