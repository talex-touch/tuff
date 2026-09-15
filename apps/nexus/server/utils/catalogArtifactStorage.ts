import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import type { StorageObjectMemory } from './storageObjectStore'
import { readCloudflareBindings } from './cloudflare'
import { getStorageObject, putStorageObject } from './storageObjectStore'

const CATALOG_ARTIFACT_CONTENT_TYPE = 'application/json; charset=utf-8'

/**
 * Local/memory mirror of the shared asset bucket, the same shape
 * `releaseAssetStorage` and `sceneAssetStorage` use. It exists so the routes can be
 * exercised against real storage semantics (including the governance read path) without
 * a remote bucket.
 */
const memoryStorage: StorageObjectMemory = new Map()

export interface CatalogArtifact {
  data: Buffer
  contentType: string
  sha256: string
}

function getCatalogArtifactBucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  return bindings?.ASSETS ?? bindings?.R2 ?? null
}

/**
 * Stage an artifact into the object storage the routes project over.
 *
 * Publishing is deferred: this is the staging/verification seam used by the focused route
 * tests and by any future release step. Nothing in the request path writes.
 */
export async function stageCatalogArtifact(
  event: H3Event,
  key: string,
  data: Buffer,
  contentType?: string | null,
): Promise<void> {
  await putStorageObject({
    event,
    bucket: getCatalogArtifactBucket(event),
    memoryStorage,
    key,
    data,
    contentType,
    resourceType: 'catalog-artifact',
    defaultContentType: CATALOG_ARTIFACT_CONTENT_TYPE,
  })
}

/**
 * Read the exact stored bytes. There is no parse, no signature check, and no rewrite here:
 * the manifest is produced and signed at build time, and the payload is content-addressed,
 * so re-deriving either per request would only add a second source of truth.
 */
export async function readCatalogArtifact(
  event: H3Event,
  key: string,
): Promise<CatalogArtifact | null> {
  const object = await getStorageObject({
    event,
    bucket: getCatalogArtifactBucket(event),
    memoryStorage,
    key,
    resourceType: 'catalog-artifact',
    defaultContentType: CATALOG_ARTIFACT_CONTENT_TYPE,
  })

  return object
    ? { data: object.data, contentType: object.contentType, sha256: object.sha256 }
    : null
}
