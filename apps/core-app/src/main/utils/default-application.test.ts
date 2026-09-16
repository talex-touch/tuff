import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDefaultApplicationTarget } from './default-application'

const { accessMock, execFileMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  execFileMock: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  default: { access: accessMock }
}))

vi.mock('node:child_process', () => {
  // The module under test runs the binary through `promisify(execFile)`, so the mock has to
  // expose the same custom-promisify hook the real `execFile` does.
  ;(execFileMock as unknown as Record<symbol, unknown>)[
    Symbol.for('nodejs.util.promisify.custom')
  ] = (command: string, args: string[]) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFileMock(command, args, {}, (error: Error | null, stdout = '', stderr = '') => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      })
    })

  return { execFile: execFileMock }
})

type ExecFileCallback = (error: Error | null, stdout?: string) => void
type OsascriptReply = { stdout: string } | { error: Error }

const FILE_PATH = '/Users/demo/Documents/report.pdf'
const APPLICATION = {
  path: '/Applications/Preview.app',
  bundleId: 'com.apple.Preview',
  displayName: 'Preview'
}

// What the OS call answers for the current test. A plain variable rather than queued
// once-implementations: a guard that returns before spawning leaves a queued answer behind, and
// that stale answer would then be handed to the next test.
let osascriptReply: OsascriptReply = { stdout: '' }

beforeEach(() => {
  // The file exists unless a case says otherwise, so a null result can only come from the guard
  // under test rather than from an unrelated failure.
  accessMock.mockResolvedValue(undefined)
  osascriptReply = { stdout: '' }

  execFileMock.mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as ExecFileCallback
    if ('error' in osascriptReply) {
      callback(osascriptReply.error)
      return
    }
    callback(null, osascriptReply.stdout)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolveDefaultApplicationTarget guards', () => {
  it('answers nothing off macOS', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

    try {
      osascriptReply = { stdout: JSON.stringify(APPLICATION) }
      await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toBeNull()
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it('never asks the OS about a path that is not absolute', async () => {
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget('./report.pdf')).resolves.toBeNull()
    await expect(resolveDefaultApplicationTarget('report.pdf')).resolves.toBeNull()
    await expect(resolveDefaultApplicationTarget('')).resolves.toBeNull()
    await expect(resolveDefaultApplicationTarget('   ')).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('never asks the OS about a path the index does not have', async () => {
    accessMock.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('accepts a path exactly at the length ceiling and refuses the one past it', async () => {
    const atCeiling = `/${'a'.repeat(4095)}`
    const overCeiling = `/${'a'.repeat(4096)}`
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(atCeiling)).resolves.toEqual(APPLICATION)

    execFileMock.mockClear()
    await expect(resolveDefaultApplicationTarget(overCeiling)).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
  })
})

describe('resolveDefaultApplicationTarget osascript payload', () => {
  it('returns the application LaunchServices reports for the file', async () => {
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toEqual(APPLICATION)
  })

  it('reports a bundle that declares no identifier or name as empty strings', async () => {
    osascriptReply = { stdout: JSON.stringify({ path: '/Applications/Preview.app' }) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toEqual({
      path: '/Applications/Preview.app',
      bundleId: '',
      displayName: ''
    })
  })

  it('answers nothing for an association the OS cannot name', async () => {
    const unusablePayloads = [
      '',
      '   ',
      'not json',
      '"Preview"',
      'null',
      '{}',
      '{"bundleId":"com.apple.Preview"}'
    ]

    for (const stdout of unusablePayloads) {
      osascriptReply = { stdout }
      await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toBeNull()
    }
  })

  it('answers nothing instead of throwing when the OS call fails', async () => {
    osascriptReply = {
      error: Object.assign(new Error('Command failed: /usr/bin/osascript'), { killed: true })
    }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toBeNull()
  })
})
