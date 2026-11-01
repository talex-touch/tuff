import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'

interface DigestEntry {
  readonly stamp: string
  readonly sha256: string
}

const digests = new Map<string, DigestEntry>()

// ctime moves on every write and on utimes, so a restored mtime cannot hide a rewrite.
function stampOf(details: BigIntStats): string {
  return [details.dev, details.ino, details.size, details.mtimeNs, details.ctimeNs].join(':')
}

/** In-process only: a stamp stored on disk next to the asset could be forged along with it. */
export async function cachedFileSha256(file: string): Promise<string> {
  const key = path.resolve(file)
  // One descriptor for stamp, bytes and closing stamp: two path lookups could name different files.
  const handle = await open(key, 'r')
  try {
    const stamp = stampOf(await handle.stat({ bigint: true }))
    const cached = digests.get(key)
    if (cached?.stamp === stamp) return cached.sha256
    const hash = createHash('sha256')
    // Leave the descriptor open (no autoClose, no destroy on return): the closing stamp needs it.
    const bytes = createReadStream(key, { fd: handle.fd, autoClose: false, highWaterMark: 8 << 20 })
    for await (const chunk of bytes.iterator({ destroyOnReturn: false })) hash.update(chunk)
    const sha256 = hash.digest('hex')
    // A write during the read leaves bytes that match no stamp: return them, store nothing.
    if (stampOf(await handle.stat({ bigint: true })) === stamp) digests.set(key, { stamp, sha256 })
    return sha256
  } finally {
    await handle.close()
  }
}

export function clearFileDigestCacheForTests(): void {
  digests.clear()
}
