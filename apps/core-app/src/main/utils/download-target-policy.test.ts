import fs, { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeRootPathForTests } from './app-root-path'
import {
  evaluateDownloadTarget,
  getAllowedDownloadRoots,
  isAllowedDownloadTempDir,
  isDangerousDownloadOpenFile,
  isSafeDownloadTaskId
} from './download-target-policy'

const electronAppMock = vi.hoisted(() => ({
  isPackaged: true,
  getAppPath: () => '/var/tuff-profile/app',
  getPath: vi.fn((name: string) => {
    // Keep mocked profile directories outside `/tmp`: on Linux `os.tmpdir()` is `/tmp`,
    // which `getAllowedDownloadRoots()` itself includes.
    switch (name) {
      case 'userData':
        return path.resolve('/var/tuff-profile/core-app')
      case 'downloads':
        return path.resolve('/var/tuff-profile/downloads')
      case 'temp':
        return path.resolve('/var/tuff-profile/os-temp')
      default:
        throw new Error(`unexpected path: ${name}`)
    }
  })
}))

vi.mock('electron', () => ({
  app: electronAppMock
}))

/**
 * Where a download task is allowed to write (#905).
 *
 * addTask took `destination` and `filename` verbatim from the IPC payload, and the worker
 * would mkdir -p the directory and open a write stream in it. transport.on registers on the
 * plugin channel, so any plugin — or injected renderer script — had arbitrary file write:
 * ~/Library/LaunchAgents for login-item persistence, the Windows Startup folder, or the app's
 * own config and plugin files.
 *
 * Roots are injected here rather than read from Electron, so the cases below say what they
 * mean on every platform instead of depending on the host's real directories.
 */

const ROOT = path.resolve('/tmp/tuff-root')
const DOWNLOADS = path.resolve('/tmp/user-downloads')
const ROOTS = [ROOT, DOWNLOADS]

function check(destination: string | undefined, filename: string) {
  return evaluateDownloadTarget(destination, filename, ROOTS)
}

/**
 * The rejection reason, or undefined when the target was allowed.
 *
 * DownloadTargetDecision is a discriminated union, so `reason` only exists on the refusing
 * branch; narrowing here keeps every assertion below a single readable line.
 */
function rejection(destination: string | undefined, filename: string): string | undefined {
  const decision = check(destination, filename)
  return decision.allowed ? undefined : decision.reason
}

describe('evaluateDownloadTarget', () => {
  it('allows a download into an allowed root', () => {
    // Positive control: every rejection below would also pass if this returned false for
    // everything, which would disable downloads rather than secure them.
    expect(check(DOWNLOADS, 'file.zip')).toEqual({
      allowed: true,
      destination: DOWNLOADS,
      filename: 'file.zip'
    })
  })

  it('allows the update packages directory beneath the app root', () => {
    // The updater writes here, so a policy that rejected it would break app updates.
    const updates = path.join(ROOT, 'modules', 'update-packages')
    expect(check(updates, 'Tuff-2.5.0.dmg').allowed).toBe(true)
  })

  it('rejects a destination outside every root', () => {
    expect(rejection('/Users/victim/Library/LaunchAgents', 'com.evil.plist')).toBe(
      'destination-outside-roots'
    )
  })

  it('rejects a traversal that climbs out of a root', () => {
    expect(rejection(path.join(ROOT, '..', '..', 'etc'), 'passwd')).toBe(
      'destination-outside-roots'
    )
  })

  it('rejects a sibling directory sharing a root prefix', () => {
    expect(rejection(`${ROOT}-evil`, 'file.zip')).toBe('destination-outside-roots')
  })

  it('rejects a relative destination', () => {
    expect(rejection('relative/dir', 'file.zip')).toBe('destination-not-absolute')
    expect(rejection('', 'file.zip')).toBe('destination-not-absolute')
    expect(rejection(undefined, 'file.zip')).toBe('destination-not-absolute')
  })

  it('rejects a filename that traverses, even into an allowed destination', () => {
    // The half that a destination allowlist alone does not cover.
    for (const filename of ['../evil.sh', '../../Library/LaunchAgents/x.plist', '..'])
      expect(rejection(DOWNLOADS, filename), filename).toBe('unsafe-filename')
  })

  it('rejects a filename containing a separator', () => {
    for (const filename of ['sub/evil.sh', 'sub\\evil.sh'])
      expect(rejection(DOWNLOADS, filename), filename).toBe('unsafe-filename')
  })

  it('rejects an absolute filename', () => {
    expect(rejection(DOWNLOADS, '/etc/passwd')).toBe('unsafe-filename')
  })

  it('rejects an empty or dot filename and one with a null byte', () => {
    for (const filename of ['', '.', 'a\0b'])
      expect(rejection(DOWNLOADS, filename), JSON.stringify(filename)).toBe('unsafe-filename')
  })

  it('checks the filename before the destination', () => {
    // Both are hostile here. The filename reason is the more specific one to report, and
    // pinning the order keeps the message stable for whoever reads the log.
    expect(rejection('/nowhere', '../evil.sh')).toBe('unsafe-filename')
  })
})

describe('getAllowedDownloadRoots', () => {
  afterEach(() => {
    resetRuntimeRootPathForTests()
    vi.clearAllMocks()
  })

  it('allows TempFileService subdirectories under userData/temp while rejecting bare userData', () => {
    // Must not sit under `/tmp`, which equals `os.tmpdir()` (an allowed root) on Linux.
    const userData = path.resolve('/var/tuff-profile/core-app')
    const roots = getAllowedDownloadRoots()

    expect(roots).toContain(path.join(userData, 'temp'))
    expect(roots).not.toContain(userData)

    const svgCacheDir = path.join(userData, 'temp', 'icons', 'svg-cache')
    expect(evaluateDownloadTarget(svgCacheDir, 'icon.svg', roots)).toEqual({
      allowed: true,
      destination: svgCacheDir,
      filename: 'icon.svg'
    })

    expect(evaluateDownloadTarget(userData, 'config.json', roots)).toEqual({
      allowed: false,
      reason: 'destination-outside-roots'
    })
    expect(
      evaluateDownloadTarget(path.join(userData, 'plugins', 'evil'), 'index.js', roots)
    ).toEqual({
      allowed: false,
      reason: 'destination-outside-roots'
    })
    expect(evaluateDownloadTarget(path.join(userData, 'temp-evil'), 'file.svg', roots)).toEqual({
      allowed: false,
      reason: 'destination-outside-roots'
    })

    // Runtime root itself and sensitive subdirectories (config, plugins, browser-connector) are denied.
    const runtimeRoot = path.join(userData, 'tuff')
    expect(roots).not.toContain(runtimeRoot)
    for (const forbidden of [
      runtimeRoot,
      path.join(runtimeRoot, 'config'),
      path.join(runtimeRoot, 'modules', 'plugins'),
      path.join(runtimeRoot, 'browser-connector')
    ]) {
      expect(evaluateDownloadTarget(forbidden, 'secret.json', roots)).toEqual({
        allowed: false,
        reason: 'destination-outside-roots'
      })
    }

    // Dedicated runtime download subdirectories remain allowed.
    for (const permitted of [
      path.join(runtimeRoot, 'modules', 'update-packages'),
      path.join(runtimeRoot, 'Downloads', 'dependencies', 'everything'),
      path.join(runtimeRoot, 'temp')
    ]) {
      expect(evaluateDownloadTarget(permitted, 'package.zip', roots).allowed).toBe(true)
    }
  })

  it('rejects symlink destinations and symlink target files escaping allowed roots', () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'download-policy-symlink-'))
    try {
      const allowedRoot = path.join(sandbox, 'allowed')
      const outsideRoot = path.join(sandbox, 'outside')
      fs.mkdirSync(allowedRoot, { recursive: true })
      fs.mkdirSync(outsideRoot, { recursive: true })

      const escapedDirLink = path.join(allowedRoot, 'escape-dir')
      fs.symlinkSync(outsideRoot, escapedDirLink)
      expect(evaluateDownloadTarget(escapedDirLink, 'payload.txt', [allowedRoot])).toEqual({
        allowed: false,
        reason: 'destination-outside-roots'
      })

      const outsideFile = path.join(outsideRoot, 'target.txt')
      fs.writeFileSync(outsideFile, 'original')
      fs.symlinkSync(outsideFile, path.join(allowedRoot, 'link.txt'))
      expect(evaluateDownloadTarget(allowedRoot, 'link.txt', [allowedRoot])).toEqual({
        allowed: false,
        reason: 'destination-outside-roots'
      })
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it('validates download task ids, temp dirs, and dangerous open extensions', () => {
    expect(isSafeDownloadTaskId('task_123-abc')).toBe(true)
    for (const badId of ['', '.', '..', '../escape', 'a/b', 'a\\b', '.hidden', 'a..b']) {
      expect(isSafeDownloadTaskId(badId), badId).toBe(false)
    }

    const tempRoot = path.resolve('/var/tuff-profile/os-temp')
    expect(isAllowedDownloadTempDir(path.join(tempRoot, 'tuff-downloads'), [tempRoot])).toBe(true)
    expect(isAllowedDownloadTempDir(tempRoot, [tempRoot])).toBe(false)
    expect(isAllowedDownloadTempDir('/Users/victim', [tempRoot])).toBe(false)

    for (const dangerous of ['evil.app', 'run.command', 'payload.sh', 'setup.exe', 'script.bat']) {
      expect(isDangerousDownloadOpenFile(`/tmp/${dangerous}`), dangerous).toBe(true)
    }
    for (const safe of ['doc.pdf', 'archive.zip', 'notes.txt']) {
      expect(isDangerousDownloadOpenFile(`/tmp/${safe}`), safe).toBe(false)
    }
  })
})

/**
 * That addTask actually consults the policy.
 *
 * download-center.ts has no unit-test harness — it constructs a database, a polling service
 * and a transport in its constructor — so the call site is guarded at source level instead.
 * Without this, the rules above could all pass while nothing enforced them.
 */
describe('download-center wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../modules/download/download-center.ts', import.meta.url)),
    'utf8'
  )

  function addTaskBody(): string {
    const start = source.indexOf('async addTask(')
    expect(start, 'addTask not found — this guard is reading the wrong file').toBeGreaterThan(-1)
    const end = source.indexOf('\n  }', start)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('evaluates the target before building the task', () => {
    expect(addTaskBody()).toContain('evaluateDownloadTarget(')
  })

  it('refuses rather than falling through when the target is rejected', () => {
    expect(addTaskBody()).toMatch(/if \(!target\.allowed\)[\s\S]*?throw new Error/)
  })

  it('uses the validated filename rather than the raw request field', () => {
    // The destination and the filename are separate fields; validating one and then writing
    // the other straight through is the natural half-fix.
    expect(addTaskBody()).toContain('filename: target.filename')
    expect(addTaskBody()).not.toContain('filename: request.filename ||')
  })

  it('enforces http(s) URLs, safe task ids, IPC tempDir lock, and executable open guard', () => {
    expect(addTaskBody()).toContain('isHttpUrl(request.url)')
    expect(addTaskBody()).toContain('isSafeDownloadTaskId(request.id)')
    expect(source).toContain('isDangerousDownloadOpenFile(canonicalPath)')
    expect(source).toContain('Modifying download tempDir over IPC is not allowed')
    expect(source).toContain('Refused temp cleanup on unapproved tempDir')
  })
})
