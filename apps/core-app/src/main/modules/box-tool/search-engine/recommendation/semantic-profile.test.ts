import type { ContextSignal } from './context-provider'
import { describe, expect, it } from 'vitest'
import {
  buildCandidateSemanticProfile,
  buildRecommendationSemanticProfile,
  buildRecommendationUsageAvoidanceProfile,
  buildRecommendationUsagePreferenceProfile,
  calculateLocalSemanticScore
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

  it('builds a local usage preference vector from historical app behavior', () => {
    const now = new Date('2026-05-04T09:00:00.000Z').getTime()
    const preferenceProfile = buildRecommendationUsagePreferenceProfile(
      [
        {
          sourceId: 'app-provider',
          itemId: 'com.microsoft.VSCode',
          sourceType: 'app',
          executeCount: 40,
          searchCount: 8,
          lastExecuted: new Date('2026-05-04T08:55:00.000Z')
        },
        {
          sourceId: 'app-provider',
          itemId: 'discord',
          sourceType: 'app',
          executeCount: 2,
          lastExecuted: new Date('2026-05-04T08:55:00.000Z')
        }
      ],
      now
    )
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

    expect(preferenceProfile?.text).toContain('app:ide')
    expect(preferenceProfile).not.toBeNull()
    expect(calculateLocalSemanticScore(preferenceProfile!, vscodeProfile)).toBeGreaterThan(
      calculateLocalSemanticScore(preferenceProfile!, discordProfile)
    )
  })

  it('builds a local usage avoidance vector from repeated cancellation behavior', () => {
    const now = new Date('2026-05-04T09:00:00.000Z').getTime()
    const avoidanceProfile = buildRecommendationUsageAvoidanceProfile(
      [
        {
          sourceId: 'app-provider',
          itemId: 'discord',
          sourceType: 'app',
          cancelCount: 12,
          executeCount: 0,
          lastCancelled: new Date('2026-05-04T08:55:00.000Z')
        },
        {
          sourceId: 'app-provider',
          itemId: 'com.microsoft.VSCode',
          sourceType: 'app',
          cancelCount: 1,
          executeCount: 20,
          lastExecuted: new Date('2026-05-04T08:55:00.000Z')
        }
      ],
      now
    )
    const telegramProfile = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: 'telegram',
      sourceType: 'app'
    })
    const terminalProfile = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: 'com.apple.Terminal',
      sourceType: 'app'
    })

    expect(avoidanceProfile).not.toBeNull()
    expect(avoidanceProfile?.text).toContain('app:social')
    expect(avoidanceProfile?.text).not.toContain('discord')
    expect(calculateLocalSemanticScore(avoidanceProfile!, telegramProfile)).toBeGreaterThan(
      calculateLocalSemanticScore(avoidanceProfile!, terminalProfile)
    )
  })
})
