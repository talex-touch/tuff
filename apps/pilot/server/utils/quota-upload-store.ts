interface UploadObjectRecord {
  id: string
  name: string
  mimeType: string
  data: Uint8Array
  createdAt: number
}

const STORE_TTL_MS = 24 * 60 * 60 * 1000
const uploadObjectStore = new Map<string, UploadObjectRecord>()

function randomId(): string {
  return `upload_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-6)}`
}

function purgeExpiredRecords(): void {
  const now = Date.now()
  for (const [key, item] of uploadObjectStore.entries()) {
    if (now - item.createdAt > STORE_TTL_MS) {
      uploadObjectStore.delete(key)
    }
  }
}

export function saveQuotaUploadObject(input: {
  name: string
  mimeType: string
  data: Uint8Array
}): UploadObjectRecord {
  purgeExpiredRecords()

  const id = randomId()
  const record: UploadObjectRecord = {
    id,
    name: String(input.name || '').trim() || `${id}.bin`,
    mimeType: String(input.mimeType || '').trim() || 'application/octet-stream',
    data: input.data,
    createdAt: Date.now(),
  }

  uploadObjectStore.set(id, record)
  return record
}

export function getQuotaUploadObject(id: string): UploadObjectRecord | null {
  purgeExpiredRecords()
  return uploadObjectStore.get(String(id || '').trim()) || null
}
