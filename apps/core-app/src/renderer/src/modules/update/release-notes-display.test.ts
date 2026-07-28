import type { BundledReleaseNotesCatalog } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { resolveReleaseNotesStartupDecision } from './release-notes-display'

const summary = {
  zh: ['摘要一', '摘要二', '摘要三'],
  en: ['Summary one', 'Summary two', 'Summary three']
}

function catalog(currentVersion = '2.4.14'): BundledReleaseNotesCatalog {
  return {
    schemaVersion: 1,
    generatedForVersion: currentVersion,
    legacyThrough: {
      RELEASE: '2.4.13',
      BETA: '2.4.13-beta.23'
    },
    entries: [
      { version: '2.4.14-beta.1', tag: 'v2.4.14-beta.1', channel: 'BETA', summary },
      { version: '2.4.14-beta.2', tag: 'v2.4.14-beta.2', channel: 'BETA', summary },
      {
        version: '2.4.14',
        tag: 'v2.4.14',
        channel: 'RELEASE',
        summary,
        currentNotes: { zh: '# 中文\n', en: '# English\n' }
      }
    ]
  }
}

describe('release notes startup decision', () => {
  it('silently acknowledges a fresh install before onboarding completes', () => {
    expect(
      resolveReleaseNotesStartupDecision({
        catalog: catalog(),
        lastAcknowledgedVersion: null,
        onboardingComplete: false
      })
    ).toEqual({ kind: 'acknowledge', version: '2.4.14' })
  })

  it('shows only the current entry when an existing profile has no state yet', () => {
    expect(
      resolveReleaseNotesStartupDecision({
        catalog: catalog(),
        lastAcknowledgedVersion: null,
        onboardingComplete: true
      })
    ).toMatchObject({
      kind: 'show',
      entries: [{ version: '2.4.14' }]
    })
  })

  it('aggregates every Release and Beta entry in the semver upgrade range', () => {
    const decision = resolveReleaseNotesStartupDecision({
      catalog: catalog(),
      lastAcknowledgedVersion: '2.4.13',
      onboardingComplete: true
    })

    expect(decision).toMatchObject({
      kind: 'show',
      entries: [
        { version: '2.4.14-beta.1', channel: 'BETA' },
        { version: '2.4.14-beta.2', channel: 'BETA' },
        { version: '2.4.14', channel: 'RELEASE' }
      ]
    })
  })

  it.each(['2.4.14', '2.4.15'])(
    'does not show for an acknowledged or newer version: %s',
    (version) => {
      expect(
        resolveReleaseNotesStartupDecision({
          catalog: catalog(),
          lastAcknowledgedVersion: version,
          onboardingComplete: true
        })
      ).toEqual({ kind: 'none' })
    }
  )
})
