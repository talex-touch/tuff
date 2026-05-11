import { describe, expect, it } from 'vitest'
import {
  buildWindowsCapabilityEvidence,
  normalizeRegistryAppRecord,
  normalizeStartAppRecord,
  parsePowerShellJsonArray,
  verifyWindowsCapabilityEvidence
} from './windows-capability-evidence'

function commandResult(overrides = {}) {
  return {
    command: 'powershell',
    available: true,
    exitCode: 0,
    durationMs: 12,
    ...overrides
  }
}

describe('windows-capability-evidence', () => {
  it('parses PowerShell JSON arrays and single objects', () => {
    expect(
      parsePowerShellJsonArray(
        JSON.stringify({
          Name: 'Calculator',
          AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
        }),
        normalizeStartAppRecord
      )
    ).toEqual([
      {
        name: 'Calculator',
        appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      }
    ])

    expect(
      parsePowerShellJsonArray(
        JSON.stringify([
          {
            DisplayName: 'Codex',
            DisplayIcon: 'C:\\Program Files\\Codex\\Codex.exe,0',
            Publisher: 'OpenAI'
          },
          {
            DisplayName: ''
          }
        ]),
        normalizeRegistryAppRecord
      )
    ).toEqual([
      {
        displayName: 'Codex',
        displayIcon: 'C:\\Program Files\\Codex\\Codex.exe,0',
        publisher: 'OpenAI'
      }
    ])
  })

  it('builds passed evidence when Windows app sources and targets are present', () => {
    const evidence = buildWindowsCapabilityEvidence(
      {
        generatedAt: '2026-05-10T00:00:00.000Z',
        platform: 'win32',
        arch: 'x64',
        targets: ['Calculator', 'Codex'],
        powershell: commandResult(),
        everything: {
          cliPaths: ['C:\\Tools\\es.exe'],
          where: commandResult({ command: 'where es.exe' }),
          version: commandResult({ command: 'es.exe -version' }),
          query: {
            ...commandResult({ command: 'es.exe -n 5 .exe' }),
            resultCount: 5
          },
          targets: [
            {
              target: 'Calculator',
              found: true,
              matchCount: 1,
              samples: ['C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Calculator.lnk']
            },
            {
              target: 'Codex',
              found: true,
              matchCount: 1,
              samples: ['C:\\Program Files\\Codex\\Codex.exe']
            }
          ]
        },
        startApps: [
          {
            name: 'Calculator',
            appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
          }
        ],
        registryApps: [
          {
            displayName: 'Codex',
            displayIcon: 'C:\\Program Files\\Codex\\Codex.exe,0',
            publisher: 'OpenAI'
          }
        ],
        startMenuEntries: [
          {
            path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Codex.lnk',
            name: 'Codex',
            extension: '.lnk',
            target: 'C:\\Program Files\\Codex\\Codex.exe',
            arguments: '--profile default',
            workingDirectory: 'C:\\Program Files\\Codex'
          },
          {
            path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Work Tool.appref-ms',
            name: 'Work Tool',
            extension: '.appref-ms'
          }
        ]
      },
      { requireEverything: true, requireTargets: true }
    )

    expect(evidence.status).toBe('passed')
    expect(evidence.checks.startApps).toMatchObject({
      count: 1,
      uwpCount: 1,
      desktopPathCount: 0
    })
    expect(evidence.checks.registry.executableCandidateCount).toBe(1)
    expect(evidence.checks.startMenu).toMatchObject({
      entryCount: 2,
      lnkCount: 1,
      apprefMsCount: 1,
      shortcutMetadataCount: 1,
      shortcutWithArgumentsCount: 1,
      shortcutWithWorkingDirectoryCount: 1
    })
    expect(evidence.gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('reports degraded Windows evidence without optional Everything or target matches', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      targets: ['WeChat'],
      powershell: commandResult(),
      everything: {
        cliPaths: [],
        where: commandResult({ command: 'where es.exe', available: false, exitCode: 1 })
      },
      startApps: [
        {
          name: 'Calculator',
          appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
        }
      ],
      registryApps: [],
      startMenuEntries: [
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Calculator.lnk',
          name: 'Calculator',
          extension: '.lnk'
        }
      ]
    })

    expect(evidence.status).toBe('degraded')
    expect(evidence.gate.passed).toBe(true)
    expect(evidence.gate.warnings).toEqual([
      'registry uninstall fallback produced no executable candidates',
      'Everything CLI es.exe was not found',
      'targets not found: WeChat'
    ])
  })

  it('includes Windows installer dry-run handoff evidence without enabling unattended install', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      targets: [],
      powershell: commandResult(),
      everything: {
        cliPaths: ['C:\\Tools\\es.exe'],
        where: commandResult({ command: 'where es.exe' }),
        query: {
          ...commandResult({ command: 'es.exe -n 5 .exe' }),
          resultCount: 5
        },
        targets: [
          {
            target: 'Calculator',
            found: true,
            matchCount: 1,
            samples: ['C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Calculator.lnk']
          }
        ]
      },
      startApps: [
        {
          name: 'Calculator',
          appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
        }
      ],
      registryApps: [
        {
          displayName: 'Codex',
          displayIcon: 'C:\\Program Files\\Codex\\Codex.exe,0'
        }
      ],
      startMenuEntries: [
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Codex.lnk',
          name: 'Codex',
          extension: '.lnk',
          target: 'C:\\Program Files\\Codex\\Codex.exe'
        }
      ],
      installer: {
        path: 'C:\\Downloads\\tuff-2.4.10-setup.exe',
        supported: true,
        type: 'nsis',
        command: 'C:\\Downloads\\tuff-2.4.10-setup.exe',
        args: ['/S'],
        launchMode: 'detached-handoff',
        requestAppQuitAfterLaunch: true,
        unattendedAutoInstallEnabled: false
      }
    })

    expect(evidence.checks.installer).toEqual({
      path: 'C:\\Downloads\\tuff-2.4.10-setup.exe',
      supported: true,
      type: 'nsis',
      command: 'C:\\Downloads\\tuff-2.4.10-setup.exe',
      args: ['/S'],
      launchMode: 'detached-handoff',
      requestAppQuitAfterLaunch: true,
      unattendedAutoInstallEnabled: false
    })
  })

  it('fails strict target and Everything requirements', () => {
    const evidence = buildWindowsCapabilityEvidence(
      {
        generatedAt: '2026-05-10T00:00:00.000Z',
        platform: 'win32',
        arch: 'x64',
        targets: ['WeChat'],
        powershell: commandResult(),
        everything: {
          cliPaths: [],
          where: commandResult({ command: 'where es.exe', available: false, exitCode: 1 })
        },
        startApps: [],
        registryApps: [],
        startMenuEntries: []
      },
      { requireEverything: true, requireTargets: true }
    )

    expect(evidence.status).toBe('failed')
    expect(evidence.gate.failures).toEqual([
      'Get-StartApps returned no applications',
      'Start Menu scan returned no .lnk/.appref-ms/.exe entries',
      'Everything CLI es.exe was not found',
      'targets not found: WeChat'
    ])
  })

  it('verifies collected evidence with explicit Windows acceptance gates', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      targets: ['Calculator'],
      powershell: commandResult(),
      everything: {
        cliPaths: ['C:\\Tools\\es.exe'],
        where: commandResult({ command: 'where es.exe' }),
        query: {
          ...commandResult({ command: 'es.exe -n 5 .exe' }),
          resultCount: 5
        },
        targets: [
          {
            target: 'Calculator',
            found: true,
            matchCount: 1,
            samples: ['C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Calculator.lnk']
          }
        ]
      },
      startApps: [
        {
          name: 'Calculator',
          appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
        }
      ],
      registryApps: [
        {
          displayName: 'Codex',
          displayIcon: 'C:\\Program Files\\Codex\\Codex.exe,0'
        }
      ],
      startMenuEntries: [
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Calculator.lnk',
          name: 'Calculator',
          extension: '.lnk',
          target: 'C:\\Windows\\System32\\calc.exe',
          arguments: '--safe-mode',
          workingDirectory: 'C:\\Windows\\System32'
        },
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\ClickOnce Tool.appref-ms',
          name: 'ClickOnce Tool',
          extension: '.appref-ms'
        }
      ],
      installer: {
        path: 'C:\\Downloads\\tuff-2.4.10.msi',
        supported: true,
        type: 'msi',
        command: 'msiexec.exe',
        args: ['/i', 'C:\\Downloads\\tuff-2.4.10.msi', '/passive', '/norestart'],
        launchMode: 'detached-handoff',
        requestAppQuitAfterLaunch: true,
        unattendedAutoInstallEnabled: false
      }
    })

    expect(
      verifyWindowsCapabilityEvidence(evidence, {
        requireEverything: true,
        requireTargets: true,
        requireEverythingTargets: true,
        requireUwp: true,
        requireRegistryFallback: true,
        requireShortcutMetadata: true,
        requireApprefMs: true,
        requireShortcutArguments: true,
        requireShortcutWorkingDirectory: true,
        requireInstallerHandoff: true
      }).gate
    ).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails verifier gates for weak Windows evidence', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      targets: ['WeChat'],
      powershell: commandResult(),
      everything: {
        cliPaths: [],
        where: commandResult({ command: 'where es.exe', available: false, exitCode: 1 }),
        targets: [
          {
            target: 'WeChat',
            found: false,
            matchCount: 0,
            samples: []
          }
        ]
      },
      startApps: [{ name: 'Desktop App', appId: 'C:\\Program Files\\App\\App.exe' }],
      registryApps: [],
      startMenuEntries: [
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Desktop App.lnk',
          name: 'Desktop App',
          extension: '.lnk'
        }
      ],
      installer: {
        path: 'C:\\Downloads\\tuff.exe',
        supported: false,
        launchMode: 'manual-installer',
        requestAppQuitAfterLaunch: false,
        unattendedAutoInstallEnabled: false,
        reason: 'unsupported-installer'
      }
    })

    expect(
      verifyWindowsCapabilityEvidence(evidence, {
        requireEverything: true,
        requireTargets: true,
        requireEverythingTargets: true,
        requireUwp: true,
        requireRegistryFallback: true,
        requireShortcutMetadata: true,
        requireApprefMs: true,
        requireShortcutArguments: true,
        requireShortcutWorkingDirectory: true,
        requireInstallerHandoff: true
      }).gate.failures
    ).toEqual([
      'Get-StartApps returned no UWP applications',
      'Start Menu scan returned no .appref-ms entries',
      'Start Menu shortcut metadata was not resolved',
      'Start Menu shortcut arguments were not resolved',
      'Start Menu shortcut workingDirectory was not resolved',
      'registry uninstall fallback produced no executable candidates',
      'Everything CLI es.exe was not found',
      'Everything query evidence did not return results',
      'Everything targets not found: WeChat',
      'targets not found: WeChat',
      'installer dry-run evidence does not support detached handoff'
    ])
  })

  it('requires Everything query output and concrete target samples when target gate is enabled', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      targets: ['WeChat'],
      powershell: commandResult(),
      everything: {
        cliPaths: ['C:\\Tools\\es.exe'],
        where: commandResult({ command: 'where es.exe' }),
        query: {
          ...commandResult({ command: 'es.exe -n 5 .exe' }),
          resultCount: 0
        },
        targets: [
          {
            target: 'WeChat',
            found: true,
            matchCount: 1,
            samples: []
          }
        ]
      },
      startApps: [{ name: 'WeChat', appId: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe' }],
      registryApps: [
        {
          displayName: 'WeChat',
          displayIcon: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe,0'
        }
      ],
      startMenuEntries: [
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\WeChat.lnk',
          name: 'WeChat',
          extension: '.lnk',
          target: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe'
        }
      ]
    })

    expect(
      verifyWindowsCapabilityEvidence(evidence, {
        requireEverything: true,
        requireEverythingTargets: true,
        requireTargets: true
      }).gate.failures
    ).toEqual([
      'Everything query evidence did not return results',
      'Everything targets not found: WeChat'
    ])
  })

  it('rejects Everything target probes whose samples do not match the target', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      targets: ['WeChat'],
      powershell: commandResult(),
      everything: {
        cliPaths: ['C:\\Tools\\es.exe'],
        where: commandResult({ command: 'where es.exe' }),
        query: {
          ...commandResult({ command: 'es.exe -n 5 .exe' }),
          resultCount: 5
        },
        targets: [
          {
            target: 'WeChat',
            found: true,
            matchCount: 1,
            samples: ['C:\\Tools\\Other.exe']
          }
        ]
      },
      startApps: [{ name: 'WeChat', appId: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe' }],
      registryApps: [
        {
          displayName: 'WeChat',
          displayIcon: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe,0'
        }
      ],
      startMenuEntries: [
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\WeChat.lnk',
          name: 'WeChat',
          extension: '.lnk',
          target: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe'
        }
      ]
    })

    expect(
      verifyWindowsCapabilityEvidence(evidence, {
        requireEverything: true,
        requireEverythingTargets: true,
        requireTargets: true
      }).gate.failures
    ).toEqual(['Everything targets not found: WeChat'])
  })

  it('marks non-Windows evidence as skipped unless strict mode is requested', () => {
    const evidence = buildWindowsCapabilityEvidence({
      generatedAt: '2026-05-10T00:00:00.000Z',
      platform: 'darwin',
      arch: 'arm64',
      targets: [],
      powershell: commandResult({ available: false, exitCode: null }),
      everything: {
        cliPaths: [],
        where: commandResult({ command: 'where es.exe', available: false, exitCode: null })
      },
      startApps: [],
      registryApps: [],
      startMenuEntries: []
    })

    expect(evidence.status).toBe('skipped')
    expect(evidence.gate).toEqual({
      passed: true,
      failures: [],
      warnings: ['platform darwin is not win32']
    })
  })
})
