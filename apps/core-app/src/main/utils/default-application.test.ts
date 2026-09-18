import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DefaultApplicationResolveError,
  resolveDefaultApplicationTarget
} from './default-application'

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

/**
 * The module short-circuits to `null` off macOS, so the cases below run as if on darwin: nothing
 * they cover is macOS-specific — the argv handoff, the payload parsing and the path ceiling are
 * all plain logic — and on a Linux runner they would otherwise all answer `null` and fail without
 * testing anything. The off-macOS guard case overrides this to `win32`.
 */
const hostPlatform = process.platform
const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

beforeEach(() => {
  setPlatform('darwin')
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
  setPlatform(hostPlatform)
})

describe('resolveDefaultApplicationTarget guards', () => {
  it('answers nothing off macOS', async () => {
    setPlatform('win32')
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toBeNull()
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

  it('reports a failure when the indexed file cannot be read', async () => {
    accessMock.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).rejects.toThrow(
      DefaultApplicationResolveError
    )
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('accepts a path exactly at the length ceiling and refuses the one past it', async () => {
    const atCeiling = `/${'a'.repeat(4095)}`
    const overCeiling = `/${'a'.repeat(4096)}`
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(atCeiling)).resolves.toMatchObject({
      target: APPLICATION
    })

    execFileMock.mockClear()
    await expect(resolveDefaultApplicationTarget(overCeiling)).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
  })
})

describe('resolveDefaultApplicationTarget osascript payload', () => {
  it('returns the application LaunchServices reports for the file', async () => {
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toEqual({
      target: APPLICATION,
      // No candidate list in the payload still yields one candidate: the default itself, so a
      // caller never has to special-case "the OS could not enumerate handlers".
      candidates: [APPLICATION]
    })
  })

  it('lists every handler the OS offers, default first and never twice', async () => {
    const quicktime = {
      path: '/System/Applications/QuickTime Player.app',
      bundleId: 'com.apple.QuickTimePlayerX',
      displayName: 'QuickTime Player'
    }
    osascriptReply = {
      stdout: JSON.stringify({
        ...APPLICATION,
        // LaunchServices repeats the default inside the candidate list, and a malformed entry
        // must not cost the caller the rest of the list.
        candidates: [APPLICATION, quicktime, { bundleId: 'com.apple.Nothing' }]
      })
    }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toEqual({
      target: APPLICATION,
      candidates: [APPLICATION, quicktime]
    })
  })

  it('reports a bundle that declares no identifier or name as empty strings', async () => {
    osascriptReply = { stdout: JSON.stringify({ path: '/Applications/Preview.app' }) }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toMatchObject({
      target: {
        path: '/Applications/Preview.app',
        bundleId: '',
        displayName: ''
      }
    })
  })

  it('answers nothing for an association the OS cannot name', async () => {
    // The JXA script answers an empty string when LaunchServices resolves the file to no
    // application. That is an answer, and the caller's fallback is the right outcome for it.
    for (const stdout of ['', '   ']) {
      osascriptReply = { stdout }
      await expect(resolveDefaultApplicationTarget(FILE_PATH)).resolves.toBeNull()
    }
  })

  it('reports a failure when the OS answer is not the payload it promised', async () => {
    const malformedPayloads = [
      'not json',
      '"Preview"',
      'null',
      '{}',
      '{"bundleId":"com.apple.Preview"}'
    ]

    for (const stdout of malformedPayloads) {
      osascriptReply = { stdout }
      await expect(resolveDefaultApplicationTarget(FILE_PATH)).rejects.toThrow(
        DefaultApplicationResolveError
      )
    }
  })

  it('reports a failure when the OS call fails or times out', async () => {
    const failure = Object.assign(new Error('Command failed: /usr/bin/osascript'), { killed: true })
    osascriptReply = { error: failure }

    await expect(resolveDefaultApplicationTarget(FILE_PATH)).rejects.toThrow(
      DefaultApplicationResolveError
    )
    // The original failure travels on `cause`: it is the detail the operational report records.
    await expect(resolveDefaultApplicationTarget(FILE_PATH)).rejects.toMatchObject({
      cause: failure
    })
  })

  it('asks about the path as the index holds it, trailing whitespace included', async () => {
    const spacedPath = '/Users/demo/Documents/report.pdf '
    osascriptReply = { stdout: JSON.stringify(APPLICATION) }

    await expect(resolveDefaultApplicationTarget(spacedPath)).resolves.toMatchObject({
      target: APPLICATION
    })

    expect(accessMock).toHaveBeenCalledWith(spacedPath)
    expect(execFileMock.mock.calls[0]?.[1]).toContain(spacedPath)
  })
})
