import type { PayloadSpec } from '../../types'
import { asciiFiller, u32be } from './bytes'

/** 16x16 HEIC (one hvc1 item) authored with `sips -s format heic` from a generated PNG; no encoder exists at run time. */
const BASE = Buffer.from(
  [
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAA',
    'AAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAA',
    'AQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAA',
    'FGlzcGUAAAAAAAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAAL',
    'A6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogAB',
    'AAlEAcBhcshEU2QAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAEtAAAAAW1k',
    'YXQAAAAAAAABPQAAASkoAa+hMPgLzyEjDSobkfuMJuxhHEPP3f4DEAVfAW2pUioMGWe3T7A3T6f4bEaGZUcdDeflIC4TJpkq',
    'ibmPNdx5XB+1JCZinEoXiuNQg5VI1q+Z2Ig28jCXuhYvDTzfLOkeBA5L58iXGKr/JQ6bwOcwrnr9kpWrZrsBAenTpNCEbGls',
    'AgtlJcNxxkUz1f/V1kUWZCPefI1lsL80JsckNZmDy0IyMmE/Pwkc4KX3shhcXiTQTKI161Aa+O0aM+IHuLDj+LCVkOtXWN6L',
    'TWlcbgewU92Q+m0HgG+Fsb9iljuzUBPQGbC73GJ9I7ZjXp3X0hzoSWJFr0tYHvTP8+vraVueZiZY8iqWYQb8sqr/8nRlqy1i',
    'WmY59EOXbwD61Jr/qlv+rjXFEItEf/g='
  ].join(''),
  'base64'
)

const BOX_HEADER = 8
const MIN_PAYLOAD = 4

/** A top-level `free` box is skipped by readers; it carries the padding and the seed-dependent bytes. */
export function encodeHeic(spec: PayloadSpec): Buffer {
  const payload = Math.max(MIN_PAYLOAD, spec.bytes - BASE.length - BOX_HEADER)
  return Buffer.concat([
    BASE,
    u32be(payload + BOX_HEADER),
    Buffer.from('free', 'latin1'),
    asciiFiller(payload, spec.seed)
  ])
}
