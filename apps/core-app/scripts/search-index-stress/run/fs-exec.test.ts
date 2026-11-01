import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsStep, PayloadSpec } from '../types'
import { RunAbort } from './errors'
import type { FsExecutor } from './fs-exec'
import {
  atomicTempPath,
  ContainmentError,
  createFsExecutor,
  FsStepError,
  MAX_PAYLOAD_BYTES,
  normalizeRelative
} from './fs-exec'
import type { VirtualClock } from './test-support/virtual-clock'
import { createVirtualClock } from './test-support/virtual-clock'

let base: string
let root: string
let outside: string
let clock: VirtualClock
let exec: FsExecutor
const materialize = vi.fn((spec: PayloadSpec) => Buffer.alloc(spec.bytes, spec.seed & 0xff))

const payload = (bytes: number, seed = 7): PayloadSpec => ({ kind: 'png', bytes, seed })
const read = (rel: string): Buffer => fs.readFileSync(path.join(root, rel))
const exists = (rel: string): boolean => fs.existsSync(path.join(root, rel))

async function realWait(condition: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${label}`)
}

beforeEach(async () => {
  base = fs.mkdtempSync('/private/tmp/stress-fsexec-')
  root = path.join(base, 'root')
  outside = path.join(base, 'outside')
  fs.mkdirSync(root)
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')
  clock = createVirtualClock()
  materialize.mockClear()
  exec = await createFsExecutor({ root, materialize, clock })
})

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

describe('fs executor: operations', () => {
  it('creates, writes, copies, moves, touches and deletes inside the root', async () => {
    await exec.run([
      { op: 'mkdir', path: 'a/b' },
      { op: 'write', path: 'a/b/one.png', payload: payload(10, 1) },
      { op: 'write-atomic', path: 'a/two.png', payload: payload(20, 2) },
      { op: 'copy', from: 'a/two.png', to: 'a/b/copy.png' },
      { op: 'move', from: 'a/b/one.png', to: 'a/moved.png' },
      { op: 'touch', path: 'a/fresh.txt' },
      { op: 'copy', from: 'a/b', to: 'a/b2' }
    ])
    expect(read('a/moved.png')).toEqual(Buffer.alloc(10, 1))
    expect(read('a/two.png')).toEqual(Buffer.alloc(20, 2))
    expect(read('a/b/copy.png')).toEqual(Buffer.alloc(20, 2))
    expect(read('a/b2/copy.png')).toEqual(Buffer.alloc(20, 2))
    expect(exists('a/b/one.png')).toBe(false)
    expect(read('a/fresh.txt').length).toBe(0)
    expect(fs.readdirSync(path.join(root, 'a')).filter((name) => name.endsWith('.tmp'))).toEqual([])

    await exec.run([
      { op: 'delete', path: 'a/moved.png' },
      { op: 'delete', path: 'a/b2', recursive: true }
    ])
    expect(exists('a/moved.png')).toBe(false)
    expect(exists('a/b2')).toBe(false)
  })

  it('stages an atomic write next to its target, and under a short name when the target name has no room', async () => {
    const roomy = `${'a'.repeat(100)}.png`
    expect(atomicTempPath(`/x/${roomy}`)).toMatch(
      new RegExp(`^/x/${roomy.replace('.', '\\.')}\\.[0-9a-f]{8}\\.tmp$`)
    )
    const fits = `${'b'.repeat(238)}.png`
    expect(Buffer.byteLength(fits)).toBe(242)
    expect(path.basename(atomicTempPath(`/x/${fits}`)).startsWith(fits)).toBe(true)
    const tight = `${'b'.repeat(239)}.png`
    expect(Buffer.byteLength(tight)).toBe(243)
    expect(path.basename(atomicTempPath(`/x/${tight}`)).startsWith(tight)).toBe(false)
    const full = `${'c'.repeat(251)}.png`
    expect(Buffer.byteLength(full)).toBe(255)
    expect(path.dirname(atomicTempPath(`/x/y/${full}`))).toBe('/x/y')
    expect(atomicTempPath(`/x/y/${full}`)).toMatch(/^\/x\/y\/\.[0-9a-f]{8}\.tmp$/)

    await exec.run([
      { op: 'mkdir', path: 'long' },
      { op: 'write-atomic', path: `long/${full}`, payload: payload(12, 5) }
    ])
    expect(read(`long/${full}`)).toEqual(Buffer.alloc(12, 5))
    expect(fs.readdirSync(path.join(root, 'long'))).toEqual([full])
  })

  it('touch moves the modification time of an existing file forward', async () => {
    await exec.run([
      { op: 'mkdir', path: 'd' },
      { op: 'write', path: 'd/f.txt', payload: payload(3) }
    ])
    const old = new Date(Date.now() - 3_600_000)
    fs.utimesSync(path.join(root, 'd/f.txt'), old, old)
    await exec.run([{ op: 'touch', path: 'd/f.txt' }])
    expect(fs.statSync(path.join(root, 'd/f.txt')).mtimeMs).toBeGreaterThan(
      old.getTime() + 3_000_000
    )
  })

  it('overwrites an existing file in place and keeps mkdir idempotent', async () => {
    await exec.run([
      { op: 'mkdir', path: 'x' },
      { op: 'mkdir', path: 'x' },
      { op: 'write', path: 'x/f.bin', payload: payload(50, 1) },
      { op: 'write', path: 'x/f.bin', payload: payload(5, 9) }
    ])
    expect(read('x/f.bin')).toEqual(Buffer.alloc(5, 9))
  })

  it('writes in chunks with the configured delay between them', async () => {
    const run = exec.run([
      { op: 'write', path: 'slow.bin', payload: payload(100, 3), chunks: 4, chunkDelayMs: 500 }
    ])
    const size = (): number =>
      exists('slow.bin') ? fs.statSync(path.join(root, 'slow.bin')).size : -1
    await realWait(() => clock.pendingTimers() === 1, 'first chunk delay')
    expect(size()).toBe(25)
    await clock.advance(500)
    await realWait(() => clock.pendingTimers() === 1, 'second chunk delay')
    expect(size()).toBe(50)
    await clock.advance(500)
    await realWait(() => clock.pendingTimers() === 1, 'third chunk delay')
    expect(size()).toBe(75)
    await clock.advance(500)
    await run
    expect(read('slow.bin')).toEqual(Buffer.alloc(100, 3))
  })

  it('creates a corpus-relative symlink as a relative link and follows it to the target', async () => {
    await exec.run([
      { op: 'mkdir', path: 'real' },
      { op: 'mkdir', path: 'ignored/t1' },
      { op: 'write', path: 'real/pic.png', payload: payload(4) },
      { op: 'symlink', path: 'ignored/t1/link.png', target: 'real/pic.png' },
      { op: 'symlink', path: 'dirlink', target: 'real' },
      { op: 'symlink', path: 'dangling', target: 'nothing/here' }
    ])
    const link = path.join(root, 'ignored/t1/link.png')
    expect(fs.readlinkSync(link)).toBe('../../real/pic.png')
    expect(fs.realpathSync(link)).toBe(path.join(root, 'real/pic.png'))
    expect(fs.realpathSync(path.join(root, 'dirlink/pic.png'))).toBe(
      path.join(root, 'real/pic.png')
    )
    expect(fs.lstatSync(path.join(root, 'dangling')).isSymbolicLink()).toBe(true)
  })

  it('runs parallel children together and reports the failing child, not the wrapper', async () => {
    await exec.run([{ op: 'mkdir', path: 'p' }])
    const steps: FsStep[] = [
      { op: 'write', path: 'p/a.png', payload: payload(2) },
      { op: 'write', path: 'p/missing-dir/b.png', payload: payload(2) },
      { op: 'write', path: 'p/c.png', payload: payload(2) }
    ]
    const error = await exec.run([{ op: 'parallel', steps }]).catch((e) => e)
    expect(error).toBeInstanceOf(FsStepError)
    expect(error.step).toEqual(steps[1])
    expect(error.message).toMatch(/^write p\/missing-dir\/b\.png: ENOENT/)
    expect(exists('p/a.png')).toBe(true)
    expect(exists('p/c.png')).toBe(true)
  })

  it('names the failing step and leaves no temp file behind when an atomic write fails', async () => {
    const error = await exec
      .run([{ op: 'write-atomic', path: 'nodir/x.png', payload: payload(2) }])
      .catch((e) => e)
    expect(error).toBeInstanceOf(FsStepError)
    expect(error.message).toMatch(/^write-atomic nodir\/x\.png: /)
    expect(fs.readdirSync(root)).toEqual([])
  })

  it('delete is strict: a missing path and a non-empty directory without recursive both fail', async () => {
    await exec.run([
      { op: 'mkdir', path: 'd' },
      { op: 'write', path: 'd/f', payload: payload(1) }
    ])
    await expect(exec.run([{ op: 'delete', path: 'nope' }])).rejects.toThrow(/ENOENT/)
    await expect(exec.run([{ op: 'delete', path: 'd' }])).rejects.toBeInstanceOf(FsStepError)
    expect(exists('d/f')).toBe(true)
  })

  it('sleeps on the clock and stops when aborted', async () => {
    const controller = new AbortController()
    const run = exec.run(
      [
        { op: 'sleep', ms: 5_000 },
        { op: 'mkdir', path: 'after' }
      ],
      controller.signal
    )
    await clock.advance(1_000)
    controller.abort()
    await expect(run).rejects.toBeInstanceOf(RunAbort)
    expect(exists('after')).toBe(false)
    await expect(exec.run([{ op: 'sleep', ms: -1 }])).rejects.toThrow(/outside 0\.\./)
  })

  it('refuses oversized payloads before generating them', async () => {
    await expect(
      exec.run([{ op: 'write', path: 'big.bin', payload: payload(MAX_PAYLOAD_BYTES + 1) }])
    ).rejects.toThrow(/outside 0\.\./)
    expect(materialize).not.toHaveBeenCalled()
  })
})

describe('fs executor: containment', () => {
  const lexical: Array<[string, FsStep]> = [
    ['parent segment', { op: 'write', path: '../escape.txt', payload: payload(1) }],
    ['nested parent segment', { op: 'write', path: 'a/../../escape.txt', payload: payload(1) }],
    ['absolute path', { op: 'write', path: '/private/tmp/escape.txt', payload: payload(1) }],
    ['NUL byte', { op: 'write', path: 'a\0b.txt', payload: payload(1) }],
    ['empty path', { op: 'mkdir', path: '' }],
    ['mkdir parent segment', { op: 'mkdir', path: '../escape-dir' }],
    ['copy source', { op: 'copy', from: '../outside/secret.txt', to: 'in.txt' }],
    ['copy destination', { op: 'copy', from: 'x', to: '../escape.txt' }],
    ['move destination', { op: 'move', from: 'x', to: '../escape.txt' }],
    ['delete parent', { op: 'delete', path: '../outside/secret.txt' }],
    ['symlink path', { op: 'symlink', path: '../link', target: 'x' }],
    ['symlink target parent', { op: 'symlink', path: 'link', target: '../outside' }],
    ['symlink absolute target', { op: 'symlink', path: 'link', target: '/etc' }],
    ['touch parent', { op: 'touch', path: '../escape.txt' }]
  ]

  it.each(lexical)('rejects a %s', async (_label, step) => {
    const error = await exec.run([step]).catch((e) => e)
    expect(error).toBeInstanceOf(FsStepError)
    expect(error.cause).toBeInstanceOf(ContainmentError)
    expect(fs.readdirSync(base).sort()).toEqual(['outside', 'root'])
    expect(fs.readdirSync(outside)).toEqual(['secret.txt'])
  })

  describe('through symlinks that already exist inside the root', () => {
    beforeEach(() => {
      fs.symlinkSync(outside, path.join(root, 'out-dir'))
      fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'out-file'))
      fs.symlinkSync(path.join(base, 'does-not-exist'), path.join(root, 'out-dangling'))
      fs.symlinkSync(path.join(root, 'inner'), path.join(root, 'in-link'))
      fs.mkdirSync(path.join(root, 'inner'))
    })

    it.each<[string, FsStep]>([
      [
        'write below a linked directory',
        { op: 'write', path: 'out-dir/evil.txt', payload: payload(1) }
      ],
      ['mkdir below a linked directory', { op: 'mkdir', path: 'out-dir/new/deeper' }],
      [
        'write-atomic below a linked directory',
        { op: 'write-atomic', path: 'out-dir/evil.txt', payload: payload(1) }
      ],
      [
        'write through a link to an outside file',
        { op: 'write', path: 'out-file', payload: payload(1) }
      ],
      ['write through a dangling link', { op: 'write', path: 'out-dangling', payload: payload(1) }],
      ['touch through a link to an outside file', { op: 'touch', path: 'out-file' }],
      ['touch through a dangling link', { op: 'touch', path: 'out-dangling' }],
      [
        'copy out of a linked directory',
        { op: 'copy', from: 'out-dir/secret.txt', to: 'stolen.txt' }
      ],
      ['copy into a linked directory', { op: 'copy', from: 'inner', to: 'out-dir/inner' }],
      ['copy over a link to an outside file', { op: 'copy', from: 'inner', to: 'out-file' }],
      [
        'move out of a linked directory',
        { op: 'move', from: 'out-dir/secret.txt', to: 'stolen.txt' }
      ],
      ['move into a linked directory', { op: 'move', from: 'inner', to: 'out-dir/inner' }],
      ['delete below a linked directory', { op: 'delete', path: 'out-dir/secret.txt' }],
      [
        'symlink below a linked directory',
        { op: 'symlink', path: 'out-dir/link', target: 'inner' }
      ],
      ['mkdir below a dangling link', { op: 'mkdir', path: 'out-dangling/sub' }]
    ])('refuses %s', async (_label, step) => {
      const error = await exec.run([step]).catch((e) => e)
      expect(error).toBeInstanceOf(FsStepError)
      expect(error.cause).toBeInstanceOf(ContainmentError)
      expect(fs.readdirSync(outside)).toEqual(['secret.txt'])
      expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret')
      expect(fs.existsSync(path.join(base, 'does-not-exist'))).toBe(false)
    })

    it('deleting a link removes the link and never touches what it points at', async () => {
      await exec.run([
        { op: 'delete', path: 'out-dir', recursive: true },
        { op: 'delete', path: 'out-file' }
      ])
      expect(fs.existsSync(path.join(root, 'out-dir'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'out-file'))).toBe(false)
      expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret')
    })

    it('moving a link moves the link, not its target', async () => {
      await exec.run([{ op: 'move', from: 'out-file', to: 'renamed-link' }])
      expect(fs.lstatSync(path.join(root, 'renamed-link')).isSymbolicLink()).toBe(true)
      expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret')
    })

    it('still allows links that stay inside the root', async () => {
      await exec.run([
        { op: 'write', path: 'in-link/ok.png', payload: payload(3, 5) },
        { op: 'touch', path: 'in-link/ok.png' }
      ])
      expect(read('inner/ok.png')).toEqual(Buffer.alloc(3, 5))
    })
  })

  it('never deletes the root, however it is spelled', async () => {
    for (const spelled of ['.', './', 'a/..', '']) {
      await expect(
        exec.run([{ op: 'delete', path: spelled, recursive: true }])
      ).rejects.toBeInstanceOf(FsStepError)
    }
    expect(fs.existsSync(root)).toBe(true)
    expect(fs.existsSync(path.join(outside, 'secret.txt'))).toBe(true)
  })

  it('holds a root that is itself reached through a symlink to the real directory', async () => {
    const alias = path.join(base, 'alias')
    fs.symlinkSync(root, alias)
    const viaAlias = await createFsExecutor({ root: alias, materialize, clock })
    expect(viaAlias.root).toBe(fs.realpathSync(root))
    await viaAlias.run([{ op: 'write', path: 'ok.txt', payload: payload(2) }])
    expect(read('ok.txt').length).toBe(2)
    await expect(
      viaAlias.run([{ op: 'write', path: '../x.txt', payload: payload(1) }])
    ).rejects.toBeInstanceOf(FsStepError)
  })

  it('normalises harmless spellings and keeps dot-prefixed names that are not parent segments', () => {
    expect(normalizeRelative('a//b/./c/')).toBe('a/b/c')
    expect(normalizeRelative('./x')).toBe('x')
    expect(normalizeRelative('..hidden/...x/..y')).toBe('..hidden/...x/..y')
    expect(normalizeRelative('.')).toBe('.')
  })
})
