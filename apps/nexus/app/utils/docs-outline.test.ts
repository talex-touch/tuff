import { describe, expect, it } from 'vitest'
import { buildDocOutlineFromBody } from './docs-outline'

const minimarkBody = {
  type: 'minimark',
  value: [
    ['h1', { id: 'title' }, 'Title'],
    ['p', {}, 'Intro'],
    ['h2', { id: 'overview' }, 'Overview'],
    ['h3', { id: 'details' }, 'Details ', ['code', {}, 'API']],
    ['h2', { id: 'usage' }, 'Usage'],
  ],
}

describe('docs outline helpers', () => {
  it('prefers normalized toc links when available', () => {
    expect(buildDocOutlineFromBody({
      type: 'minimark',
      toc: {
        links: [
          { id: 'from-toc', text: 'From Toc', depth: 2 },
          { id: '', text: 'Invalid', depth: 2 },
        ],
      },
      value: minimarkBody.value,
    })).toEqual([
      { id: 'from-toc', text: 'From Toc', depth: 2 },
    ])
  })

  it('builds nested outline from minimark headings when toc links are empty', () => {
    expect(buildDocOutlineFromBody(minimarkBody)).toEqual([
      {
        id: 'overview',
        text: 'Overview',
        depth: 2,
        children: [
          {
            id: 'details',
            text: 'Details API',
            depth: 3,
            children: [],
          },
        ],
      },
      {
        id: 'usage',
        text: 'Usage',
        depth: 2,
        children: [],
      },
    ])
  })
})
