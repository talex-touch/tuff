import { access, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveLocalEmbeddingAssets } from './local-embedding-assets'
import { cachedFileSha256 } from './local-embedding-digest'

/** Exact EmbeddingGemma 2 GGUF identity used by the verified llama.cpp runtime. */
export const LOCAL_EMBEDDING_MODEL = {
  repository: 'ggml-org/embeddinggemma-2-GGUF',
  revision: 'bfcd298762cc34d0357ece5ebdd31791a3a374d8',
  file: 'embeddinggemma-2-Q8_0.gguf',
  bytes: 309_855_456,
  sha256: '2188ac1deca4b77dffefd603c2776a9d76d9d74ec01841392982ebb840b09135',
  dimension: 768,
  runtime: 'llama.cpp-vectors1',
  dtype: 'text-q8_0+mmproj-q8_0'
} as const
export const LOCAL_EMBEDDING_MODEL_KEY = `${'google/embeddinggemma-2'}@${LOCAL_EMBEDDING_MODEL.revision}/${LOCAL_EMBEDDING_MODEL.runtime}/${LOCAL_EMBEDDING_MODEL.dtype}/dim${LOCAL_EMBEDDING_MODEL.dimension}`

/** The image encoder is pinned to the same upstream revision and vector space as text. */
export const LOCAL_EMBEDDING_MEDIA_MODEL = {
  revision: LOCAL_EMBEDDING_MODEL.revision,
  file: 'mmproj-embeddinggemma-2-Q8_0.gguf',
  bytes: 554_821_024,
  sha256: 'c4a8a52691ecef40618438928bdf9e68379b854e24166f292592353db0aab64f'
} as const

export interface LocalEmbeddingModelLocation {
  readonly directory: string
  readonly file: string
}

function cacheDirectory(): string {
  const env = process.env
  if (env.HF_HUB_CACHE)
    return path.join(
      env.HF_HUB_CACHE,
      'models--ggml-org--embeddinggemma-2-GGUF',
      'snapshots',
      LOCAL_EMBEDDING_MODEL.revision
    )
  if (env.HF_HOME)
    return path.join(
      env.HF_HOME,
      'hub',
      'models--ggml-org--embeddinggemma-2-GGUF',
      'snapshots',
      LOCAL_EMBEDDING_MODEL.revision
    )
  return path.join(
    os.homedir(),
    '.cache',
    'huggingface',
    'hub',
    'models--ggml-org--embeddinggemma-2-GGUF',
    'snapshots',
    LOCAL_EMBEDDING_MODEL.revision
  )
}

/** Explicit paths only; this never recursively searches a user's disk or downloads weights. */
export function embeddingModelDirectories(): string[] {
  const configured = process.env.TUFF_LOCAL_EMBEDDING_MODEL_DIR || process.env.DIGUP_MODELS
  if (configured) return [configured]
  const installedDirectory = resolveLocalEmbeddingAssets()?.modelDirectory
  if (installedDirectory) return [installedDirectory]
  return [
    path.join(os.homedir(), 'Library', 'Application Support', 'DigUp', 'Models'),
    cacheDirectory()
  ]
}

export async function locateLocalEmbeddingModel(
  requireMedia = false
): Promise<LocalEmbeddingModelLocation | null> {
  for (const directory of embeddingModelDirectories()) {
    const file = path.join(directory, LOCAL_EMBEDDING_MODEL.file)
    try {
      const details = await stat(file)
      if (details.isFile() && details.size === LOCAL_EMBEDDING_MODEL.bytes) {
        if (requireMedia) {
          const media = await stat(path.join(directory, LOCAL_EMBEDDING_MEDIA_MODEL.file))
          if (!media.isFile() || media.size !== LOCAL_EMBEDDING_MEDIA_MODEL.bytes) continue
        }
        return { directory, file }
      }
    } catch {
      // An absent model is a degraded runtime, not a reason to search unrelated paths.
    }
  }
  return null
}

export async function verifyLocalEmbeddingModel(
  location: LocalEmbeddingModelLocation
): Promise<void> {
  const details = await stat(location.file)
  if (!details.isFile() || details.size !== LOCAL_EMBEDDING_MODEL.bytes) {
    throw new Error(
      `EmbeddingGemma 2 model size mismatch: expected ${LOCAL_EMBEDDING_MODEL.bytes} bytes`
    )
  }
  if ((await cachedFileSha256(location.file)) !== LOCAL_EMBEDDING_MODEL.sha256) {
    throw new Error(
      `EmbeddingGemma 2 model checksum mismatch for ${LOCAL_EMBEDDING_MODEL.revision}`
    )
  }
}

export async function verifyLocalEmbeddingMediaModel(
  location: LocalEmbeddingModelLocation
): Promise<void> {
  const file = path.join(location.directory, LOCAL_EMBEDDING_MEDIA_MODEL.file)
  const details = await stat(file)
  if (!details.isFile() || details.size !== LOCAL_EMBEDDING_MEDIA_MODEL.bytes) {
    throw new Error(
      `EmbeddingGemma 2 media model size mismatch: expected ${LOCAL_EMBEDDING_MEDIA_MODEL.bytes} bytes`
    )
  }
  if ((await cachedFileSha256(file)) !== LOCAL_EMBEDDING_MEDIA_MODEL.sha256) {
    throw new Error(
      `EmbeddingGemma 2 media model checksum mismatch for ${LOCAL_EMBEDDING_MEDIA_MODEL.revision}`
    )
  }
}

export async function isLocalEmbeddingModelReady(): Promise<boolean> {
  const location = await locateLocalEmbeddingModel()
  if (!location) return false
  try {
    await access(location.file)
    return true
  } catch {
    return false
  }
}
