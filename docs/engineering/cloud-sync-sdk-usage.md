# CloudSyncSDK 使用示例（v1）

本文档给出 `@talex-touch/utils` 中 CloudSyncSDK 的最小可用示例，覆盖主链路（push/pull/blob）与安全链路（keys/device attest）。

## 1. 基础用法（应用侧）

```ts
import { CloudSyncSDK } from '@talex-touch/utils'

const sdk = new CloudSyncSDK({
  baseUrl: 'https://your-nexus-host',
  getAuthToken: () => localStorage.getItem('tuff-app-auth-token') || '',
  getDeviceId: () => localStorage.getItem('tuff-app-device-id') || ''
})

// push（自动握手并附带 x-sync-token）
await sdk.push([
  {
    item_id: 'storage::app-setting.ini',
    type: 'storage.snapshot',
    schema_version: 1,
    payload_enc: '...',
    payload_ref: null,
    meta_plain: {
      qualified_name: 'app-setting.ini',
      schema_version: 1
    },
    payload_size: 1234,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    op_seq: 1,
    op_hash: 'sha256-hex',
    op_type: 'upsert'
  }
])

// pull
const pulled = await sdk.pull({ cursor: 0, limit: 200 })
console.log(pulled.next_cursor, pulled.items.length)
```

## 2. Token 缓存与过期续期

SDK 内置 `sync_token` 缓存与失效后自动握手重试，可通过回调持久化 token。

```ts
const syncTokenCache: { token?: string, expiresAt?: string } = {}

const sdk = new CloudSyncSDK({
  baseUrl: 'https://your-nexus-host',
  getAuthToken: async () => 'auth-token',
  getDeviceId: async () => 'device-id',
  syncTokenCache,
  onSyncTokenUpdate: (token, expiresAt) => {
    syncTokenCache.token = token
    syncTokenCache.expiresAt = expiresAt
  }
})
```

## 3. Blob 上传/下载（大对象）

```ts
// upload
const blob = new Blob(['hello sync blob'], { type: 'text/plain;charset=utf-8' })
const upload = await sdk.uploadBlob(blob, {
  filename: 'example.sync',
  contentType: 'text/plain;charset=utf-8'
})

// download
const downloaded = await sdk.downloadBlob(upload.blob_id)
const text = new TextDecoder().decode(downloaded.data)
console.log(downloaded.sha256, downloaded.sizeBytes, text)
```

## 4. Keyring 与设备证明（MF2A）

```ts
// 列表
const keyrings = await sdk.listKeyrings()

// 新设备签发（服务端要求时可附带 x-login-token）
await sdk.issueDeviceKey({
  target_device_id: 'new-device-id',
  key_type: 'uk',
  encrypted_key: 'base64-ciphertext'
})

// 恢复流程
await sdk.recoverDevice({
  recovery_code: 'your-recovery-code'
})

// 设备证明（fingerprint_hash 可选）
await sdk.attestDevice({
  machine_code_hash: 'sha256(machine-code)',
  fingerprint_hash: 'sha256(optional-fingerprintjs)'
})
```

当接口返回 `DEVICE_NOT_AUTHORIZED` 且消息含 MF2A/step-up 要求时，SDK 支持自动触发 step-up 回调后重试：

```ts
const sdk = new CloudSyncSDK({
  baseUrl: 'https://your-nexus-host',
  getAuthToken: async () => 'auth-token',
  getDeviceId: async () => 'device-id',
  onStepUpRequired: async () => {
    // 打开二次验证流程并拿到 login token
    return 'step-up-login-token'
  }
})
```

## 5. 插件侧用法（Plugin SDK）

插件侧建议使用 `packages/utils/plugin/sdk/cloud-sync.ts`，它会自动通过 `accountSDK` 解析 token/device，并记录同步活动。

```ts
import { CloudSyncSDK } from '@talex-touch/utils/plugin/sdk'

const sdk = new CloudSyncSDK({
  baseUrl: 'https://your-nexus-host',
  // 插件进程可显式注入 channelSend
  channelSend: async (event, data) => {
    // your bridge send
    return null
  }
})

await sdk.pull({ cursor: 0, limit: 50 })
```

注意：插件侧默认会检查用户同步开关。若用户手动关闭同步，会抛出 `SYNC_DISABLED`。

## 6. 当前实现检查清单（代码位置）

- Client SDK: `packages/utils/cloud-sync/cloud-sync-sdk.ts`
- Plugin SDK: `packages/utils/plugin/sdk/cloud-sync.ts`
- 类型定义: `packages/utils/types/cloud-sync.ts`
- 单测: `packages/utils/__tests__/cloud-sync-sdk.test.ts`

