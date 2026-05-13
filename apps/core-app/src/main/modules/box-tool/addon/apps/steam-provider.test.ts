import { describe, expect, it } from 'vitest'
import {
  parseSteamAppManifest,
  parseSteamLibraryFolders,
  steamAppToScannedAppInfo
} from './steam-provider'

describe('steam provider', () => {
  it('parses legacy and modern Steam libraryfolders.vdf formats', () => {
    const content = `
"libraryfolders"
{
  "0" "C:\\Program Files (x86)\\Steam"
  "1"
  {
    "path" "D:\\SteamLibrary"
  }
  "2"
  {
    "path" "E:/Games/Steam"
  }
}`

    expect(parseSteamLibraryFolders(content, 'C:\\Program Files (x86)\\Steam')).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary',
      'E:/Games/Steam'
    ])
  })

  it('parses Steam app manifests', () => {
    const content = `
"AppState"
{
  "appid" "12345"
  "name" "Portal 2"
  "installdir" "Portal 2"
}`

    expect(parseSteamAppManifest(content, 'D:\\SteamLibrary')).toEqual({
      appid: '12345',
      name: 'Portal 2',
      installdir: 'Portal 2',
      libraryPath: 'D:\\SteamLibrary'
    })
  })

  it('rejects incomplete or non-numeric app manifests', () => {
    expect(parseSteamAppManifest('"appid" "abc"\n"name" "Bad"', 'D:\\SteamLibrary')).toBeNull()
    expect(parseSteamAppManifest('"appid" "12345"', 'D:\\SteamLibrary')).toBeNull()
  })

  it('maps Steam manifests to protocol app index entries', () => {
    const app = steamAppToScannedAppInfo({
      appid: '12345',
      name: 'Portal 2',
      installdir: 'Portal 2',
      libraryPath: 'D:\\SteamLibrary'
    })

    expect(app).toMatchObject({
      displayName: 'Portal 2',
      bundleId: 'steam:12345',
      path: 'steam://rungameid/12345',
      launchKind: 'protocol',
      launchTarget: 'steam://rungameid/12345',
      displayPath: 'Steam'
    })
    expect(app.alternateNames).toEqual(
      expect.arrayContaining(['Portal 2', '12345', 'D:\\SteamLibrary/steamapps/common/Portal 2'])
    )
  })
})
