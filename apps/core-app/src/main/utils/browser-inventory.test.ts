import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverNativeBrowsers } from './browser-inventory'

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))

vi.mock('node:child_process', () => {
  // The module runs the probe through `promisify(execFile)`, so the mock has to expose the same
  // custom-promisify hook the real `execFile` does.
  ;(execFileMock as unknown as Record<symbol, unknown>)[
    Symbol.for('nodejs.util.promisify.custom')
  ] = (command: string, args: readonly string[]) => {
    const { promise, resolve, reject } = Promise.withResolvers<{
      stdout: string
      stderr: string
    }>()
    execFileMock(command, args, {}, (error: Error | null, stdout = '') => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout, stderr: '' })
    })
    return promise
  }

  return { execFile: execFileMock }
})

/** Answers the next probe with `stdout`; the module checks no other field of the result. */
function probeAnswers(stdout: string): void {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: readonly string[],
      _options: unknown,
      callback: (error: null, stdout: string) => void
    ) => {
      callback(null, stdout)
    }
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('discoverNativeBrowsers', () => {
  it('keeps only macOS apps the OS both ranks for https and that declare a real HTML type', async () => {
    probeAnswers(
      JSON.stringify([
        {
          path: '/Applications/ego lite.app',
          bundleId: 'com.citrolabs.ego.lite',
          name: 'ego lite',
          declaresHtml: true,
          shellRole: false
        },
        {
          // Answers the https query but declares no HTML document type: a downloader, not a browser.
          path: '/Applications/Downie.app',
          bundleId: 'com.charliemonroe.Downie',
          name: 'Downie',
          declaresHtml: false,
          shellRole: false
        },
        {
          // A terminal that claims the HTML role: excluded by its shell role alone.
          path: '/Applications/iTerm.app',
          bundleId: 'com.googlecode.iterm2',
          name: 'iTerm2',
          declaresHtml: true,
          shellRole: true
        },
        {
          // Absolute and an app bundle, but the identity cannot produce a legal public id.
          path: '/Applications/!!!.app',
          bundleId: '!!!',
          name: '',
          declaresHtml: true,
          shellRole: false
        }
      ])
    )

    const browsers = await discoverNativeBrowsers({ platform: 'darwin', environment: {} })

    expect(browsers).toEqual([
      { id: 'ego-lite', name: 'ego lite', path: '/Applications/ego lite.app' }
    ])
  })

  it('keeps the public id of a known macOS browser rather than deriving a new one', async () => {
    probeAnswers(
      JSON.stringify([
        {
          path: '/Applications/Safari.app',
          bundleId: 'com.apple.Safari',
          name: 'Safari',
          declaresHtml: true,
          shellRole: false
        }
      ])
    )

    const browsers = await discoverNativeBrowsers({ platform: 'darwin', environment: {} })

    expect(browsers[0]?.id).toBe('safari')
  })

  it('reads an unquoted absolute App Paths executable that contains spaces', async () => {
    probeAnswers(
      JSON.stringify([
        {
          Source: 'app-paths',
          Name: 'Chrome',
          Command: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        }
      ])
    )

    const browsers = await discoverNativeBrowsers({
      platform: 'win32',
      environment: { SystemRoot: 'C:\\Windows' }
    })

    expect(browsers).toEqual([
      {
        id: 'chrome',
        name: 'Chrome',
        path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      }
    ])
  })

  it('treats the OS browser registry as authoritative and the App Paths list as an allowlist', async () => {
    probeAnswers(
      JSON.stringify([
        {
          Source: 'start-menu-internet',
          Name: 'Some Browser',
          Command: '"/opt/weird/Browser.exe" --single-argument %1'
        },
        {
          Source: 'app-paths',
          Name: '',
          Command: '"C:\\Program Files\\NotABrowser\\not-a-browser.exe" "%1"'
        },
        {
          Source: 'app-paths',
          Name: 'Chrome',
          Command: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -- "%1"'
        }
      ])
    )

    const browsers = await discoverNativeBrowsers({
      platform: 'win32',
      environment: { SystemRoot: 'C:\\Windows' }
    })

    expect(browsers.map((browser) => browser.path)).toEqual([
      '\\opt\\weird\\Browser.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    ])
    expect(browsers[1]?.id).toBe('chrome')
  })

  it('refuses to guess a PowerShell location when the Windows directory is unknown', async () => {
    await expect(discoverNativeBrowsers({ platform: 'win32', environment: {} })).rejects.toThrow()
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('asks nothing of the OS on an unsupported platform', async () => {
    const browsers = await discoverNativeBrowsers({ platform: 'linux', environment: {} })

    expect(browsers).toEqual([])
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
