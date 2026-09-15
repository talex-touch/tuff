import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'
import {
  assertCredentialObject,
  assertNonEmptyString,
  createTypedCredentialStore,
  optionalString,
  type StoreTypedCredentialResult,
  type TypedCredentialRecord,
} from './secureCredentialStore'

export type StorageCredentialType = 'access_key'

export interface StorageAccessKeyCredential {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export type StorageCredentialPayload = StorageAccessKeyCredential

export interface StoreStorageCredentialInput {
  authRef: unknown
  credentialType: unknown
  credentials: unknown
}

export type StoreStorageCredentialResult = StoreTypedCredentialResult<StorageCredentialType>
export type StorageCredentialRecord = TypedCredentialRecord<StorageCredentialType>

function normalizeCredentialType(value: unknown): StorageCredentialType {
  if (value === 'access_key')
    return value
  throw createError({ statusCode: 400, statusMessage: 'credentialType is invalid.' })
}

function normalizeCredentialPayload(
  credentialType: StorageCredentialType,
  value: unknown,
): StorageCredentialPayload {
  const credentials = assertCredentialObject(value)
  if (credentialType === 'access_key') {
    return {
      accessKeyId: assertNonEmptyString(credentials.accessKeyId, 'credentials.accessKeyId', 512),
      secretAccessKey: assertNonEmptyString(credentials.secretAccessKey, 'credentials.secretAccessKey', 4096),
      sessionToken: optionalString(credentials.sessionToken, 'credentials.sessionToken', 4096),
    }
  }

  throw createError({ statusCode: 400, statusMessage: 'credentialType is invalid.' })
}

const store = createTypedCredentialStore<StorageCredentialType, StorageCredentialPayload>(
  {
    table: 'storage_secure_store',
    authRefPattern: /^secure:\/\/storage\/[a-z0-9][a-z0-9._-]{0,79}$/i,
    authRefHint: 'secure://storage/<slug>',
    saltPrefix: 'tuff-storage-secure-store:',
    info: 'storage-secure-store:v1',
    kidDomain: 'storage-secure-store-kid:v1',
    errorPrefix: 'STORAGE_CREDENTIAL',
    label: 'Storage secure store key',
    devFallbackSecret: 'tuff-nexus-storage-dev-secure-store-key',
    readMasterKeyCandidates: (event) => {
      const runtimeConfig = useRuntimeConfig(event) as {
        storageCredentials?: { secureStoreKey?: string }
      }
      return [
        readCloudflareBindings(event)?.STORAGE_SECURE_STORE_KEY,
        runtimeConfig.storageCredentials?.secureStoreKey,
        process.env.STORAGE_SECURE_STORE_KEY,
      ]
    },
  },
  { credentialType: normalizeCredentialType, credentialPayload: normalizeCredentialPayload },
)

export function normalizeStorageAuthRef(value: unknown): string {
  return store.normalizeAuthRef(value)
}

export async function storeStorageCredential(
  event: H3Event,
  input: StoreStorageCredentialInput,
  createdBy: string,
): Promise<StoreStorageCredentialResult> {
  return store.store(event, input, createdBy)
}

export async function getStorageCredential(
  event: H3Event,
  authRef: string,
): Promise<StorageCredentialPayload | null> {
  return store.get(event, authRef)
}

export async function storageCredentialExists(
  event: H3Event,
  authRef: string,
): Promise<boolean | null> {
  return store.exists(event, authRef)
}

export async function listStorageCredentials(event: H3Event): Promise<StorageCredentialRecord[]> {
  return store.list(event)
}

export async function deleteStorageCredential(event: H3Event, authRef: string): Promise<boolean> {
  return store.delete(event, authRef)
}
