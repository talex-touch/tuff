# 微审计 39/70

## 审计主题

Storage / Sync 安全边界是否能支撑 Raycast / Alfred / uTools 中“设置、片段、插件数据可同步”的产品心智；重点核对 Tuff 是否把 CloudShare 公共内容包和 CloudSync 私密数据同步区分开，并坚持业务数据只走 `payload_enc` / `payload_ref`，`deviceId` 只做设备标识而不是密钥材料。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
  - 第 3 节把 Storage / Sync / Security 标为“规则明确，仍需执行一致性”，明确 App Data 和 Clipboard 不应以明文 JSON dump 同步。
  - 第 5.1 节要求 Sync key / secret / provider credential 依赖 secure store 或显式 degraded，并强调 `deviceId` 不能作为密钥材料。
  - 第 5.3 节禁止同步任何业务明文 JSON dump，同步载荷只能使用 `payload_enc` / `payload_ref`。
  - 第 6 节把 Storage / Sync guard 作为 2.4.11 evidence，验收点是不产生明文同步 payload，App Data / Clipboard 无默认 cloud push。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 66 条区分 CloudShare 与 CloudSync：CloudShare 是公共 / 团队内容包，CloudSync 是私密加密同步。
  - 第 69 条确认 `SyncItemInput` 使用 `payload_enc` / `payload_ref`，`CloudSyncSDK` 走 `/api/v1/sync/*`。
  - 第 70 条确认 `deviceId` 只做设备标识，密钥应走 secure store。
- `packages/utils/types/cloud-sync.ts`
  - `SyncItemInput` 只暴露 `payload_enc?: string | null` 与 `payload_ref?: string | null`，没有 `payload_json` / `value_json` 这类业务明文字段。
  - `meta_plain` 仍可存在，因此只能放非业务明文 metadata，如 qualified name、hash、schema version、size、key id。
- `packages/utils/cloud-sync/cloud-sync-sdk.ts`
  - `push()` 调 `/api/v1/sync/push`，`pull()` 调 `/api/v1/sync/pull`，blob 调 `/api/v1/sync/blobs/*`。
  - `buildHeaders()` 只把 `deviceId` 放进 `x-device-id`，它是请求身份 / 设备维度字段，不参与本地 payload 加密。
- `apps/core-app/src/main/modules/sync/sync-payload-wire.ts`
  - `buildSyncItemFromSnapshot()` 使用 `snapshot.payloadEnc` 写入 `payload_enc`。
  - `buildBlobSyncItem()` 对大对象只写 `payload_ref: "blob:<id>"`，上传内容仍来自加密后的 `snapshot.payloadEnc`。
  - `buildDeletedSyncItem()` 删除记录不携带明文 payload。
- `apps/core-app/src/main/modules/sync/sync-payload-wire.test.ts`
  - 测试断言 `payload_enc` 匹配 `enc:v1:`，且不包含 `plain-business-value`。
  - blob 场景同样断言上传文本是加密 payload，不包含 `large-business-value`。
  - `b64:` 只作为迁移 fallback read，并标记 `requiresMigrationRewrite: true`，不能视为新的正常同步格式。
- `apps/core-app/src/main/modules/sync/index.ts`
  - `resolveSdk()` 从 auth 模块解析 `deviceId` 传给 `CloudSyncSDK`。
  - push 前先 `ensureSyncPayloadKeyRegistered()`，再 `collectStorageSnapshots()`，随后按大小构造 encrypted item 或 encrypted blob item。
- `apps/core-app/src/main/utils/secure-store.ts`
  - 优先加载 Electron `safeStorage`，不可用时才降级到 `local-secret`，并标记 degraded。
  - secure store 的 key material 来自随机 AES-256 secret 与系统安全存储 / 本地 envelope，不由 `deviceId` 派生。
- `packages/utils/cloud-share/cloud-share-sdk.ts` 与 `packages/utils/cloud-share/snippet-pack.ts`
  - CloudShare 面向插件内容包 / snippet pack 发布，不是私密 App Data / Clipboard / Snippets 状态的默认同步通道。

## 结论

主文档判断成立：Tuff 当前 CloudSync 的 wire contract 没有把业务明文 JSON 当作同步载荷，公开类型和 CoreApp 构造路径都把 payload 收敛到 `payload_enc` 或 `payload_ref`。这与竞品中“配置、片段、插件数据可跨设备”的心智可以映射，但 Tuff 的正确表达应是“私密数据加密同步”，不是“把本地 JSON 直接同步到云端”。

本轮最关键的映射边界有三点：

1. **CloudShare 不等于 CloudSync**：CloudShare 可以承载公共 / 团队可分享内容包，例如 snippet pack；Clipboard 历史、App Data、个人 snippets 配置不应借 CloudShare 伪装成同步能力。
2. **`meta_plain` 不是业务明文出口**：当前代码把 qualified name、schema version、payload size、content hash、crypto version、key id 放入 `meta_plain` 是合理的；但后续若把 URL、clipboard text、snippet body、browser data title 等写入 `meta_plain`，就会违反主文档边界。
3. **`deviceId` 只能参与设备识别**：源码里它用于 `x-device-id` 和 auth / sync runtime profile；payload 加密 key 依赖 secure store / random secret / key registration，而不是 `deviceId`。主文档要求“不得把 deviceId 当密钥材料”与当前实现方向一致。

因此，09 文档把 Storage / Sync guard 放入 2.4.11 evidence 是准确的：后续验收不应只看 API 能否 push/pull，而要抽样确认同步 payload、blob 上传内容、日志与 trace 均不含业务明文，并确认 App Data / Clipboard / Snippets 不会默认 cloud push。

## 是否发现需修正的主文档问题

否。`09-cross-platform-local-data.md` 与 `11-100-round-cross-review-ledger.md` 对 Storage / Sync 的表述没有把当前能力夸大成完整竞品同步，也没有混淆 CloudShare 与 CloudSync。当前需要的是后续 release evidence 和 guard sample，而不是修正文档事实。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-39.md`，未修改业务代码，未修改 01-11 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 `git commit` / `git push` / 分支 / reset / checkout / 工作树清理操作。
