export type SyncErrorCode =
  | 'QUOTA_STORAGE_EXCEEDED'
  | 'QUOTA_OBJECT_EXCEEDED'
  | 'QUOTA_ITEM_EXCEEDED'
  | 'QUOTA_DEVICE_EXCEEDED'
  | 'SYNC_INVALID_CURSOR'
  | 'SYNC_INVALID_PAYLOAD'
  | 'SYNC_INVALID_TOKEN'
  | 'SYNC_TOKEN_EXPIRED'
  | 'DEVICE_NOT_AUTHORIZED'

export interface QuotaInfo {
  plan_tier?: string
  limits: {
    storage_limit_bytes: number
    object_limit: number
    item_limit: number
    device_limit: number
  }
  usage: {
    used_storage_bytes: number
    used_objects: number
    used_devices: number
  }
}

export interface SyncItemInput {
  item_id: string
  type: string
  schema_version: number
  payload_enc?: string | null
  payload_ref?: string | null
  meta_plain?: Record<string, unknown> | null
  payload_size?: number | null
  updated_at: string
  deleted_at?: string | null
  op_seq: number
  op_hash: string
  op_type: 'upsert' | 'delete'
}

export interface SyncItemOutput {
  item_id: string
  type: string
  schema_version: number
  payload_enc: string | null
  payload_ref: string | null
  meta_plain: Record<string, unknown> | null
  payload_size: number | null
  updated_at: string
  deleted_at: string | null
  device_id: string | null
}

export interface SyncOplogItem {
  cursor: number
  item_id: string
  op_seq: number
  op_hash: string
  op_type: 'upsert' | 'delete'
  updated_at: string
  device_id: string
}

export interface ConflictItem {
  item_id: string
  server_updated_at: string
  server_device_id: string | null
}

export interface HandshakeResponse {
  sync_token: string
  sync_token_expires_at: string
  server_cursor: number
  device_id: string
  quotas: QuotaInfo
}

export interface PushResponse {
  ack_cursor: number
  conflicts: ConflictItem[]
}

export interface PullResponse {
  items: SyncItemOutput[]
  oplog: SyncOplogItem[]
  next_cursor: number
}

export interface UploadResponse {
  blob_id: string
  object_key: string
  sha256: string
  size_bytes: number
}

export interface QuotaValidateResponse {
  ok: boolean
  code: SyncErrorCode | null
}

export interface KeyRegisterResponse {
  keyring_id: string
}

export interface KeyRotateResponse {
  rotated_at: string
}

export interface KeyringMeta {
  keyring_id: string
  device_id: string
  key_type: string
  rotated_at: string | null
  created_at: string
  has_recovery_code: boolean
}

export interface KeyringSecret {
  keyring_id: string
  device_id: string
  key_type: string
  encrypted_key: string
  rotated_at: string | null
  created_at: string
}

export interface KeysListResponse {
  keyrings: KeyringMeta[]
}

export interface KeysIssueDeviceResponse {
  keyring_id: string
}

export interface KeysRecoverDeviceResponse {
  keyrings: KeyringSecret[]
}

export interface DeviceAttestResponse {
  ok: boolean
  device_id: string
  updated_at: string
}
