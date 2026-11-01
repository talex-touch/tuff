import { Buffer } from 'node:buffer'
import { mkdtemp, open, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFileDigestCacheForTests } from './local-embedding-digest'
import {
  LOCAL_EMBEDDING_MEDIA_MODEL,
  LOCAL_EMBEDDING_MODEL,
  verifyLocalEmbeddingMediaModel,
  verifyLocalEmbeddingModel
} from './local-embedding-model'

const reads = vi.hoisted(() => ({ files: [] as string[] }))

// Hashing hundreds of MB of pinned weights belongs to the real-model acceptance run.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: ((file: string) => {
      reads.files.push(String(file))
      return Readable.from(
        (async function* () {
          yield Buffer.from('bytes that are not the pinned weights')
        })()
      )
    }) as unknown as typeof actual.createReadStream
  }
})

let directory: string

async function sparseWeight(file: string, bytes: number): Promise<void> {
  const handle = await open(file, 'w')
  try {
    await handle.truncate(bytes)
  } finally {
    await handle.close()
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'embedding-model-verify-'))
  reads.files.length = 0
  clearFileDigestCacheForTests()
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('pinned EmbeddingGemma weight verification', () => {
  it('does not read the text weights again while the file is unchanged', async () => {
    const file = join(directory, LOCAL_EMBEDDING_MODEL.file)
    await sparseWeight(file, LOCAL_EMBEDDING_MODEL.bytes)
    const location = { directory, file }
    await expect(verifyLocalEmbeddingModel(location)).rejects.toThrow(/checksum mismatch/)
    await expect(verifyLocalEmbeddingModel(location)).rejects.toThrow(/checksum mismatch/)
    await expect(verifyLocalEmbeddingModel(location)).rejects.toThrow(/checksum mismatch/)
    expect(reads.files).toEqual([file])
  })

  it('does not read the media weights again while the file is unchanged', async () => {
    const media = join(directory, LOCAL_EMBEDDING_MEDIA_MODEL.file)
    await sparseWeight(media, LOCAL_EMBEDDING_MEDIA_MODEL.bytes)
    const location = { directory, file: join(directory, LOCAL_EMBEDDING_MODEL.file) }
    await expect(verifyLocalEmbeddingMediaModel(location)).rejects.toThrow(/checksum mismatch/)
    await expect(verifyLocalEmbeddingMediaModel(location)).rejects.toThrow(/checksum mismatch/)
    expect(reads.files).toEqual([media])
  })

  it('verifies again once the file at the same path is replaced', async () => {
    const file = join(directory, LOCAL_EMBEDDING_MODEL.file)
    const replacement = join(directory, 'replacement.gguf')
    await sparseWeight(file, LOCAL_EMBEDDING_MODEL.bytes)
    const location = { directory, file }
    await expect(verifyLocalEmbeddingModel(location)).rejects.toThrow(/checksum mismatch/)
    await sparseWeight(replacement, LOCAL_EMBEDDING_MODEL.bytes)
    await rename(replacement, file)
    await expect(verifyLocalEmbeddingModel(location)).rejects.toThrow(/checksum mismatch/)
    expect(reads.files).toEqual([file, file])
  })

  it('still refuses a wrong size before hashing anything', async () => {
    const file = join(directory, LOCAL_EMBEDDING_MODEL.file)
    await sparseWeight(file, LOCAL_EMBEDDING_MODEL.bytes - 1)
    await expect(verifyLocalEmbeddingModel({ directory, file })).rejects.toThrow(/size mismatch/)
    expect(reads.files).toEqual([])
  })
})
