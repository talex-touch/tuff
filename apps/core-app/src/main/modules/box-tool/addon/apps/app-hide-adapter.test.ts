import { afterEach, describe, expect, it, vi } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }))
}))

import { putAwayApplicationInFront } from './app-hide-adapter'

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  }
}

describe('putAwayApplicationInFront', () => {
  afterEach(() => {
    execFileMock.mockReset()
  })

  it('passes Windows target path via env var instead of PowerShell -Command argv', async () => {
    const evilPath = 'C:\\Apps\\x; Start-Process calc.exe; #.exe'
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, { stdout: JSON.stringify({ hidden: true }), stderr: '' })
    })

    const result = await withPlatform('win32', () => putAwayApplicationInFront({ path: evilPath }))

    expect(result).toEqual({ hidden: true, reason: undefined })
    expect(execFileMock).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = execFileMock.mock.calls[0]!
    expect(cmd).toBe('powershell')
    expect(args).not.toContain(evilPath)
    expect(args.at(-1)).toContain('$env:TUFF_APP_HIDE_PATH')
    expect(opts.env?.TUFF_APP_HIDE_PATH).toBe(evilPath)
  })

  it('inserts -- separator and sanitizes malformed bundleId on macOS osascript', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, { stdout: JSON.stringify({ hidden: false, reason: 'not-frontmost' }), stderr: '' })
    })

    await withPlatform('darwin', () =>
      putAwayApplicationInFront({
        bundleId: '-e do shell script "id"',
        path: '/Applications/Demo.app'
      })
    )

    const [cmd, args] = execFileMock.mock.calls[0]!
    expect(cmd).toBe('osascript')
    expect(args.slice(-3)).toEqual(['--', '', '/Applications/Demo.app'])
  })

  it('rejects paths containing NUL or newline characters without spawning', async () => {
    const outcome = await withPlatform('win32', () =>
      putAwayApplicationInFront({ path: 'C:\\Apps\\evil.exe\nwhoami' })
    )
    expect(outcome).toEqual({ hidden: false, reason: 'invalid-target' })
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
