import type { ContextSignal } from './context-provider'
import { describe, expect, it } from 'vitest'
import {
  buildCandidateSemanticProfile,
  buildRecommendationSemanticProfile,
  calculateLocalSemanticScore,
  CANDIDATE_SEMANTIC_PROFILE_CACHE_MAX,
  clearCandidateSemanticProfileCache,
  getCandidateSemanticProfileCacheSize
} from './semantic-profile'

const devFocusContext: ContextSignal = {
  time: {
    hourOfDay: 10,
    dayOfWeek: 2,
    isWorkingHours: true,
    timeSlot: 'morning'
  },
  clipboard: {
    type: 'files',
    content: 'hash_only',
    timestamp: Date.now(),
    contentType: 'file',
    meta: {
      fileType: 'code',
      language: 'typescript'
    }
  },
  foregroundApp: {
    bundleId: 'com.microsoft.VSCode',
    name: 'Visual Studio Code'
  },
  systemState: {
    isOnline: true,
    networkType: 'wifi',
    networkIdHash: 'net_private',
    batteryLevel: 80,
    isCharging: true,
    isOnBattery: false,
    isDNDEnabled: true,
    focusMode: 'active',
    powerMode: 'charging',
    locationBucket: 'loc_private',
    timezone: 'Asia/Shanghai'
  }
}

describe('recommendation semantic profile', () => {
  it('scores developer tools above social apps in a focused code context', () => {
    const contextProfile = buildRecommendationSemanticProfile(devFocusContext)
    const vscodeProfile = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: 'com.microsoft.VSCode',
      sourceType: 'app'
    })
    const discordProfile = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: 'discord',
      sourceType: 'app'
    })

    expect(calculateLocalSemanticScore(contextProfile, vscodeProfile)).toBeGreaterThan(
      calculateLocalSemanticScore(contextProfile, discordProfile)
    )
  })

  it('keeps non-ASCII app names as tokens instead of erasing them', () => {
    // splitIdentifier used to strip everything outside [a-zA-Z0-9], so each of
    // these collapsed to the same profile — only the ASCII path segment survived
    // and 'app' is a stop token. They then scored identically for every context
    // under calculateLocalSemanticScore (#661).
    const wechat = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: '/Applications/微信.app',
      sourceType: 'app'
    })
    const netease = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: '/Applications/网易云音乐.app',
      sourceType: 'app'
    })

    expect(wechat.text).toContain('微信')
    expect(netease.text).toContain('网易云音乐')
    expect(wechat.text).not.toBe(netease.text)
  })

  it('tokenises Cyrillic and accented Latin names too', () => {
    const cyrillic = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: '/Applications/Телеграм.app',
      sourceType: 'app'
    })
    const accented = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: '/Applications/Café Résumé.app',
      sourceType: 'app'
    })

    expect(cyrillic.text).toContain('телеграм')
    // The accent must survive rather than splitting 'café' into 'caf'.
    expect(accented.text).toContain('café')
    expect(accented.text).toContain('résumé')
  })

  it('does not include raw private network, location, or timezone values in profile text', () => {
    const contextProfile = buildRecommendationSemanticProfile(devFocusContext)

    expect(contextProfile.text).toContain('location:bucket')
    expect(contextProfile.text).not.toContain('net_private')
    expect(contextProfile.text).not.toContain('loc_private')
    expect(contextProfile.text).not.toContain('Asia/Shanghai')
  })

  it('memoizes candidate profiles with a bounded 512-entry LRU while preserving number[] vector shape', () => {
    clearCandidateSemanticProfileCache()

    const first = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: '/Applications/Visual Studio Code.app',
      sourceType: 'application',
      source: 'frequent'
    })
    const second = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: '/Applications/Visual Studio Code.app',
      sourceType: 'application',
      source: 'frequent'
    })

    expect(second).toBe(first)
    expect(Array.isArray(first.vector)).toBe(true)
    expect(first.vector).toHaveLength(64)
    expect(Object.keys(first)).toEqual(['tokens', 'text', 'vector'])

    for (let i = 0; i < CANDIDATE_SEMANTIC_PROFILE_CACHE_MAX + 25; i += 1) {
      buildCandidateSemanticProfile({
        sourceId: 'file-provider',
        itemId: `/Users/x/Documents/doc-${i}.md`,
        sourceType: 'file'
      })
    }

    expect(getCandidateSemanticProfileCacheSize()).toBe(CANDIDATE_SEMANTIC_PROFILE_CACHE_MAX)
  })

  it('tags common cross-platform terminals with app:terminal while rejecting ambiguous non-terminals', () => {
    clearCandidateSemanticProfileCache()

    const terminalCandidates = [
      { itemId: '/Applications/Hyper.app', title: 'Hyper' },
      { itemId: '/Applications/Tabby.app', title: 'Tabby' },
      { itemId: '/Applications/cmux.app', title: 'cmux' },
      { itemId: '/Applications/Ghostty.app', title: 'Ghostty' },
      { itemId: 'dev.warp.Warp-Stable', title: 'Warp' },
      { itemId: '/Applications/Warp.app', title: 'Warp' },
      { itemId: 'com.github.wez.wezterm', title: 'WezTerm' },
      { itemId: 'net.kovidgoyal.kitty', title: 'kitty' },
      { itemId: 'org.alacritty', title: 'Alacritty' },
      { itemId: 'com.raphaelamorim.rio', title: 'Rio' },
      { itemId: '/Applications/Rio.app', title: 'Rio' },
      { itemId: 'dev.waveterm.waveterm', title: 'Wave' },
      { itemId: '/Applications/WaveTerm.app', title: 'WaveTerm' },
      { itemId: '/Applications/WindTerm.app', title: 'WindTerm' },
      { itemId: '/Applications/Electerm.app', title: 'Electerm' },
      { itemId: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', title: 'Windows Terminal' },
      { itemId: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', title: 'PowerShell 7' },
      {
        itemId: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        title: 'Windows PowerShell'
      },
      { itemId: 'C:\\Windows\\System32\\cmd.exe', title: 'Command Prompt' },
      { itemId: 'C:\\Program Files\\Git\\git-bash.exe', title: 'Git Bash' }
    ]

    for (const candidate of terminalCandidates) {
      const profile = buildCandidateSemanticProfile({
        sourceId: 'app-provider',
        itemId: candidate.itemId,
        sourceType: 'application',
        title: candidate.title
      })
      expect(profile.tokens, `expected app:terminal for ${candidate.itemId}`).toContain(
        'app:terminal'
      )
    }

    const nonTerminalCandidates = [
      { itemId: '/Applications/Cloudflare WARP.app', title: 'Cloudflare WARP' },
      { itemId: 'com.cloudflare.1dot1dot1dot1.macos', title: 'Cloudflare WARP' },
      { itemId: '/Applications/Angry Birds Rio.app', title: 'Angry Birds Rio' },
      { itemId: 'com.example.rio', title: 'Rio' },
      { itemId: 'com.waveapps.wave', title: 'Wave' },
      { itemId: '/Applications/Sound Wave.app', title: 'Sound Wave' },
      { itemId: '/Applications/HyperX NGENUITY.app', title: 'HyperX NGENUITY' },
      { itemId: '/Applications/Hello Kitty.app', title: 'Hello Kitty' },
      { itemId: 'com.example.shell', title: 'Shell' },
      { itemId: 'C:\\Program Files\\Tool\\mycmd.exe', title: 'MyCmd' }
    ]

    for (const candidate of nonTerminalCandidates) {
      const profile = buildCandidateSemanticProfile({
        sourceId: 'app-provider',
        itemId: candidate.itemId,
        sourceType: 'application',
        title: candidate.title
      })
      expect(profile.tokens, `expected non-terminal for ${candidate.itemId}`).not.toContain(
        'app:terminal'
      )
    }

    const shellForeground = buildRecommendationSemanticProfile({
      ...devFocusContext,
      clipboard: undefined,
      systemState: undefined,
      foregroundApp: {
        bundleId: 'com.example.shell',
        name: 'Shell'
      }
    })
    expect(shellForeground.tokens).not.toContain('app:terminal')
    expect(shellForeground.tokens).not.toContain('task:dev')

    const warpForeground = buildRecommendationSemanticProfile({
      ...devFocusContext,
      clipboard: undefined,
      systemState: undefined,
      foregroundApp: {
        bundleId: 'com.cloudflare.1dot1dot1dot1.macos',
        name: 'Cloudflare WARP'
      }
    })
    expect(warpForeground.tokens).not.toContain('app:terminal')

    const rioForeground = buildRecommendationSemanticProfile({
      ...devFocusContext,
      clipboard: undefined,
      systemState: undefined,
      foregroundApp: {
        bundleId: 'com.raphaelamorim.rio',
        name: 'Rio'
      }
    })
    expect(rioForeground.tokens).toContain('app:terminal')
  })
})
