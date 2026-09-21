/**
 * The speech-model catalog as the cloud serves it.
 *
 * This is the client half of a distribution contract: Nexus publishes which model bundles
 * exist, which one it recommends, and where their bytes live; Tuff turns that into install
 * specs and verifies every artifact it downloads. Two properties are deliberate.
 *
 * **The digest is the authority, not the URL.** Each entry carries the *canonical bundle
 * manifest hash* — SHA-256 over `{id, version, engine, files[{role, file, bytes, sha256}]}`
 * with sorted keys — and the parser recomputes it from the descriptor. An entry whose
 * descriptor does not hash to its published digest is refused before any download, so a
 * tampered or stale catalog cannot redirect an install to different weights.
 *
 * **Nothing here evaluates remote content.** The payload is data: ids, versions, sizes,
 * digests and URLs. Descriptors are validated with the runtime's own validator
 * (`parseModelDescriptor`), which is the only thing that decides what a bundle may declare.
 */

import type { SpeechBundleFileSpec, SpeechBundleSpec } from './bundle-install'
import type { LocalModelDescriptor } from './types'
import { createHash } from 'node:crypto'
import { parseModelDescriptor } from './model-store'

export const SPEECH_MODEL_CATALOG_SCHEMA_VERSION = 1 as const

/** One installable version, as published. */
export interface SpeechModelCatalogEntryV1 {
  id: string
  version: string
  name: string
  engine: 'whisper-cpp' | 'sherpa-onnx' | 'onnxruntime'
  languages: readonly string[]
  /** Total download size, weights plus auxiliary files. */
  bytes: number
  /** SHA-256 over the canonical bundle manifest. */
  sha256: string
  descriptor: unknown
}

/**
 * A runtime a bundle needs on the host.
 *
 * The model store and the engine executable are the same kind of dependency — a bundle
 * names neither the binary nor the weights; both are fetched and verified — so the catalog
 * describes both, and a client that installs a sherpa model knows it must also obtain the
 * sherpa runtime rather than discovering it as a missing binary at the user's first word.
 */
export interface SpeechRuntimeEntryV1 {
  id: 'whisper-cpp' | 'sherpa-onnx'
  version: string
  platform: string
  bytes: number
  sha256: string
  url: string
  archive: 'tar.bz2' | 'tar.gz' | 'zip'
  /** Path of the executable inside the archive. */
  binary: string
  /** Extra files the executable needs beside it (shared libraries). */
  libraries?: readonly string[]
}

export interface SpeechModelCatalogV1 {
  schemaVersion: typeof SPEECH_MODEL_CATALOG_SCHEMA_VERSION
  generatedAt: string
  recommended?: { id: string, version: string }
  models: readonly SpeechModelCatalogEntryV1[]
  runtimes: readonly SpeechRuntimeEntryV1[]
}

/** An entry as the installer consumes it: the spec plus what the UI shows. */
export interface SpeechModelCatalogItem {
  entry: SpeechModelCatalogEntryV1
  descriptor: LocalModelDescriptor
  spec: SpeechBundleSpec
}

export class SpeechCatalogError extends Error {
  readonly code = 'SPEECH_CATALOG_INVALID'

  constructor(detail: string) {
    super(detail)
    this.name = 'SpeechCatalogError'
  }
}

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ENGINES = new Set(['whisper-cpp', 'sherpa-onnx', 'onnxruntime'])
const RUNTIME_IDS = new Set(['whisper-cpp', 'sherpa-onnx'])
const ARCHIVES = new Set(['tar.bz2', 'tar.gz', 'zip'])

/** Deterministic JSON: sorted keys, no whitespace — the form the digest is taken over. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const body = Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')
    return `{${body}}`
  }
  return JSON.stringify(value) ?? 'null'
}

interface DescriptorFile {
  role: SpeechBundleFileSpec['role']
  file: string
  bytes: number
  sha256: string
}

/**
 * Files a bundle is made of, in canonical order: weights first, then auxiliary files by path.
 *
 * Mirrors `bundleFiles()` in the publishing repository's `tools/lib/manifest.mjs`; the two
 * must agree or every entry would fail its own digest check.
 */
export function bundleFiles(descriptor: LocalModelDescriptor): DescriptorFile[] {
  const auxiliary = [...(descriptor.auxiliary ?? [])].sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : 0,
  )
  return [
    {
      role: 'weights' as const,
      file: descriptor.runtime.file,
      bytes: descriptor.runtime.bytes,
      sha256: descriptor.runtime.sha256,
    },
    ...auxiliary.map(item => ({
      role: item.role as SpeechBundleFileSpec['role'],
      file: item.file,
      bytes: item.bytes,
      sha256: item.sha256,
    })),
  ]
}

/** SHA-256 over the canonical bundle manifest — the digest a catalog publishes. */
export function bundleManifestHash(descriptor: LocalModelDescriptor): string {
  const manifest = {
    id: descriptor.id,
    version: descriptor.version,
    engine: descriptor.engine,
    files: bundleFiles(descriptor),
  }
  return createHash('sha256').update(stableStringify(manifest), 'utf8').digest('hex')
}

function requireUrl(value: unknown, where: string): string {
  if (typeof value !== 'string' || !/^https:\/\//.test(value))
    throw new SpeechCatalogError(`${where} has no https download url`)
  return value
}

export function catalogEntryToItem(entry: SpeechModelCatalogEntryV1): SpeechModelCatalogItem {
  if (!ID_PATTERN.test(entry.id))
    throw new SpeechCatalogError(`id "${entry.id}" is malformed`)
  if (!VERSION_PATTERN.test(entry.version))
    throw new SpeechCatalogError(`version "${entry.version}" is not semver`)
  if (!ENGINES.has(entry.engine))
    throw new SpeechCatalogError(`unknown engine "${entry.engine}"`)
  if (!Number.isInteger(entry.bytes) || entry.bytes <= 0)
    throw new SpeechCatalogError(`${entry.id}@${entry.version}: bytes is not a positive integer`)
  if (!SHA256_PATTERN.test(entry.sha256))
    throw new SpeechCatalogError(`${entry.id}@${entry.version}: sha256 is malformed`)

  const descriptor = parseModelDescriptor(
    entry.descriptor,
    `${entry.id}@${entry.version} (catalog)`,
  )

  const computed = bundleManifestHash(descriptor)
  if (computed !== entry.sha256) {
    throw new SpeechCatalogError(
      `${entry.id}@${entry.version}: the descriptor hashes to ${computed}, but the catalog publishes ${entry.sha256}`,
    )
  }

  const source = descriptor.source as { url?: unknown } | undefined
  const files: SpeechBundleFileSpec[] = bundleFiles(descriptor).map((file) => {
    if (file.role === 'weights') {
      return { ...file, url: requireUrl(source?.url, `${entry.id}@${entry.version} weights`) }
    }
    const auxiliary = (descriptor.auxiliary ?? []).find(item => item.file === file.file)
    return {
      ...file,
      url: requireUrl(
        (auxiliary as { url?: unknown } | undefined)?.url,
        `${entry.id}@${entry.version} ${file.file}`,
      ),
    }
  })

  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  if (total !== entry.bytes) {
    throw new SpeechCatalogError(
      `${entry.id}@${entry.version}: the catalog says ${entry.bytes} bytes, the files add up to ${total}`,
    )
  }

  return {
    entry,
    descriptor,
    spec: { id: entry.id, version: entry.version, engine: entry.engine, files, descriptor: entry.descriptor },
  }
}

export interface ParsedSpeechModelCatalog {
  catalog: SpeechModelCatalogV1
  items: SpeechModelCatalogItem[]
  runtimes: SpeechRuntimeEntryV1[]
  recommended: SpeechModelCatalogItem | null
}

/** Parse and validate a catalog payload. Throws `SpeechCatalogError` on anything unusable. */
export function parseSpeechModelCatalog(value: unknown): ParsedSpeechModelCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SpeechCatalogError('catalog is not an object')
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== SPEECH_MODEL_CATALOG_SCHEMA_VERSION)
    throw new SpeechCatalogError(`unsupported catalog schemaVersion ${String(record.schemaVersion)}`)
  if (!Array.isArray(record.models) || record.models.length === 0)
    throw new SpeechCatalogError('catalog lists no models')
  if (!Array.isArray(record.runtimes) || record.runtimes.length === 0)
    throw new SpeechCatalogError('catalog lists no runtimes')

  const seen = new Set<string>()
  const items: SpeechModelCatalogItem[] = []
  for (const raw of record.models) {
    const item = catalogEntryToItem(raw as SpeechModelCatalogEntryV1)
    const key = `${item.entry.id}@${item.entry.version}`
    if (seen.has(key))
      throw new SpeechCatalogError(`${key} appears twice in the catalog`)
    seen.add(key)
    items.push(item)
  }

  const runtimes: SpeechRuntimeEntryV1[] = []
  for (const raw of record.runtimes) {
    const runtime = raw as SpeechRuntimeEntryV1
    if (!RUNTIME_IDS.has(runtime.id))
      throw new SpeechCatalogError(`unknown runtime "${runtime.id}"`)
    if (!VERSION_PATTERN.test(runtime.version))
      throw new SpeechCatalogError(`runtime ${runtime.id} version "${runtime.version}" is not semver`)
    if (typeof runtime.platform !== 'string' || !runtime.platform)
      throw new SpeechCatalogError(`runtime ${runtime.id} names no platform`)
    if (!Number.isInteger(runtime.bytes) || runtime.bytes <= 0)
      throw new SpeechCatalogError(`runtime ${runtime.id} has invalid bytes`)
    if (!SHA256_PATTERN.test(runtime.sha256))
      throw new SpeechCatalogError(`runtime ${runtime.id} sha256 is malformed`)
    if (!ARCHIVES.has(runtime.archive))
      throw new SpeechCatalogError(`runtime ${runtime.id} archive ${String(runtime.archive)} is unsupported`)
    requireUrl(runtime.url, `runtime ${runtime.id}`)
    if (typeof runtime.binary !== 'string' || !runtime.binary || runtime.binary.startsWith('/'))
      throw new SpeechCatalogError(`runtime ${runtime.id} binary must be a relative path`)
    runtimes.push(runtime)
  }

  const recommendedRaw = record.recommended as { id?: unknown, version?: unknown } | undefined
  let recommended: SpeechModelCatalogItem | null = null
  if (recommendedRaw) {
    recommended
      = items.find(
        item => item.entry.id === recommendedRaw.id && item.entry.version === recommendedRaw.version,
      ) ?? null
    if (!recommended) {
      throw new SpeechCatalogError(
        `catalog recommends ${String(recommendedRaw.id)}@${String(recommendedRaw.version)}, which it does not list`,
      )
    }
  }

  return {
    catalog: {
      schemaVersion: SPEECH_MODEL_CATALOG_SCHEMA_VERSION,
      generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : '',
      ...(recommendedRaw ? { recommended: recommendedRaw as { id: string, version: string } } : {}),
      models: items.map(item => item.entry),
      runtimes,
    },
    items,
    runtimes,
    recommended,
  }
}

/** Runtime a bundle needs, for the host it is being installed on. */
export function runtimeFor(
  runtimes: readonly SpeechRuntimeEntryV1[],
  engine: string,
  platform: string,
): SpeechRuntimeEntryV1 | null {
  return runtimes.find(runtime => runtime.id === engine && runtime.platform === platform) ?? null
}
