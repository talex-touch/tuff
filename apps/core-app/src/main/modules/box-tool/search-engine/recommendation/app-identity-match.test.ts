import { describe, expect, it } from 'vitest'
import { extractAppNameFromPath, isSameAppIdentity, matchesAppRule } from './app-identity-match'

const ideRule = {
  bundleIds: ['com.microsoft.VSCode', 'com.jetbrains'],
  names: ['visual studio code', 'intellij idea']
}

describe('extractAppNameFromPath', () => {
  it('takes the app name out of a path-form identifier', () => {
    expect(extractAppNameFromPath('/Applications/Visual Studio Code.app')).toBe(
      'visual studio code'
    )
    expect(extractAppNameFromPath('C:\\Program Files\\IntelliJ IDEA\\idea64.exe')).toBe('idea64')
  })

  it('returns null for bundle-id-form identifiers', () => {
    expect(extractAppNameFromPath('com.microsoft.VSCode')).toBeNull()
  })
})

describe('matchesAppRule', () => {
  it('matches bundle-id-form identifiers', () => {
    expect(matchesAppRule('com.microsoft.VSCode', ideRule)).toBe(true)
    expect(matchesAppRule('com.jetbrains.intellij', ideRule)).toBe(true)
  })

  it('matches path-form identifiers through the app name', () => {
    // The item id the app provider stores for scanned apps is the path, which
    // contains no bundle id at all.
    expect(matchesAppRule('/Applications/Visual Studio Code.app', ideRule)).toBe(true)
    expect(matchesAppRule('/Applications/IntelliJ IDEA.app', ideRule)).toBe(true)
  })

  it('does not match unrelated apps', () => {
    expect(matchesAppRule('/Applications/Spotify.app', ideRule)).toBe(false)
    expect(matchesAppRule('com.spotify.client', ideRule)).toBe(false)
    expect(matchesAppRule('', ideRule)).toBe(false)
  })

  it('ignores name candidates when the rule declares none', () => {
    expect(
      matchesAppRule('/Applications/Visual Studio Code.app', {
        bundleIds: ['com.microsoft.VSCode']
      })
    ).toBe(false)
  })
})

describe('isSameAppIdentity', () => {
  const foreground = { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }

  it('matches a bundle-id candidate against the foreground bundle id', () => {
    expect(isSameAppIdentity('com.microsoft.VSCode', foreground)).toBe(true)
  })

  it('matches a path-form candidate against the foreground display name', () => {
    expect(isSameAppIdentity('/Applications/Visual Studio Code.app', foreground)).toBe(true)
  })

  it('does not match a different app with a similar path', () => {
    expect(isSameAppIdentity('/Applications/Visual Studio.app', foreground)).toBe(false)
    expect(isSameAppIdentity('/Applications/Spotify.app', foreground)).toBe(false)
  })

  it('needs a display name to compare a path-form candidate', () => {
    expect(
      isSameAppIdentity('/Applications/Visual Studio Code.app', {
        bundleId: 'com.microsoft.VSCode',
        name: ''
      })
    ).toBe(false)
  })
})
