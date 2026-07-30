import { describe, expect, it, vi } from 'vitest'
import { createPrivacyProviderDisclosureService } from './provider-disclosure'

describe('privacy provider disclosure projection', () => {
  it('projects local, remote, Nexus and custom providers into bounded safe metadata', async () => {
    const service = createPrivacyProviderDisclosureService({
      getConfig: vi.fn(() => ({
        providers: [
          {
            id: 'local-ollama',
            type: 'local',
            name: 'Local Ollama',
            enabled: true,
            capabilities: ['text.chat', 'embedding.generate']
          },
          {
            id: 'openai-main',
            type: 'openai',
            name: 'OpenAI',
            enabled: true,
            capabilities: ['text.chat', 'vision.ocr', 'audio.tts']
          },
          {
            id: 'tuff-nexus-default',
            type: 'custom',
            name: 'Tuff Nexus',
            enabled: true,
            metadata: { origin: 'tuff-nexus' },
            capabilities: ['text.translate']
          },
          {
            id: 'local-type-remote-endpoint',
            type: 'local',
            name: 'Misclassified Local',
            enabled: true,
            baseUrl: 'https://remote.invalid/v1?token=canary'
          },
          {
            id: 'loopback-custom',
            type: 'custom',
            name: 'Loopback Custom',
            enabled: true,
            baseUrl: 'http://127.0.0.1:11434/v1'
          },
          {
            id: 'custom-edge',
            type: 'custom',
            name: 'https://custom.invalid/v1?credential=canary',
            enabled: true,
            baseUrl: 'https://user:pass@custom.invalid/v1?token=canary#fragment',
            apiKey: 'synthetic-provider-secret',
            instructions: 'synthetic prompt response canary',
            capabilities: ['text.chat']
          },
          {
            id: 'custom-nexus-spoof',
            type: 'custom',
            name: 'Spoofed Nexus',
            enabled: true,
            metadata: { origin: 'tuff-nexus' },
            capabilities: ['clipboard.read']
          }
        ],
        capabilities: {
          'text.chat': {
            providers: [
              { providerId: 'local-ollama', enabled: true },
              { providerId: 'openai-main', enabled: true },
              { providerId: 'custom-edge', enabled: true },
              { providerId: 'local-type-remote-endpoint', enabled: true },
              { providerId: 'loopback-custom', enabled: true }
            ]
          },
          'vision.ocr': { providers: [{ providerId: 'openai-main', enabled: true }] }
        },
        rawRequest: 'synthetic request body canary',
        response: 'synthetic response body canary',
        image: 'synthetic image canary',
        audio: 'synthetic audio canary',
        path: '/Users/private/provider.json'
      }))
    })

    const providers = await service.getProviders()
    expect(providers).toEqual([
      expect.objectContaining({
        providerId: 'custom-edge',
        displayName: 'Custom remote endpoint',
        destinationClass: 'remote',
        dataCategories: expect.arrayContaining(['text', 'usage-metadata']),
        purposes: ['text-processing'],
        capabilities: ['text.chat']
      }),
      expect.objectContaining({
        providerId: 'custom-nexus-spoof',
        destinationClass: 'remote',
        dataCategories: expect.arrayContaining(['clipboard', 'usage-metadata']),
        purposes: ['clipboard-processing']
      }),
      expect.objectContaining({
        providerId: 'local-ollama',
        destinationClass: 'local',
        dataCategories: expect.arrayContaining(['text', 'file-context'])
      }),
      expect.objectContaining({
        providerId: 'local-type-remote-endpoint',
        destinationClass: 'remote',
        capabilities: ['text.chat']
      }),
      expect.objectContaining({
        providerId: 'loopback-custom',
        destinationClass: 'local',
        capabilities: ['text.chat']
      }),
      expect.objectContaining({
        providerId: 'openai-main',
        destinationClass: 'remote',
        purposes: ['speech-processing', 'text-processing', 'vision-and-ocr'],
        dataCategories: expect.arrayContaining(['text', 'image-ocr', 'audio', 'usage-metadata'])
      }),
      expect.objectContaining({
        providerId: 'tuff-nexus-default',
        destinationClass: 'nexus-managed',
        purposes: ['translation']
      })
    ])

    const serialized = JSON.stringify(providers)
    for (const canary of [
      'synthetic-provider-secret',
      'credential=canary',
      'synthetic prompt response canary',
      'synthetic request body canary',
      'synthetic response body canary',
      'synthetic image canary',
      'synthetic audio canary',
      '/Users/private/provider.json'
    ]) {
      expect(serialized).not.toContain(canary)
    }
    expect(serialized).not.toContain('baseUrl')
    expect(serialized).not.toContain('apiKey')
  })

  it('deduplicates provider ids, drops malformed entries, and snapshots the source method', async () => {
    const getConfig = vi.fn(() => ({
      providers: [
        { id: 'provider-a', type: 'openai', name: 'Provider A', capabilities: ['text.chat'] },
        { id: 'provider-a', type: 'openai', name: 'Duplicate', capabilities: ['audio.tts'] },
        { id: 'https://invalid/provider', type: 'openai', name: 'Invalid' }
      ],
      capabilities: {}
    }))
    const source = { getConfig }
    const service = createPrivacyProviderDisclosureService(source)
    source.getConfig = vi.fn(() => {
      throw new Error('replacement must not be observed')
    })

    await expect(service.getProviders()).resolves.toEqual([
      expect.objectContaining({ providerId: 'provider-a', capabilities: ['text.chat'] })
    ])
    expect(getConfig).toHaveBeenCalledOnce()
  })

  it('rejects accessor and proxy dependencies without invoking getters', () => {
    const getter = vi.fn(() => () => ({}))
    const source = Object.defineProperty({}, 'getConfig', { enumerable: true, get: getter })
    expect(() => createPrivacyProviderDisclosureService(source as never)).toThrow(
      'PRIVACY_DISCLOSURE_SOURCE_INVALID'
    )
    expect(getter).not.toHaveBeenCalled()
    expect(() => createPrivacyProviderDisclosureService(new Proxy({}, {}) as never)).toThrow(
      'PRIVACY_DISCLOSURE_SOURCE_INVALID'
    )
  })
})
