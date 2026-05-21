import { describe, expect, it } from 'vitest'
import {
  assertStorageChannelPolicyConfig,
  listStorageChannelProfiles,
  resolveStorageChannelProfile,
} from './storageChannelCatalog'

describe('storageChannelCatalog', () => {
  it('lists local, R2, S3, and OSS storage policy profiles', () => {
    const profiles = listStorageChannelProfiles()

    expect(profiles.map(profile => `${profile.channel}/${profile.provider}`)).toEqual(expect.arrayContaining([
      'memory/memory',
      'r2/cloudflare-r2',
      's3/aws-s3',
      'oss/aliyun-oss',
    ]))
    expect(profiles.find(profile => profile.id === 'aws-s3')).toMatchObject({
      status: 'active',
      credentialRefPrefix: 'secure://storage/',
      requiredConfigKeys: expect.arrayContaining(['bucket', 'region']),
    })
    expect(profiles.find(profile => profile.id === 'aliyun-oss')).toMatchObject({
      status: 'active',
      credentialRefPrefix: 'secure://storage/',
      requiredConfigKeys: expect.arrayContaining(['bucket', 'endpoint']),
    })
  })

  it('returns cloned profiles so callers cannot mutate the catalog', () => {
    const [profile] = listStorageChannelProfiles()
    profile.defaultLimits.maxBytes = 1

    expect(listStorageChannelProfiles()[0]?.defaultLimits.maxBytes).not.toBe(1)
  })

  it('validates supported storage channel limits and secure credential references', () => {
    expect(resolveStorageChannelProfile('r2', 'cloudflare-r2')?.label).toBe('Cloudflare R2')
    expect(() => assertStorageChannelPolicyConfig({
      channel: 's3',
      provider: 'aws-s3',
      limits: {
        maxBytes: 1000,
        trafficBytes: 2000,
        windowDays: 30,
      },
      config: {
        credentialRef: 'secure://storage/s3-default',
        bucket: 'tuff-nexus',
        region: 'us-east-1',
      },
    })).not.toThrow()
  })

  it('rejects unsupported providers, missing required fields, and invalid limit keys', () => {
    expect(() => assertStorageChannelPolicyConfig({
      channel: 'r2-dev',
      provider: 'cloudflare-r2',
      limits: { maxBytes: 1000 },
      config: null,
    })).toThrow(/Unsupported storage channel/)

    expect(() => assertStorageChannelPolicyConfig({
      channel: 'oss',
      provider: 'aliyun-oss',
      limits: { maxBytes: 1000 },
      config: {
        credentialRef: 'secure://storage/oss-default',
        bucket: 'tuff-nexus',
      },
    })).toThrow(/config.endpoint is required/)

    expect(() => assertStorageChannelPolicyConfig({
      channel: 's3',
      provider: 'aws-s3',
      limits: {
        maxBytes: 1000,
        unknownLimit: 1,
      },
      config: {
        credentialRef: 'secure://storage/s3-default',
        bucket: 'tuff-nexus',
        region: 'us-east-1',
      },
    })).toThrow(/limits.unknownLimit is not supported/)
  })

  it('rejects storage credential references outside the secure storage namespace', () => {
    expect(() => assertStorageChannelPolicyConfig({
      channel: 's3',
      provider: 'aws-s3',
      limits: { maxBytes: 1000 },
      config: {
        credentialRef: 'secure://notifications/s3-default',
        bucket: 'tuff-nexus',
        region: 'us-east-1',
      },
    })).toThrow(/secure:\/\/storage\//)
  })
})
