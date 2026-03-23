import type { FileTypeTag } from '../constants'
import { describe, expect, it } from 'vitest'
import {
  buildFtsQuery,
  buildSearchIndexItem,
  resolveExtensionsForTypeFilters,
  resolveTypeTag
} from './file-provider-search-service'

describe('file-provider-search-service', () => {
  it('resolves type aliases and plural aliases', () => {
    expect(resolveTypeTag('images')).toBe('image')
    expect(resolveTypeTag('video')).toBe('video')
  })

  it('limits fts query tokens to 5', () => {
    const query = buildFtsQuery(['one two three four five six seven'])
    expect(query.split(' ')).toHaveLength(5)
  })

  it('resolves extensions for type filters', () => {
    const extensions = resolveExtensionsForTypeFilters(new Set<FileTypeTag>(['image', 'video']))
    expect(extensions.length).toBeGreaterThan(0)
  })

  it('builds search index item with provider metadata', () => {
    const item = buildSearchIndexItem(
      {
        path: '/tmp/demo/readme.md',
        name: 'readme.md',
        displayName: 'README',
        extension: '.md',
        content: 'hello world'
      } as any,
      'file',
      'files'
    )

    expect(item.providerId).toBe('file')
    expect(item.type).toBe('files')
    expect(item.path).toBe('/tmp/demo/readme.md')
    expect((item.keywords ?? []).length).toBeGreaterThan(0)
  })
})
