import { describe, expect, it } from 'vitest'
import { fileFilterService } from '../common/file-filter-service'

const reason = (p: string): string =>
  String(fileFilterService.getTraversalExclusionReason(p, undefined as never) ?? '—')

/**
 * Home-anchored toolchain caches (2026-09-26): `~/go/pkg` held 222,047 of the 276,277 rows in a
 * dev index because none of its segments is on a leaf-name list and none starts with a dot. The
 * rule is a path prefix relative to the home directory, so it fires on the directory and below it
 * and nowhere else — a project that happens to be called `go` keeps its `pkg` folder.
 */
describe('home-anchored toolchain caches', () => {
  it('excludes the Go module cache under a POSIX home and everything below it', () => {
    expect(reason('/Users/someone/go/pkg')).toBe('cache-path')
    expect(reason('/Users/someone/go/pkg/mod')).toBe('cache-path')
    expect(reason('/Users/someone/go/pkg/mod/github.com/x/y@v1.0.0')).toBe('cache-path')
    expect(reason('/home/someone/go/pkg/mod')).toBe('cache-path')
  })

  it('excludes the Go module cache under a Windows home', () => {
    expect(reason('C:/Users/someone/go/pkg/mod')).toBe('cache-path')
  })

  it('excludes OrbStack VM mounts', () => {
    expect(reason('/Users/someone/OrbStack')).toBe('cache-path')
    expect(reason('/Users/someone/OrbStack/docker/volumes')).toBe('cache-path')
  })

  it('leaves the rest of GOPATH and same-named folders elsewhere alone', () => {
    expect(reason('/Users/someone/go/src/project')).toBe('—')
    expect(reason('/Users/someone/go')).toBe('—')
    expect(reason('/Users/someone/Workspace/go/pkg')).toBe('—')
    expect(reason('/Volumes/data/go/pkg')).toBe('—')
    expect(reason('go/pkg')).toBe('—')
  })
})

/**
 * X3 from `.trellis/tasks/09-26-corebox-refresh-churn/research/root-cause.md`: `DEV_PATHS` were
 * substrings, so `layout/` matched `/out\//` and `about/` matched `/bout\//`-style suffixes. The
 * probe there found real user files silently dropped. Anchoring to a path segment keeps the
 * intended `dist/`, `build/`, `out/` directories excluded while `layout/` and `about/` survive.
 */
describe('DEV_PATHS are anchored to path segments', () => {
  it('no longer excludes user folders whose names merely contain a dev-dir name', () => {
    expect(reason('/Users/someone/Workspace/Projects/app/src/layout/components')).toBe('—')
    expect(reason('/Users/someone/Documents/about/team')).toBe('—')
    expect(reason('/Users/someone/Documents/handout/2026')).toBe('—')
    expect(reason('/Users/someone/Documents/rebuild/plans')).toBe('—')
  })

  it('still excludes the real dev directories and their descendants', () => {
    expect(reason('/Users/someone/Workspace/app/dist')).toBe('development-path')
    expect(reason('/Users/someone/Workspace/app/dist/2026')).toBe('development-path')
    expect(reason('/Users/someone/Workspace/app/node_modules/pkg')).toBe('development-path')
    expect(reason('/Users/someone/Workspace/app/.git/objects')).toBe('development-path')
  })
})
