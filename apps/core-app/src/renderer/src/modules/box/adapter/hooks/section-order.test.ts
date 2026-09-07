import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { alignItemsToSections } from './section-order'

function app(id: string): TuffItem {
  return {
    id,
    kind: 'app',
    source: { id: 'app-provider', type: 'application', name: 'apps' },
    render: { mode: 'default', basic: { title: id } }
  } as TuffItem
}

function file(id: string): TuffItem {
  return {
    id,
    kind: 'file',
    source: { id: 'file-provider', type: 'file', name: 'files' },
    render: { mode: 'default', basic: { title: id } },
    meta: { file: { path: id } }
  } as TuffItem
}

function tieredLayout(grid: string[], list: string[]): TuffContainerLayout {
  return {
    mode: 'grid',
    grid: { columns: 6 },
    sections: [
      { id: 'habitual', layout: 'grid', itemIds: grid },
      { id: 'proposed', layout: 'list', itemIds: list }
    ]
  }
}

describe('alignItemsToSections', () => {
  it('orders items the way the sections display them', () => {
    // Rank order puts the fresh files first, but the grid tier renders the apps above them and
    // numbers focus from the top — so `res[0]` must be the first tile, not the first file.
    const files = [file('/Downloads/a.png'), file('/Downloads/b.png')]
    const apps = [app('terminal'), app('finder')]

    const aligned = alignItemsToSections(
      [...files, ...apps],
      tieredLayout(['terminal', 'finder'], ['/Downloads/a.png', '/Downloads/b.png'])
    )

    expect(aligned.items.map((item) => item.id)).toEqual([
      'terminal',
      'finder',
      '/Downloads/a.png',
      '/Downloads/b.png'
    ])
  })

  it('prunes section ids the items no longer contain and drops sections left empty', () => {
    // File filters run after the layout is built, so a section can still name a dropped item.
    // Keyboard navigation sizes sections by `itemIds`; it must see the same rows BoxGrid draws.
    const aligned = alignItemsToSections(
      [app('terminal')],
      tieredLayout(['terminal', 'gone-app'], ['/Downloads/gone.png'])
    )

    expect(aligned.items.map((item) => item.id)).toEqual(['terminal'])
    expect(aligned.layout?.sections).toEqual([
      { id: 'habitual', layout: 'grid', itemIds: ['terminal'] }
    ])
  })

  it('keeps an item no section claims, after the tiers', () => {
    const aligned = alignItemsToSections(
      [app('stray'), app('terminal')],
      tieredLayout(['terminal'], [])
    )

    expect(aligned.items.map((item) => item.id)).toEqual(['terminal', 'stray'])
  })

  it('leaves the list alone without a sectioned grid layout', () => {
    const items = [file('/Downloads/a.png'), app('terminal')]

    expect(alignItemsToSections(items, undefined).items).toBe(items)
    expect(alignItemsToSections(items, { mode: 'grid' }).items).toBe(items)
    expect(
      alignItemsToSections(items, {
        mode: 'list',
        sections: [{ id: 'x', layout: 'list', itemIds: ['terminal'] }]
      }).items
    ).toBe(items)
  })
})
