import type { TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { resolveDuplicateFileFolderLabels } from './duplicate-file-names'

function fileRow(path: string, title = path.split(/[\\/]/).at(-1) ?? ''): TuffItem {
  return {
    id: path,
    kind: 'file',
    source: { id: 'macos-spotlight-provider', type: 'file' },
    render: { mode: 'default', basic: { title } },
    meta: { file: { path } }
  } as TuffItem
}

function appRow(id: string, title: string): TuffItem {
  return {
    id,
    kind: 'app',
    source: { id: 'app-provider', type: 'application' },
    render: { mode: 'default', basic: { title } }
  } as TuffItem
}

const FONT = 'KaTeX_Caligraphic-Regular-wX97UBjC.ttf'
const TALEX_FONT = `/Users/demo/Workspace/talex-touch/apps/core-app/out/renderer/assets/${FONT}`
const MIKOBOT_FONT = `/Users/demo/Workspace/mikobot/nanobot/web/dist/assets/${FONT}`
const MIKOBOT_RUN_FONT = `/Users/demo/Workspace/mikobot-run/nanobot/web/dist/assets/${FONT}`

describe('resolveDuplicateFileFolderLabels', () => {
  it('labels only the file rows whose name appears more than once', () => {
    const labels = resolveDuplicateFileFolderLabels([
      appRow('app-a', 'Same App'),
      fileRow(TALEX_FONT),
      appRow('app-b', 'Same App'),
      fileRow('/Users/demo/Documents/docs/README.md'),
      fileRow(MIKOBOT_FONT)
    ])

    expect(Object.fromEntries(labels)).toEqual({
      [TALEX_FONT]: '…/renderer/assets',
      [MIKOBOT_FONT]: '…/dist/assets'
    })
  })

  it('goes up past two levels only for the rows two levels leave looking alike', () => {
    const labels = resolveDuplicateFileFolderLabels([
      fileRow(TALEX_FONT),
      fileRow(MIKOBOT_FONT),
      fileRow(MIKOBOT_RUN_FONT)
    ])

    expect(labels.get(TALEX_FONT)).toBe('…/renderer/assets')
    expect(labels.get(MIKOBOT_FONT)).toBe('…/mikobot/nanobot/web/dist/assets')
    expect(labels.get(MIKOBOT_RUN_FONT)).toBe('…/mikobot-run/nanobot/web/dist/assets')
  })

  it('keeps Windows separators', () => {
    const first = 'C:\\Users\\demo\\proj-a\\dist\\assets\\font.ttf'
    const second = 'C:\\Users\\demo\\proj-b\\dist\\assets\\font.ttf'

    const labels = resolveDuplicateFileFolderLabels([fileRow(first), fileRow(second)])

    expect(labels.get(first)).toBe('…\\proj-a\\dist\\assets')
    expect(labels.get(second)).toBe('…\\proj-b\\dist\\assets')
  })

  it('shows a shallow directory whole instead of eliding nothing', () => {
    const shallow = '/tmp/notes.md'
    const deep = '/Users/demo/Documents/notes.md'

    const labels = resolveDuplicateFileFolderLabels([fileRow(shallow), fileRow(deep)])

    expect(labels.get(shallow)).toBe('/tmp')
    expect(labels.get(deep)).toBe('…/demo/Documents')
  })

  it('compares the names the rows display, not their paths', () => {
    const renamed = fileRow('/Users/demo/a/b/report.md', 'Quarterly report')
    const other = fileRow('/Users/demo/c/d/report.md', 'report.md')

    expect(resolveDuplicateFileFolderLabels([renamed, other]).size).toBe(0)
  })

  it('tells a whole page of same-name rows apart, each at the fewest levels it needs', () => {
    // `index.ts` across a monorepo: two levels already tell these rows apart ...
    const monorepo = ['utils', 'tuffex', 'nexus', 'core'].flatMap((pkg) =>
      Array.from({ length: 19 }, (_, index) =>
        fileRow(`/Users/demo/Workspace/talex-touch/packages/${pkg}/src/${pkg}-${index}/index.ts`)
      )
    )
    // ... while these two read `…/hooks/deep` and `…/src/hooks/deep` alike and go up to four.
    const projectA = fileRow('/Users/demo/proj-a/src/hooks/deep/index.ts')
    const projectB = fileRow('/Users/demo/proj-b/src/hooks/deep/index.ts')

    const labels = resolveDuplicateFileFolderLabels([projectA, ...monorepo, projectB])

    expect(labels.size).toBe(78)
    for (const row of monorepo) {
      const folder = row.id.split('/').at(-2)
      expect(labels.get(row.id)).toBe(`…/src/${folder}`)
    }
    expect(labels.get(projectA.id)).toBe('…/proj-a/src/hooks/deep')
    expect(labels.get(projectB.id)).toBe('…/proj-b/src/hooks/deep')
  })
})
