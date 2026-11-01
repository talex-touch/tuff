/**
 * Storage format of `embeddings.embedding`.
 *
 * New rows hold the vector as a little-endian float32 BLOB (4 bytes per dimension, no header),
 * which is the layout libSQL's `vector32()` produces. Rows written before the BLOB format hold a
 * JSON array in TEXT. Both stay readable: the column is declared TEXT, SQLite keeps a BLOB value in
 * a TEXT-affinity column untouched, and `typeof(embedding)` tells the two apart.
 *
 * A float32 BLOB is about 3 KB for a 768-dimension vector against about 16 KB of JSON.
 */

/** Little-endian float32 bytes of `vector`. */
export function encodeVectorBlob(vector: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(vector.length * Float32Array.BYTES_PER_ELEMENT)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < vector.length; index++) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, vector[index]!, true)
  }
  return bytes
}

/**
 * Reads one stored vector of exactly `dimension` finite components.
 *
 * Returns `null` for anything that cannot be scored against that dimension: malformed JSON, a
 * non-array, a wrong length, a non-finite component, or a BLOB whose size is not `dimension * 4`.
 * A BLOB is decoded through a `DataView`, so it needs no particular alignment and no copy.
 */
export function readStoredVector(value: unknown, dimension: number): ArrayLike<number> | null {
  if (typeof value === 'string') {
    let candidate: unknown
    try {
      candidate = JSON.parse(value)
    } catch {
      return null
    }
    if (!Array.isArray(candidate) || candidate.length !== dimension) return null
    for (let index = 0; index < dimension; index++) {
      const component: unknown = candidate[index]
      if (typeof component !== 'number' || !Number.isFinite(component)) return null
    }
    return candidate as number[]
  }
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null
  if (!bytes || bytes.byteLength !== dimension * Float32Array.BYTES_PER_ELEMENT) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoded = new Float32Array(dimension)
  for (let index = 0; index < dimension; index++) {
    const component = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true)
    if (!Number.isFinite(component)) return null
    decoded[index] = component
  }
  return decoded
}
