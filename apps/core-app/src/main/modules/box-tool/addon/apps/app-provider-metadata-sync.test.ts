import { describe, expect, it } from 'vitest'
import {
  hasAppLaunchMetadataDrift,
  resolveMissingScannedExtensionKeys
} from './app-provider-metadata-sync'
import {
  APP_DESCRIPTION_EXTENSION_KEY,
  APP_DISPLAY_PATH_EXTENSION_KEY,
  APP_LAUNCH_ARGS_EXTENSION_KEY,
  APP_SCANNED_OPTIONAL_EXTENSION_KEYS,
  APP_WORKING_DIRECTORY_EXTENSION_KEY
} from './app-index-metadata'

describe('app provider metadata sync', () => {
  it('detects launch metadata drift', () => {
    expect(
      hasAppLaunchMetadataDrift(
        {
          launchKind: 'shortcut',
          launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
          launchArgs: '--old',
          workingDirectory: 'C:\\Program Files\\Foo',
          displayPath: 'C:\\Program Files\\Foo\\Foo.exe',
          description: 'Old description'
        },
        {
          launchKind: 'shortcut',
          launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
          launchArgs: '--new',
          workingDirectory: 'C:\\Program Files\\Foo',
          displayPath: 'C:\\Program Files\\Foo\\Foo.exe',
          description: 'Old description'
        }
      )
    ).toBe(true)
  })

  it('does not report launch metadata drift for equivalent missing optional values', () => {
    expect(
      hasAppLaunchMetadataDrift(
        {
          launchKind: 'path',
          launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
          launchArgs: null,
          workingDirectory: null,
          displayPath: null,
          description: null
        },
        {
          launchKind: 'path',
          launchTarget: 'C:\\Program Files\\Foo\\Foo.exe'
        }
      )
    ).toBe(false)
  })

  it('treats launch metadata as scanned optional extensions for stale cleanup', () => {
    const missingKeys = resolveMissingScannedExtensionKeys(
      [{ key: 'launchKind' }, { key: 'launchTarget' }],
      APP_SCANNED_OPTIONAL_EXTENSION_KEYS
    )

    expect(missingKeys).toEqual(
      expect.arrayContaining([
        APP_LAUNCH_ARGS_EXTENSION_KEY,
        APP_WORKING_DIRECTORY_EXTENSION_KEY,
        APP_DISPLAY_PATH_EXTENSION_KEY,
        APP_DESCRIPTION_EXTENSION_KEY
      ])
    )
  })
})
