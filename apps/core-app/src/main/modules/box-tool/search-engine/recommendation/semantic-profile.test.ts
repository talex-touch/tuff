import type { ContextSignal } from './context-provider'
import { describe, expect, it } from 'vitest'
import {
  buildCandidateSemanticProfile,
  buildRecommendationSemanticProfile,
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
    const terminalProfile = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: 'com.apple.Terminal',
      sourceType: 'app'
    })
    const discordProfile = buildCandidateSemanticProfile({
      sourceId: 'app-provider',
      itemId: 'discord',
      sourceType: 'app'
    })

    expect(calculateLocalSemanticScore(contextProfile, terminalProfile)).toBeGreaterThan(
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
})
