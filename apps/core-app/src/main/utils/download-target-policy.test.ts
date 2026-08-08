import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { evaluateDownloadTarget } from './download-target-policy'

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

const check = (destination: string | undefined, filename: string) =>
  evaluateDownloadTarget(destination, filename, ROOTS)

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
    expect(check('/Users/victim/Library/LaunchAgents', 'com.evil.plist').reason).toBe(
      'destination-outside-roots'
    )
  })

  it('rejects a traversal that climbs out of a root', () => {
    expect(check(path.join(ROOT, '..', '..', 'etc'), 'passwd').reason).toBe(
      'destination-outside-roots'
    )
  })

  it('rejects a sibling directory sharing a root prefix', () => {
    expect(check(`${ROOT}-evil`, 'file.zip').reason).toBe('destination-outside-roots')
  })

  it('rejects a relative destination', () => {
    expect(check('relative/dir', 'file.zip').reason).toBe('destination-not-absolute')
    expect(check('', 'file.zip').reason).toBe('destination-not-absolute')
    expect(check(undefined, 'file.zip').reason).toBe('destination-not-absolute')
  })

  it('rejects a filename that traverses, even into an allowed destination', () => {
    // The half that a destination allowlist alone does not cover.
    for (const filename of ['../evil.sh', '../../Library/LaunchAgents/x.plist', '..'])
      expect(check(DOWNLOADS, filename).reason, filename).toBe('unsafe-filename')
  })

  it('rejects a filename containing a separator', () => {
    for (const filename of ['sub/evil.sh', 'sub\\evil.sh'])
      expect(check(DOWNLOADS, filename).reason, filename).toBe('unsafe-filename')
  })

  it('rejects an absolute filename', () => {
    expect(check(DOWNLOADS, '/etc/passwd').reason).toBe('unsafe-filename')
  })

  it('rejects an empty or dot filename and one with a null byte', () => {
    for (const filename of ['', '.', 'a\0b'])
      expect(check(DOWNLOADS, filename).reason, JSON.stringify(filename)).toBe('unsafe-filename')
  })

  it('checks the filename before the destination', () => {
    // Both are hostile here. The filename reason is the more specific one to report, and
    // pinning the order keeps the message stable for whoever reads the log.
    expect(check('/nowhere', '../evil.sh').reason).toBe('unsafe-filename')
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
})
