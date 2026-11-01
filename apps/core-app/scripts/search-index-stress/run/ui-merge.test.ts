import { describe, expect, it } from 'vitest'
import type { SearchRow } from './driver-types'
import { createMatcher, findRank, normalizeName } from './matching'
import type { RowItem } from './ui-merge'
import { MAX_RENDERED_RESULTS, MIN_SLOTS_PER_SOURCE, RenderedRows } from './ui-merge'

function item(id: string, sourceId: string, score: number, extra: Partial<RowItem> = {}): RowItem {
  return {
    id,
    kind: sourceId === 'file-provider' ? 'file' : 'app',
    title: id,
    sourceId,
    sourceType: sourceId === 'file-provider' ? 'file' : 'application',
    appPath: null,
    filePath: null,
    score,
    pinned: false,
    matchType: null,
    ...extra
  }
}

const semantic = (id: string, score: number): RowItem =>
  item(id, 'file-provider', score, { matchType: 'semantic' })
const ids = (rows: RowItem[]): string[] => rows.map((row) => row.id)

function run(snapshot: RowItem[], ...updates: RowItem[][]): RowItem[] {
  const rows = new RenderedRows()
  rows.applySnapshot(snapshot)
  for (const batch of updates) rows.applyUpdate(batch)
  return rows.visible
}

describe('RenderedRows mirrors the CoreBox list (useSearch.rank.test.ts cases)', () => {
  it('inserts a late semantic hit above a weak history hit', () => {
    expect(
      ids(run([item('deploy.sh', 'file-provider', 10)], [semantic('IMG_9f3a2048.png', 500)]))
    ).toEqual(['IMG_9f3a2048.png', 'deploy.sh'])
  })

  it('never promotes a semantic arrival past stronger literals that arrived before it', () => {
    const rows = run(
      [item('weak-history', 'file-provider', 10)],
      [item('late-literal', 'file-provider', 900)],
      [item('another-literal', 'file-provider', 1_000), semantic('semantic-cat', 500)]
    )
    expect(ids(rows)).toEqual(['weak-history', 'late-literal', 'another-literal', 'semantic-cat'])
  })

  it('keeps an equal-score row ahead of a late semantic arrival and inserts after a stronger row', () => {
    expect(
      ids(
        run(
          [item('existing-equal', 'file-provider', 500), item('weak-history', 'file-provider', 10)],
          [semantic('semantic-cat', 500)]
        )
      )
    ).toEqual(['existing-equal', 'semantic-cat', 'weak-history'])
    expect(
      ids(
        run(
          [
            item('weak', 'file-provider', 100),
            item('exact', 'file-provider', 20_000_000),
            item('tailweak', 'file-provider', 50)
          ],
          [semantic('semantic', 5_000_000)]
        )
      )
    ).toEqual(['weak', 'exact', 'semantic', 'tailweak'])
  })

  it('orders one arriving batch by score and appends later batches in arrival order', () => {
    const rows = run(
      [item('app-top', 'app-provider', 900)],
      [
        item('file-low', 'file-provider', 10),
        item('file-high', 'file-provider', 300),
        item('file-mid', 'file-provider', 100)
      ],
      [item('link-second', 'quicklinks-provider', 1_000)]
    )
    expect(ids(rows)).toEqual(['app-top', 'file-high', 'file-mid', 'file-low', 'link-second'])
  })

  it('refreshes a re-sent row in place and never duplicates it', () => {
    const rows = run(
      [item('app-top', 'app-provider', 900), item('file-buried', 'file-provider', 10)],
      [item('file-buried', 'file-provider', 950)],
      [item('file-twice', 'file-provider', 10), item('file-twice', 'file-provider', 20)]
    )
    expect(ids(rows)).toEqual(['app-top', 'file-buried', 'file-twice'])
    expect(rows[1].score).toBe(950)
    expect(rows[2].score).toBe(20)
  })

  it('keeps pinned rows on top and places a pinned arrival after the pinned rows on screen', () => {
    expect(
      ids(
        run(
          [item('app-top', 'app-provider', 900), item('app-mid', 'app-provider', 400)],
          [item('file-pinned', 'file-provider', 1, { pinned: true })]
        )
      )
    ).toEqual(['file-pinned', 'app-top', 'app-mid'])
    expect(
      ids(
        run(
          [
            item('app-pinned', 'app-provider', 5, { pinned: true }),
            item('app-top', 'app-provider', 900)
          ],
          [
            item('file-plain', 'file-provider', 950),
            item('file-pinned', 'file-provider', 1, { pinned: true })
          ]
        )
      )
    ).toEqual(['app-pinned', 'file-pinned', 'app-top', 'file-plain'])
  })

  it('reserves a per-source floor when the merged set exceeds the render cap', () => {
    const apps = Array.from({ length: 80 }, (_, index) =>
      item(`app-${index}`, 'app-provider', 1_000 - index)
    )
    const files = Array.from({ length: 10 }, (_, index) =>
      item(`file-${index}`, 'file-provider', 10 - index)
    )
    const rows = ids(run(apps, files))
    expect(rows).toHaveLength(MAX_RENDERED_RESULTS)
    expect(rows.filter((id) => id.startsWith('file-'))).toEqual([
      'file-0',
      'file-1',
      'file-2',
      'file-3',
      'file-4',
      'file-5'
    ])
    expect(rows.slice(0, 5)).toEqual(['app-0', 'app-1', 'app-2', 'app-3', 'app-4'])
    expect(rows).not.toContain('app-79')
  })

  it('keeps the tail source of one wide batch alive', () => {
    const batch = [
      ...Array.from({ length: 90 }, (_, index) =>
        item(`file-${index}`, 'file-provider', 900 - index)
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        item(`link-${index}`, 'quicklinks-provider', 10 - index)
      )
    ]
    const rows = ids(run([item('app-only', 'app-provider', 10_000)], batch))
    expect(rows).toHaveLength(MAX_RENDERED_RESULTS)
    expect(rows.filter((id) => id.startsWith('link-'))).toHaveLength(MIN_SLOTS_PER_SOURCE)
    expect(rows[0]).toBe('app-only')
  })

  it('drops the file entry of an app bundle once the app provider delivers the app, and the reverse', () => {
    const app = item('com.apple.Safari', 'app-provider', 800, {
      kind: 'app',
      appPath: '/Applications/Safari.app'
    })
    const bundleAsFile = item('/Applications/Safari.app', 'file-provider', 100, {
      kind: 'file',
      filePath: '/Applications/Safari.app'
    })
    expect(ids(run([app], [bundleAsFile]))).toEqual(['com.apple.Safari'])
    expect(ids(run([bundleAsFile], [app]))).toEqual(['com.apple.Safari'])
  })

  it('cuts one incoming batch at 200 rows before merging', () => {
    const wide = Array.from({ length: 260 }, (_, index) =>
      item(`f-${index}`, 'file-provider', 1_000 - index)
    )
    const rows = new RenderedRows()
    rows.applySnapshot([])
    rows.applyUpdate(wide)
    expect(rows.visible).toHaveLength(MAX_RENDERED_RESULTS)
    expect(ids(rows.visible)[0]).toBe('f-0')
  })
})

describe('target matching', () => {
  const root = '/Users/Shared/tuff-stress/run1/corpus'
  const row = (partial: Partial<SearchRow> & Pick<SearchRow, 'name'>): SearchRow => ({
    id: partial.path ?? partial.name,
    kind: 'file',
    sourceId: 'file-provider',
    score: 1,
    ...partial
  })

  it('matches an app by title or by bundle file name, ignoring case, NFC and the .app suffix', () => {
    const matcher = createMatcher({ kind: 'app', name: 'Système Réglages' }, [root])
    expect(matcher.matches(row({ kind: 'app', name: 'système réglages' }))).toBe(true)
    expect(
      matcher.matches(
        row({ kind: 'app', name: 'Other', path: '/System/Applications/Système Réglages.app' })
      )
    ).toBe(true)
    expect(matcher.matches(row({ kind: 'file', name: 'Système Réglages' }))).toBe(false)
    expect(
      createMatcher({ kind: 'app', name: 'Safari.app' }, [root]).matches(
        row({ kind: 'app', name: 'Safari' })
      )
    ).toBe(true)
  })

  it('matches a file by its corpus-relative path, so a same-named copy elsewhere does not count', () => {
    const target = { kind: 'file' as const, name: 'IMG_0001.PNG', path: 'ignored/t1/IMG_0001.PNG' }
    const matcher = createMatcher(target, [root])
    expect(
      matcher.matches(row({ name: 'IMG_0001.PNG', path: `${root}/ignored/t1/IMG_0001.PNG` }))
    ).toBe(true)
    expect(
      matcher.matches(row({ name: 'img_0001.png', path: `${root}/IGNORED/t1/img_0001.png` }))
    ).toBe(true)
    expect(
      matcher.matches(row({ name: 'IMG_0001.PNG', path: `${root}/ignored/t1/real/IMG_0001.PNG` }))
    ).toBe(false)
    expect(matcher.matches(row({ name: 'IMG_0001.PNG' }))).toBe(false)
  })

  it('accepts every spelling of the corpus root and falls back to the name when no path is given', () => {
    const matcher = createMatcher({ kind: 'file', name: 'a.png', path: 'a.png' }, [
      root,
      '/private/real/corpus'
    ])
    expect(matcher.matches(row({ name: 'a.png', path: '/private/real/corpus/a.png' }))).toBe(true)
    const byName = createMatcher({ kind: 'file', name: 'Report.PDF' }, [root])
    expect(byName.matches(row({ name: 'report.pdf', path: '/anywhere/report.pdf' }))).toBe(true)
    expect(byName.matches(row({ kind: 'app', name: 'report.pdf' }))).toBe(false)
  })

  it('reports the 1-based rank of the first match', () => {
    const rows = [
      row({ name: 'x.png' }),
      row({ name: 'y.png' }),
      row({ name: 'y.png', path: '/p/y.png' })
    ]
    expect(findRank(rows, createMatcher({ kind: 'file', name: 'y.png' }, [root]))).toBe(2)
    expect(findRank(rows, createMatcher({ kind: 'file', name: 'z.png' }, [root]))).toBeNull()
    expect(normalizeName('É')).toBe(normalizeName('é'))
  })
})
