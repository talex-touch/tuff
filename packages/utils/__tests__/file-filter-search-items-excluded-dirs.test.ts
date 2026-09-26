import { describe, expect, it } from 'vitest'
import { fileFilterService } from '../common/file-filter-service'

const item = (path: string, isDir = false) => ({ meta: { file: { path, isDir } } })

/**
 * Read-time results obey the directory rules that need no filesystem look (2026-09-26). Rows
 * indexed under an older rule set survive in the tables until the budgeted cleanup reaches them;
 * `filterSearchItems` is what keeps them out of the results meanwhile, for every file source.
 * Context-dependent names (`build`, `dist`, `out`, …) are a walker's decision and are left alone.
 *
 * `~/Library` is a system location only where the platform's own list says so (see
 * file-filter-traversal-anchor.test.ts), so those rows are asserted per platform: on macOS the
 * Application Support row goes and the iCloud Drive row stays by exemption; elsewhere both stay.
 */
const ON_MACOS = process.platform === 'darwin'

describe('filterSearchItems applies the context-free directory rules', () => {
  it('drops toolchain caches, unconditional dev names and system locations; keeps user folders', () => {
    const items = [
      item('/Users/someone/go/pkg/mod/github.com/x/y@v1/testdata/ClientHello.json'),
      item('/Users/someone/Workspace/app/node_modules/pkg/lib/index.js'),
      item('/Users/someone/OrbStack/docker/volumes/data.txt'),
      item('/Users/someone/Library/Application Support/WeChat/wx-cache.json'),
      item('/Users/someone/Documents/report.md'),
      item('/Users/someone/Documents/build/2026/wx-report.pdf'),
      item('/Users/someone/Workspace/app/dist/bundle.js'),
      item('/Users/someone/Workspace/app/src/layout/Button.vue'),
      item('/Users/someone/Documents/about/team/notes.md'),
      item('/Users/someone/Library/Mobile Documents/com~apple~CloudDocs/notes.md')
    ]
    const kept = fileFilterService.filterSearchItems(items).map((entry) => entry.meta.file.path)
    expect(kept).toEqual([
      ...(ON_MACOS ? [] : ['/Users/someone/Library/Application Support/WeChat/wx-cache.json']),
      '/Users/someone/Documents/report.md',
      '/Users/someone/Documents/build/2026/wx-report.pdf',
      '/Users/someone/Workspace/app/dist/bundle.js',
      '/Users/someone/Workspace/app/src/layout/Button.vue',
      '/Users/someone/Documents/about/team/notes.md',
      '/Users/someone/Library/Mobile Documents/com~apple~CloudDocs/notes.md'
    ])
  })

  it('names the reason so diagnostics can say why a row vanished', () => {
    expect(
      fileFilterService.getSearchItemExclusionReason(
        item('/Users/someone/go/pkg/mod/github.com/x/y@v1/a.go')
      )
    ).toBe('cache-path')
    expect(
      fileFilterService.getSearchItemExclusionReason(
        item('/Users/someone/Workspace/app/node_modules/pkg', true)
      )
    ).toBe('development-path')
    expect(
      fileFilterService.getSearchItemExclusionReason(
        item('/Users/someone/Library/Caches/thing/blob.bin')
      )
    ).toBe(ON_MACOS ? 'system-path' : null)
    expect(
      fileFilterService.getSearchItemExclusionReason(item('/Users/someone/Documents/report.md'))
    ).toBeNull()
  })

  it('returns the same array when nothing is excluded', () => {
    const items = [item('/Users/someone/Documents/a.md'), item('/Users/someone/Desktop/b.txt')]
    expect(fileFilterService.filterSearchItems(items)).toBe(items)
  })
})
