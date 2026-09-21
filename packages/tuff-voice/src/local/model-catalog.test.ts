import { describe, expect, it } from 'vitest'
import { bundleManifestHash, parseSpeechModelCatalog, SpeechCatalogError } from './model-catalog'

/**
 * A descriptor whose canonical bundle digest was computed by the *publisher's* implementation
 * (`tools/lib/manifest.mjs` in `tuff-speech-models`), not by the function under test. If the two
 * ever disagree, every real catalog would fail this check — so the constant is pinned rather than
 * derived, and a drift in either implementation shows up here instead of at a user's install.
 */
const DIGEST = '80f260e2a2a2bf48a910d2944040c9ad0ad66df54dd643cb5b2b7e6423196b0e'

const DESCRIPTOR = {
  schemaVersion: 1,
  id: 'demo-model',
  version: '1.0.0',
  name: 'Demo',
  engine: 'sherpa-onnx',
  sherpa: { family: 'sense-voice' },
  languages: ['zh'],
  runtime: { kind: 'onnx', file: 'model.onnx', bytes: 12, sha256: 'a'.repeat(64) },
  auxiliary: [
    {
      role: 'tokenizer',
      file: 'tokens.txt',
      bytes: 3,
      sha256: 'b'.repeat(64),
      url: 'https://cdn.test/tokens.txt',
    },
  ],
  capabilities: { stream: true, upload: true },
  source: { provider: 'test', url: 'https://cdn.test/model.onnx' },
  license: { spdx: 'Apache-2.0', redistributable: true },
}

const RUNTIME = {
  id: 'sherpa-onnx',
  version: '1.13.8',
  platform: 'darwin-arm64',
  bytes: 100,
  sha256: 'c'.repeat(64),
  url: 'https://cdn.test/sherpa.tar.bz2',
  archive: 'tar.bz2',
  binary: 'bin/sherpa-onnx-offline',
}

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-18T00:00:00.000Z',
    recommended: { id: 'demo-model', version: '1.0.0' },
    models: [
      {
        id: 'demo-model',
        version: '1.0.0',
        name: 'Demo',
        engine: 'sherpa-onnx',
        languages: ['zh'],
        bytes: 15,
        sha256: DIGEST,
        descriptor: DESCRIPTOR,
      },
    ],
    runtimes: [RUNTIME],
    ...overrides,
  }
}

describe('parsing the served speech-model catalog', () => {
  it('turns an entry into an install spec with every URL the files need', () => {
    const parsed = parseSpeechModelCatalog(catalog())

    expect(parsed.items).toHaveLength(1)
    const item = parsed.items[0]!
    expect(item.spec.engine).toBe('sherpa-onnx')
    expect(item.spec.files.map((file) => [file.role, file.file, file.url])).toEqual([
      ['weights', 'model.onnx', 'https://cdn.test/model.onnx'],
      ['tokenizer', 'tokens.txt', 'https://cdn.test/tokens.txt'],
    ])
    expect(parsed.recommended?.entry.id).toBe('demo-model')
    expect(parsed.runtimes).toHaveLength(1)
    expect(bundleManifestHash(item.descriptor)).toBe(DIGEST)
  })

  it('refuses a descriptor that does not hash to the published digest', () => {
    // The tampering this defends against: keep the published digest, swap the weights digest.
    const tampered = {
      ...DESCRIPTOR,
      runtime: { ...DESCRIPTOR.runtime, sha256: 'd'.repeat(64) },
    }

    expect(() =>
      parseSpeechModelCatalog(catalog({ models: [{ ...catalog().models[0], descriptor: tampered }] })),
    ).toThrow(/hashes to .* but the catalog publishes/)
  })

  it('refuses a weights file with no https download URL', () => {
    const noUrl = { ...DESCRIPTOR, source: { provider: 'test' } }

    expect(() =>
      parseSpeechModelCatalog(
        catalog({ models: [{ ...catalog().models[0], descriptor: noUrl }] }),
      ),
    ).toThrow(SpeechCatalogError)
  })

  it('refuses an entry whose bytes do not add up to its files', () => {
    expect(() =>
      parseSpeechModelCatalog(catalog({ models: [{ ...catalog().models[0], bytes: 99 }] })),
    ).toThrow(/files add up to 15/)
  })

  it('refuses the same version twice', () => {
    const entry = catalog().models[0]

    expect(() => parseSpeechModelCatalog(catalog({ models: [entry, entry] }))).toThrow(/appears twice/)
  })

  it('refuses a recommendation that is not in the catalog', () => {
    expect(() =>
      parseSpeechModelCatalog(catalog({ recommended: { id: 'ghost', version: '9.9.9' } })),
    ).toThrow(/which it does not list/)
  })

  it('refuses an unknown engine and an unsupported schema', () => {
    expect(() =>
      parseSpeechModelCatalog(catalog({ models: [{ ...catalog().models[0], engine: 'tmux' }] })),
    ).toThrow(/unknown engine/)
    expect(() => parseSpeechModelCatalog({ schemaVersion: 2, models: [], runtimes: [] })).toThrow(
      /unsupported catalog schemaVersion/,
    )
  })
})
