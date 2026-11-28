import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findDesktopFiles,
  findIconPath,
  parseDesktopFile,
  resolveApplicationRoots,
  resolveIconRoots,
  tokenizeDesktopExec
} from './linux'

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

describe('linux icon theme roots', () => {
  // The gap #1640 left behind: resolveApplicationRoots made flatpak apps discoverable while the
  // icon lookup still hardcoded /usr/share/icons, so those apps rendered with no icon.
  it('covers both flatpak icon prefixes', () => {
    const roots = resolveIconRoots({}, HOME)

    expect(roots).toContain('/var/lib/flatpak/exports/share/icons')
    expect(roots).toContain(`${HOME}/.local/share/flatpak/exports/share/icons`)
  })

  it('applies the XDG defaults when the environment says nothing', () => {
    const roots = resolveIconRoots({}, HOME)

    expect(roots).toContain('/usr/share/icons')
    expect(roots).toContain('/usr/local/share/icons')
    expect(roots).toContain(`${HOME}/.local/share/icons`)
  })

  // A user-installed theme has to win over the system copy of the same name, so the per-user root
  // cannot sit behind the system ones -- the search returns the first hit.
  it('puts the per-user root ahead of the system ones', () => {
    const roots = resolveIconRoots({}, HOME)

    expect(roots.indexOf(`${HOME}/.local/share/icons`)).toBeLessThan(
      roots.indexOf('/usr/share/icons')
    )
  })

  it('reads XDG_DATA_DIRS instead of assuming the defaults', () => {
    const roots = resolveIconRoots({ XDG_DATA_DIRS: '/opt/nix/share' }, HOME)

    expect(roots).toContain('/opt/nix/share/icons')
    expect(roots).not.toContain('/usr/share/icons')
  })

  it('reads XDG_DATA_HOME for the per-user prefix, including its flatpak subtree', () => {
    const roots = resolveIconRoots({ XDG_DATA_HOME: '/data/xdg' }, HOME)

    expect(roots).toContain('/data/xdg/icons')
    expect(roots).toContain('/data/xdg/flatpak/exports/share/icons')
  })

  it('does not repeat a root that appears twice', () => {
    const roots = resolveIconRoots({ XDG_DATA_DIRS: '/usr/share:/usr/share' }, HOME)

    expect(new Set(roots).size).toBe(roots.length)
  })
})

describe('linux desktop hardening', () => {
  it('avoids infinite recursion on cyclic directory symlinks', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'linux-desktop-cycle-'))
    try {
      const sub = path.join(root, 'sub')
      await fs.mkdir(sub, { recursive: true })
      await fs.writeFile(path.join(sub, 'demo.desktop'), '[Desktop Entry]\n', 'utf8')
      await fs.symlink(root, path.join(sub, 'loop-back'))

      const found = await findDesktopFiles(root)
      expect(found).toEqual([path.join(sub, 'demo.desktop')])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects icon name path traversal outside icon roots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'linux-icon-traversal-'))
    try {
      const iconsDir = path.join(root, 'share', 'icons')
      await fs.mkdir(iconsDir, { recursive: true })
      const secret = path.join(root, 'secret.png')
      await fs.writeFile(secret, 'not-an-icon')

      const resolved = await findIconPath(
        '../../../../../secret',
        { XDG_DATA_DIRS: path.join(root, 'share') },
        root
      )
      expect(resolved).toBe('')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('tokenizes Exec with quotes/args and assigns distinct stableIds for flatpak apps', async () => {
    expect(
      tokenizeDesktopExec('"/usr/bin/flatpak" run --branch=stable org.gnome.Calculator %U')
    ).toEqual(['/usr/bin/flatpak', 'run', '--branch=stable', 'org.gnome.Calculator'])

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'linux-flatpak-desktop-'))
    try {
      const calcPath = path.join(root, 'org.gnome.Calculator.desktop')
      const filesPath = path.join(root, 'org.gnome.Nautilus.desktop')
      await fs.writeFile(
        calcPath,
        '[Desktop Entry]\nType=Application\nName=Calculator\nExec=/usr/bin/flatpak run org.gnome.Calculator %u\n',
        'utf8'
      )
      await fs.writeFile(
        filesPath,
        '[Desktop Entry]\nType=Application\nName=Files\nExec=/usr/bin/flatpak run org.gnome.Nautilus %U\n',
        'utf8'
      )

      const calc = await parseDesktopFile(calcPath, root)
      const files = await parseDesktopFile(filesPath, root)

      expect(calc?.stableId).toBe('org.gnome.Calculator.desktop')
      expect(files?.stableId).toBe('org.gnome.Nautilus.desktop')
      expect(calc?.stableId).not.toBe(files?.stableId)
      expect(calc?.launchKind).toBe('shortcut')
      expect(calc?.launchTarget).toBe('/usr/bin/flatpak')
      expect(calc?.launchArgs).toBe('run org.gnome.Calculator')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
