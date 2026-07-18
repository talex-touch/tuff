import type { UpdateLifecycleSnapshot } from '../../types/update'

import { describe, expect, it } from 'vitest'
import {
  AppPreviewChannel,
  parseUpdateTag,
  resolveUpdateChannelLabel,
  shouldAcceptUpdateLifecycleSnapshot,
  splitUpdateTag,

  validateUpdateReleaseManifest,
} from '../../types/update'

const sha256 = 'a'.repeat(64)
const expectation = {
  tag: 'v2.4.10',
  channel: AppPreviewChannel.RELEASE,
  platform: 'win32' as const,
  arch: 'x64' as const,
}

function validManifest() {
  return {
    schemaVersion: 2,
    release: {
      tag: expectation.tag,
      version: '2.4.10',
      channel: expectation.channel,
      rollbackFromVersion: '2.4.9',
      rollbackCompatible: true,
    },
    artifacts: [
      {
        name: 'Tuff-2.4.10-setup.exe',
        component: 'core',
        platform: expectation.platform,
        arch: expectation.arch,
        sha256,
        signature: 'Tuff-2.4.10-setup.exe.sig',
      },
    ],
  }
}

describe('update tag helpers', () => {
  describe('resolveUpdateChannelLabel', () => {
    it('defaults to release when label is empty', () => {
      expect(resolveUpdateChannelLabel()).toBe(AppPreviewChannel.RELEASE)
      expect(resolveUpdateChannelLabel('')).toBe(AppPreviewChannel.RELEASE)
    })

    it('maps beta labels to BETA', () => {
      expect(resolveUpdateChannelLabel('beta')).toBe(AppPreviewChannel.BETA)
      expect(resolveUpdateChannelLabel('BETA.1')).toBe(AppPreviewChannel.BETA)
    })

    it('maps snapshot labels to BETA', () => {
      expect(resolveUpdateChannelLabel('snapshot')).toBe(
        AppPreviewChannel.BETA,
      )
      expect(resolveUpdateChannelLabel('alpha')).toBe(AppPreviewChannel.BETA)
    })

    it('maps release labels to RELEASE', () => {
      expect(resolveUpdateChannelLabel('release')).toBe(
        AppPreviewChannel.RELEASE,
      )
      expect(resolveUpdateChannelLabel('master')).toBe(
        AppPreviewChannel.RELEASE,
      )
    })
  })

  describe('splitUpdateTag', () => {
    it('splits tag without channel suffix', () => {
      expect(splitUpdateTag('v1.2.3')).toEqual({
        version: '1.2.3',
        channelLabel: undefined,
      })
    })

    it('splits tag with channel suffix', () => {
      expect(splitUpdateTag('1.2.3-beta.1')).toEqual({
        version: '1.2.3',
        channelLabel: 'beta.1',
      })
    })

    it('trims tag before parsing', () => {
      expect(splitUpdateTag('  v1.2.3-SNAPSHOT  ')).toEqual({
        version: '1.2.3',
        channelLabel: 'SNAPSHOT',
      })
    })
  })

  describe('parseUpdateTag', () => {
    it('parses beta tags', () => {
      expect(parseUpdateTag('v1.2.3-beta').channel).toBe(
        AppPreviewChannel.BETA,
      )
    })

    it('parses release tags without suffix', () => {
      expect(parseUpdateTag('1.2.3').channel).toBe(AppPreviewChannel.RELEASE)
    })

    it('parses alpha tags as beta', () => {
      expect(parseUpdateTag('v1.2.3-alpha').channel).toBe(
        AppPreviewChannel.BETA,
      )
    })

    it('parses snapshot tags as beta', () => {
      expect(parseUpdateTag('v1.2.3-snapshot.2').channel).toBe(
        AppPreviewChannel.BETA,
      )
    })
  })
})

describe('validateUpdateReleaseManifest', () => {
  it.each([
    {
      name: 'release identity does not match the requested tag',
      manifest: () => ({
        ...validManifest(),
        release: {
          tag: 'v2.4.11',
          version: '2.4.11',
          channel: expectation.channel,
        },
      }),
    },
    {
      name: 'two core artifacts claim the same platform and architecture',
      manifest: () => ({
        ...validManifest(),
        artifacts: [
          ...validManifest().artifacts,
          {
            ...validManifest().artifacts[0],
            name: 'Tuff-2.4.10-alt-setup.exe',
          },
        ],
      }),
    },
    {
      name: 'the requested platform and architecture pair is absent',
      manifest: () => ({
        ...validManifest(),
        artifacts: [
          {
            ...validManifest().artifacts[0],
            platform: 'linux',
          },
        ],
      }),
    },
    {
      name: 'the core artifact checksum is not SHA-256',
      manifest: () => ({
        ...validManifest(),
        artifacts: [
          { ...validManifest().artifacts[0], sha256: 'not-a-checksum' },
        ],
      }),
    },
    {
      name: 'the core artifact lacks its detached signature sidecar name',
      manifest: () => ({
        ...validManifest(),
        artifacts: [{ ...validManifest().artifacts[0], signature: '' }],
      }),
    },
  ])('rejects $name', ({ manifest }) => {
    expect(
      validateUpdateReleaseManifest(manifest(), expectation),
    ).toMatchObject({ valid: false })
  })

  it.each([
    { name: 'is missing', rollbackFromVersion: '' },
    { name: 'equals the target', rollbackFromVersion: '2.4.10' },
    { name: 'is newer than the target', rollbackFromVersion: '2.4.11' },
    { name: 'uses a different channel', rollbackFromVersion: '2.4.9-beta.1' },
    { name: 'is malformed', rollbackFromVersion: 'v2.4.9' },
  ])('rejects a rollback version that $name', ({ rollbackFromVersion }) => {
    const manifest = validManifest()
    manifest.release.rollbackFromVersion = rollbackFromVersion

    expect(validateUpdateReleaseManifest(manifest, expectation)).toEqual({
      valid: false,
      reason: 'manifest-rollback-invalid',
    })
  })

  it('accepts preview aliases as the same BETA rollback channel', () => {
    const manifest = validManifest()
    manifest.release = {
      tag: 'v2.4.10-beta.3',
      version: '2.4.10-beta.3',
      channel: AppPreviewChannel.BETA,
      rollbackFromVersion: '2.4.10-alpha.2',
      rollbackCompatible: true,
    }
    const previewExpectation = {
      ...expectation,
      tag: manifest.release.tag,
      channel: AppPreviewChannel.BETA,
    }

    expect(validateUpdateReleaseManifest(manifest, previewExpectation)).toEqual(
      {
        valid: true,
        manifest,
        artifact: manifest.artifacts[0],
      },
    )
  })

  it('selects the verified core artifact for the requested platform and architecture', () => {
    const manifest = validManifest()

    expect(validateUpdateReleaseManifest(manifest, expectation)).toEqual({
      valid: true,
      manifest,
      artifact: manifest.artifacts[0],
    })
  })
})

function lifecycleSnapshot(
  overrides: Partial<UpdateLifecycleSnapshot> = {},
): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision: 3,
    phase: 'downloading',
    currentVersion: '2.4.9',
    targetVersion: '2.4.10',
    source: null,
    channel: AppPreviewChannel.RELEASE,
    releaseTag: 'v2.4.10',
    taskId: 'update-task',
    installMode: null,
    installOnNormalQuit: false,
    rollbackCompatible: false,
    rollbackFromVersion: null,
    previousVersion: null,
    recoveryAvailable: false,
    lastCheckAt: null,
    error: null,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
}

describe('shouldAcceptUpdateLifecycleSnapshot', () => {
  it('accepts an incoming snapshot when no current snapshot exists', () => {
    expect(shouldAcceptUpdateLifecycleSnapshot(null, lifecycleSnapshot())).toBe(
      true,
    )
  })

  it.each([
    { name: 'higher revision', incomingRevision: 5 },
    { name: 'equal revision', incomingRevision: 4 },
  ])('accepts a $name for the same attempt', ({ incomingRevision }) => {
    const current = lifecycleSnapshot({ revision: 4 })
    const incoming = lifecycleSnapshot({ revision: incomingRevision })

    expect(shouldAcceptUpdateLifecycleSnapshot(current, incoming)).toBe(true)
  })

  it('rejects a lower revision for the same attempt', () => {
    const current = lifecycleSnapshot({ revision: 5 })
    const incoming = lifecycleSnapshot({ revision: 4 })

    expect(shouldAcceptUpdateLifecycleSnapshot(current, incoming)).toBe(false)
  })

  it('rejects a non-terminal snapshot that would resurrect a terminal attempt', () => {
    const current = lifecycleSnapshot({ phase: 'healthy', revision: 4 })
    const incoming = lifecycleSnapshot({ phase: 'downloading', revision: 5 })

    expect(shouldAcceptUpdateLifecycleSnapshot(current, incoming)).toBe(false)
  })

  it('accepts a newer attempt regardless of its revision', () => {
    const current = lifecycleSnapshot({
      attemptId: 'attempt-1',
      revision: 10,
      phase: 'healthy',
      createdAt: 100,
    })
    const incoming = lifecycleSnapshot({
      attemptId: 'attempt-2',
      revision: 1,
      createdAt: 101,
    })

    expect(shouldAcceptUpdateLifecycleSnapshot(current, incoming)).toBe(true)
  })

  it('rejects an older attempt regardless of its revision', () => {
    const current = lifecycleSnapshot({
      attemptId: 'attempt-2',
      revision: 1,
      createdAt: 101,
    })
    const incoming = lifecycleSnapshot({
      attemptId: 'attempt-1',
      revision: 10,
      createdAt: 100,
    })

    expect(shouldAcceptUpdateLifecycleSnapshot(current, incoming)).toBe(false)
  })
})
