import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual, types as utilTypes } from 'node:util'
import {
  normalizeIntelligenceProviderConfigDeleteRequest,
  normalizeIntelligenceProviderConfigSaveRequest,
  normalizeIntelligenceProviderStoredConfig
} from '@talex-touch/utils/transport/sdk/domains/intelligence'

export interface ProviderCredentialVaultEntry {
  key: string
  value: string | null
}

export interface ProviderCredentialVault {
  get: (key: string) => Promise<string | null>
  apply: (entries: readonly ProviderCredentialVaultEntry[]) => Promise<boolean>
}

export type ProviderCredentialSurfaceRevision = number | string

export interface ProviderCredentialSurfaceSnapshot {
  document: Record<string, unknown>
  revision?: ProviderCredentialSurfaceRevision
}

export interface ProviderCredentialSurface {
  id: string
  read: () => Promise<ProviderCredentialSurfaceSnapshot>
  write: (
    document: Record<string, unknown>,
    expectedRevision?: ProviderCredentialSurfaceRevision
  ) => Promise<boolean>
}

export type ProviderCredentialMutation =
  | { action: 'preserve' }
  | { action: 'set'; value: string }
  | { action: 'clear' }

export interface ProviderCredentialSaveRequest {
  provider: IntelligenceProviderConfig
  credential: ProviderCredentialMutation
}

export interface ProviderCredentialDeleteRequest {
  providerId: string
}

export type ProviderCredentialReport = (
  code: string,
  metadata: Readonly<Record<string, string | number | boolean>>
) => void

interface ProviderCredentialServiceOptions {
  surfaces: readonly ProviderCredentialSurface[]
  vault: ProviderCredentialVault
  report?: ProviderCredentialReport
}

interface SurfaceState {
  surface: ProviderCredentialSurface
  snapshot: ProviderCredentialSurfaceSnapshot
  providers: IntelligenceProviderConfig[]
  nextDocument?: Record<string, unknown>
}

const PROVIDER_AUTH_REF_PREFIX = 'provider-credential:'
const PROVIDER_SECURE_STORE_PURPOSE = 'intelligence-provider-credential'
const PROVIDER_MAX_COUNT = 256
const PROVIDER_CREDENTIAL_MAX_BYTES = 16 * 1024

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value)
}

function invalidConfig(): never {
  throw new Error('PROVIDER_CREDENTIAL_CONFIG_INVALID')
}

function assertPlainRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalidConfig()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalidConfig()
  }
  if (prototype !== Object.prototype && prototype !== null) invalidConfig()
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') invalidConfig()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      invalidConfig()
    }
  }
}

function validateLegacyProvider(value: unknown): IntelligenceProviderConfig {
  assertPlainRecord(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const rawCredential = descriptors.apiKey?.value
  if (
    descriptors.apiKey !== undefined &&
    (typeof rawCredential !== 'string' ||
      Buffer.byteLength(rawCredential, 'utf8') > PROVIDER_CREDENTIAL_MAX_BYTES)
  ) {
    invalidConfig()
  }
  const safeProvider: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') invalidConfig()
    if (key === 'apiKey') continue
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor)) invalidConfig()
    safeProvider[key] = descriptor.value
  }
  try {
    const normalized = normalizeIntelligenceProviderStoredConfig(safeProvider)
    return {
      ...normalized,
      ...(descriptors.apiKey === undefined ? {} : { apiKey: rawCredential as string })
    } as IntelligenceProviderConfig
  } catch {
    invalidConfig()
  }
}

function providerList(document: Record<string, unknown>): IntelligenceProviderConfig[] {
  if (document.providers === undefined) return []
  if (
    !Array.isArray(document.providers) ||
    utilTypes.isProxy(document.providers) ||
    Object.getPrototypeOf(document.providers) !== Array.prototype ||
    document.providers.length > PROVIDER_MAX_COUNT
  ) {
    invalidConfig()
  }
  const descriptors = Object.getOwnPropertyDescriptors(document.providers)
  if (Reflect.ownKeys(descriptors).length !== document.providers.length + 1) invalidConfig()
  const ids = new Set<string>()
  const providers: IntelligenceProviderConfig[] = []
  for (let index = 0; index < document.providers.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidConfig()
    const provider = validateLegacyProvider(descriptor.value)
    if (ids.has(provider.id)) invalidConfig()
    ids.add(provider.id)
    providers.push(provider)
  }
  return providers
}

function credentialFromProvider(provider: IntelligenceProviderConfig): string | undefined {
  if (typeof provider.apiKey !== 'string' || !provider.apiKey.trim()) return undefined
  return provider.apiKey
}

function providerWithCredentialState(
  provider: IntelligenceProviderConfig,
  hasCredential: boolean
): IntelligenceProviderConfig {
  const { apiKey: _apiKey, authRef: _authRef, hasCredential: _hasCredential, ...safe } = provider
  if (hasCredential) {
    return {
      ...safe,
      authRef: `${PROVIDER_AUTH_REF_PREFIX}${provider.id}`,
      hasCredential: true
    }
  }
  return {
    ...safe,
    ...(Object.hasOwn(provider, 'apiKey') ||
    Object.hasOwn(provider, 'authRef') ||
    Object.hasOwn(provider, 'hasCredential')
      ? { hasCredential: false }
      : {})
  }
}

function redactProvider(
  value: IntelligenceProviderConfig,
  knownCredential?: boolean
): IntelligenceProviderConfig {
  const hasCredential =
    knownCredential ?? Boolean(credentialFromProvider(value) || value.hasCredential)
  return providerWithCredentialState(value, hasCredential)
}

function documentsEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>
): boolean {
  return isDeepStrictEqual(left, right)
}

export function providerConfigDocumentContainsCredential(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (utilTypes.isProxy(value)) return true
  try {
    assertPlainRecord(value)
    return providerList(value).some((provider) => Object.hasOwn(provider, 'apiKey'))
  } catch {
    return true
  }
}

export function redactProviderConfigDocument(value: unknown): Record<string, unknown> {
  try {
    assertPlainRecord(value)
    const document = cloneRecord(value)
    if (!Array.isArray(document.providers)) return document
    const providers = providerList(document)
    document.providers = providers.map((item) => redactProvider(item))
    return document
  } catch {
    return {}
  }
}

export function providerCredentialSecureStoreKey(providerId: string): string {
  const digest = createHash('sha256').update(providerId, 'utf8').digest('hex').slice(0, 40)
  return `provider.${digest}.api-key`
}

export { PROVIDER_SECURE_STORE_PURPOSE }

export class ProviderCredentialService {
  private readonly credentials = new Map<string, string>()
  private initializePromise: Promise<void> | null = null
  private mutationTail: Promise<void> = Promise.resolve()
  private accepting = true

  constructor(private readonly options: ProviderCredentialServiceOptions) {
    if (
      options.surfaces.length === 0 ||
      new Set(options.surfaces.map((item) => item.id)).size !== options.surfaces.length
    ) {
      throw new Error('PROVIDER_CREDENTIAL_SURFACE_REQUIRED')
    }
  }

  initialize(): Promise<void> {
    if (!this.accepting) return Promise.reject(new Error('PROVIDER_CREDENTIAL_SERVICE_CLOSED'))
    if (!this.initializePromise) {
      const task = this.runInitialization()
      this.initializePromise = task
      void task.catch(() => {
        if (this.initializePromise === task) this.initializePromise = null
      })
    }
    return this.initializePromise
  }

  resolve(provider: Pick<IntelligenceProviderConfig, 'id'>): string | undefined {
    return this.accepting ? this.credentials.get(provider.id) : undefined
  }

  has(providerId: string): boolean {
    return this.accepting && this.credentials.has(providerId)
  }

  async saveProvider(request: ProviderCredentialSaveRequest): Promise<IntelligenceProviderConfig> {
    const validated = normalizeIntelligenceProviderConfigSaveRequest(request)
    await this.initialize()
    return this.enqueueMutation(() =>
      this.saveProviderUnlocked(validated as ProviderCredentialSaveRequest)
    )
  }

  async deleteProvider(request: ProviderCredentialDeleteRequest): Promise<{ deleted: boolean }> {
    const { providerId } = normalizeIntelligenceProviderConfigDeleteRequest(request)
    await this.initialize()
    return this.enqueueMutation(() => this.deleteProviderUnlocked(providerId))
  }

  async destroy(): Promise<void> {
    if (!this.accepting) return
    this.accepting = false
    await this.initializePromise?.catch(() => undefined)
    await this.mutationTail.catch(() => undefined)
    this.credentials.clear()
    this.initializePromise = null
  }

  private async readSurfaceStates(): Promise<SurfaceState[]> {
    const states: SurfaceState[] = []
    for (const surface of this.options.surfaces) {
      let snapshot: ProviderCredentialSurfaceSnapshot
      try {
        snapshot = await surface.read()
      } catch {
        this.report('PROVIDER_CREDENTIAL_CONFIG_READ_FAILED', surface.id)
        throw new Error('PROVIDER_CREDENTIAL_CONFIG_READ_FAILED')
      }
      assertPlainRecord(snapshot.document)
      if (
        snapshot.revision !== undefined &&
        typeof snapshot.revision !== 'number' &&
        typeof snapshot.revision !== 'string'
      ) {
        invalidConfig()
      }
      states.push({ surface, snapshot, providers: providerList(snapshot.document) })
    }
    return states
  }

  private async readVaultCredential(key: string): Promise<string | null> {
    try {
      return await this.options.vault.get(key)
    } catch {
      this.report('PROVIDER_CREDENTIAL_SECURE_READ_FAILED', 'all')
      throw new Error('PROVIDER_CREDENTIAL_SECURE_READ_FAILED')
    }
  }

  private async applyVault(entries: readonly ProviderCredentialVaultEntry[]): Promise<boolean> {
    try {
      return await this.options.vault.apply(entries)
    } catch {
      return false
    }
  }

  private async readVaultValues(
    providerIds: Iterable<string>
  ): Promise<Map<string, string | null>> {
    const values = new Map<string, string | null>()
    for (const providerId of new Set(providerIds)) {
      values.set(
        providerId,
        await this.readVaultCredential(providerCredentialSecureStoreKey(providerId))
      )
    }
    return values
  }

  private normalizeVaultCredential(value: string | null): string | null {
    if (value === null) return null
    if (Buffer.byteLength(value, 'utf8') > PROVIDER_CREDENTIAL_MAX_BYTES) invalidConfig()
    return value.trim() ? value : null
  }

  private publishCredentials(values: ReadonlyMap<string, string | null>): void {
    this.credentials.clear()
    for (const [providerId, value] of values) {
      if (value !== null) this.credentials.set(providerId, value)
    }
  }

  private async runInitialization(): Promise<void> {
    const states = await this.readSurfaceStates()
    const providerIds = states.flatMap((state) => state.providers.map((item) => item.id))
    const previousVault = await this.readVaultValues(providerIds)
    const selected = new Map(
      [...previousVault].map(([providerId, value]) => [
        providerId,
        this.normalizeVaultCredential(value)
      ])
    )
    const legacy = new Map<string, { value: string; surface: string }>()

    for (const state of states) {
      for (const provider of state.providers) {
        const credential = credentialFromProvider(provider)
        if (!credential) continue
        const existing = legacy.get(provider.id)
        if (existing) {
          if (existing.value !== credential) {
            this.report('PROVIDER_CREDENTIAL_SOURCE_CONFLICT', state.surface.id, provider.id)
          }
          continue
        }
        legacy.set(provider.id, { value: credential, surface: state.surface.id })
        const vaultCredential = selected.get(provider.id) ?? null
        if (vaultCredential === null) {
          selected.set(provider.id, credential)
        } else if (vaultCredential !== credential) {
          this.report('PROVIDER_CREDENTIAL_SOURCE_CONFLICT', state.surface.id, provider.id)
        }
      }
    }

    const vaultWrites: ProviderCredentialVaultEntry[] = []
    const vaultRollback: ProviderCredentialVaultEntry[] = []
    for (const [providerId, previous] of previousVault) {
      if (previous !== null && !previous.trim() && !legacy.has(providerId)) {
        const key = providerCredentialSecureStoreKey(providerId)
        vaultWrites.push({ key, value: null })
        vaultRollback.push({ key, value: previous })
      }
    }
    for (const [providerId, source] of legacy) {
      const previous = previousVault.get(providerId) ?? null
      if (this.normalizeVaultCredential(previous) !== null) continue
      if (previous === source.value) continue
      const key = providerCredentialSecureStoreKey(providerId)
      vaultWrites.push({ key, value: source.value })
      vaultRollback.push({ key, value: previous })
    }

    for (const state of states) {
      const nextDocument = cloneRecord(state.snapshot.document)
      nextDocument.providers = state.providers.map((provider) =>
        providerWithCredentialState(provider, selected.get(provider.id) !== null)
      )
      if (!documentsEqual(nextDocument, state.snapshot.document)) {
        state.nextDocument = nextDocument
      }
    }

    if (vaultWrites.length > 0 && !(await this.applyVault(vaultWrites))) {
      this.publishCredentials(selected)
      this.report('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED', 'all')
      throw new Error('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED')
    }

    try {
      await this.commitSurfaceChanges(states, vaultRollback)
    } catch (error) {
      if (error instanceof Error && error.message === 'PROVIDER_CREDENTIAL_ROLLBACK_FAILED') {
        this.credentials.clear()
        throw error
      }
      this.publishCredentials(selected)
      throw error
    }

    this.publishCredentials(selected)
    if (legacy.size > 0) {
      this.report('PROVIDER_CREDENTIAL_MIGRATED', 'all', undefined, legacy.size)
    }
  }

  private async commitSurfaceChanges(
    states: readonly SurfaceState[],
    vaultRollback: readonly ProviderCredentialVaultEntry[],
    providerId?: string
  ): Promise<void> {
    const committed: SurfaceState[] = []
    let failureSurface = 'all'
    try {
      for (const state of states) {
        if (!state.nextDocument) continue
        failureSurface = state.surface.id
        if (!(await state.surface.write(state.nextDocument, state.snapshot.revision))) {
          throw new Error('PROVIDER_CREDENTIAL_CONFIG_WRITE_FAILED')
        }
        committed.push(state)
      }
    } catch {
      const configRollback = await this.rollbackSurfaces(committed)
      const vaultRollbackSucceeded =
        vaultRollback.length === 0 || (await this.applyVault(vaultRollback))
      if (!configRollback || !vaultRollbackSucceeded) {
        this.credentials.clear()
        this.report('PROVIDER_CREDENTIAL_ROLLBACK_FAILED', failureSurface, providerId)
        throw new Error('PROVIDER_CREDENTIAL_ROLLBACK_FAILED')
      }
      this.report('PROVIDER_CREDENTIAL_CONFIG_WRITE_FAILED', failureSurface, providerId)
      throw new Error('PROVIDER_CREDENTIAL_CONFIG_WRITE_FAILED')
    }
  }

  private async rollbackSurfaces(states: readonly SurfaceState[]): Promise<boolean> {
    let succeeded = true
    for (const state of [...states].reverse()) {
      try {
        const current = await state.surface.read()
        if (!state.nextDocument || !documentsEqual(current.document, state.nextDocument)) {
          succeeded = false
          continue
        }
        if (!(await state.surface.write(state.snapshot.document, current.revision))) {
          succeeded = false
          continue
        }
        const restored = await state.surface.read()
        if (!documentsEqual(restored.document, state.snapshot.document)) succeeded = false
      } catch {
        succeeded = false
      }
    }
    return succeeded
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail
      .catch(() => undefined)
      .then(async () => {
        if (!this.accepting) throw new Error('PROVIDER_CREDENTIAL_SERVICE_CLOSED')
        return await operation()
      })
    this.mutationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async saveProviderUnlocked(
    request: ProviderCredentialSaveRequest
  ): Promise<IntelligenceProviderConfig> {
    const states = await this.readSurfaceStates()
    const key = providerCredentialSecureStoreKey(request.provider.id)
    const previousCredential = await this.readVaultCredential(key)
    const preservedCredential = this.normalizeVaultCredential(previousCredential)
    const nextCredential =
      request.credential.action === 'set'
        ? request.credential.value
        : request.credential.action === 'clear'
          ? null
          : preservedCredential
    const safeProvider = providerWithCredentialState(request.provider, nextCredential !== null)
    const credentialChanged = previousCredential !== nextCredential

    for (const state of states) {
      const nextProviders = [...state.providers]
      const index = nextProviders.findIndex((item) => item.id === request.provider.id)
      if (index >= 0) nextProviders[index] = safeProvider
      else nextProviders.push(safeProvider)
      const nextDocument = cloneRecord(state.snapshot.document)
      nextDocument.providers = nextProviders
      if (!documentsEqual(nextDocument, state.snapshot.document)) state.nextDocument = nextDocument
    }

    if (credentialChanged && !(await this.applyVault([{ key, value: nextCredential }]))) {
      this.report('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED', 'all', request.provider.id)
      throw new Error('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED')
    }
    await this.commitSurfaceChanges(
      states,
      credentialChanged ? [{ key, value: previousCredential }] : [],
      request.provider.id
    )

    if (nextCredential !== null) this.credentials.set(request.provider.id, nextCredential)
    else this.credentials.delete(request.provider.id)
    return safeProvider
  }

  private async deleteProviderUnlocked(providerId: string): Promise<{ deleted: boolean }> {
    const states = await this.readSurfaceStates()
    const exists = states.some((state) => state.providers.some((item) => item.id === providerId))
    const key = providerCredentialSecureStoreKey(providerId)
    const previousCredential = await this.readVaultCredential(key)

    for (const state of states) {
      const nextDocument = cloneRecord(state.snapshot.document)
      nextDocument.providers = state.providers.filter((item) => item.id !== providerId)
      if (!documentsEqual(nextDocument, state.snapshot.document)) state.nextDocument = nextDocument
    }

    if (previousCredential !== null && !(await this.applyVault([{ key, value: null }]))) {
      this.report('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED', 'all', providerId)
      throw new Error('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED')
    }
    await this.commitSurfaceChanges(
      states,
      previousCredential === null ? [] : [{ key, value: previousCredential }],
      providerId
    )
    this.credentials.delete(providerId)
    return { deleted: exists }
  }

  private report(code: string, surface: string, providerId?: string, count?: number): void {
    this.options.report?.(code, {
      surface,
      ...(providerId ? { providerId } : {}),
      ...(count === undefined ? {} : { count })
    })
  }
}

export function createProviderCredentialService(
  options: ProviderCredentialServiceOptions
): ProviderCredentialService {
  return new ProviderCredentialService(options)
}
