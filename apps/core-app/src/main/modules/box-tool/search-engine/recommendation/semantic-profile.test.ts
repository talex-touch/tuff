import type { ContextSignal } from './context-provider'
import { describe, expect, it } from 'vitest'
import {
  buildCandidateSemanticProfile,
  buildRecommendationSemanticProfile,
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
})
