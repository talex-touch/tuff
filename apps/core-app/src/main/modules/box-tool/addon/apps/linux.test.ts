import { describe, expect, it } from 'vitest'
import { resolveApplicationRoots } from './linux'

const HOME = '/home/tester'

describe('linux application roots', () => {
  it('applies the XDG defaults when the environment says nothing', () => {
    const roots = resolveApplicationRoots({}, HOME)

    expect(roots).toContain('/usr/share/applications')
    expect(roots).toContain('/usr/local/share/applications')
    expect(roots).toContain(`${HOME}/.local/share/applications`)
  })

  // The regression this function exists for. flatpak exports to its own prefixes and never copies
  // into /usr/share/applications, so the previous hardcoded list made every flatpak-installed
  // application invisible to search -- silently, since a missing directory is indistinguishable
  // from an empty one to findDesktopFiles.
  it('covers both flatpak export prefixes', () => {
    const roots = resolveApplicationRoots({}, HOME)

    expect(roots).toContain('/var/lib/flatpak/exports/share/applications')
    expect(roots).toContain(`${HOME}/.local/share/flatpak/exports/share/applications`)
  })

  it('keeps the snap prefix, which is outside XDG on most distributions', () => {
    expect(resolveApplicationRoots({}, HOME)).toContain('/var/lib/snapd/desktop/applications')
  })

  it('reads XDG_DATA_DIRS instead of assuming the defaults', () => {
    const roots = resolveApplicationRoots({ XDG_DATA_DIRS: '/opt/nix/share:/srv/apps' }, HOME)

    expect(roots).toContain('/opt/nix/share/applications')
    expect(roots).toContain('/srv/apps/applications')
    expect(roots).not.toContain('/usr/local/share/applications')
  })

  it('reads XDG_DATA_HOME for the per-user prefix, including its flatpak subtree', () => {
    const roots = resolveApplicationRoots({ XDG_DATA_HOME: '/data/xdg' }, HOME)

    expect(roots).toContain('/data/xdg/applications')
    expect(roots).toContain('/data/xdg/flatpak/exports/share/applications')
    expect(roots).not.toContain(`${HOME}/.local/share/applications`)
  })

  it('ignores blank and whitespace-only entries in XDG_DATA_DIRS', () => {
    const roots = resolveApplicationRoots({ XDG_DATA_DIRS: '/a::  :/b' }, HOME)

    expect(roots).toContain('/a/applications')
    expect(roots).toContain('/b/applications')
    expect(roots.filter((root) => root === 'applications')).toHaveLength(0)
  })

  // A duplicated root would scan the same directory twice and emit two entries for one app,
  // because uniqueId is the .desktop path.
  it('does not repeat a root that appears twice', () => {
    const roots = resolveApplicationRoots({ XDG_DATA_DIRS: '/usr/share:/usr/share' }, HOME)

    expect(roots.filter((root) => root === '/usr/share/applications')).toHaveLength(1)
    expect(new Set(roots).size).toBe(roots.length)
  })

  it('falls back to the defaults when XDG_DATA_DIRS is set but empty', () => {
    expect(resolveApplicationRoots({ XDG_DATA_DIRS: '   ' }, HOME)).toContain(
      '/usr/share/applications'
    )
  })
})
