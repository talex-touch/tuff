# 微审计 45/70

- 审计主题：旧 `/api/sync/*` 同步入口是否仍可能被误当作 Raycast / Alfred / uTools 式“设置、片段、插件数据同步”的可用路径；重点核对 Tuff 是否已经把新增同步能力强制收敛到 `/api/v1/sync/*`，并让 legacy `/api/sync/pull|push` 只返回退役提示，而不是继续保留明文或兼容写入通道。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
    - 第 3 节把 Storage / Sync / Security 标为“规则明确，仍需执行一致性”，明确 `cloud-sync-sdk.ts` 使用 `/api/v1/sync/*`，`types/cloud-sync.ts` 限定 `payload_enc` / `payload_ref`。
    - 第 5.3 节禁止任何业务明文 JSON dump，同步载荷只能使用 `payload_enc` / `payload_ref`，本地 SoT 仍是 SQLite 或受控本地索引。
    - 第 6 节把 Storage / Sync guard 写成 release evidence：不产生明文同步 payload，App Data / Clipboard 无默认 cloud push。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 69 条确认 `SyncItemInput` 使用 `payload_enc` / `payload_ref`，`CloudSyncSDK` 走 `/api/v1/sync/*`，文档禁止明文 JSON dump 的口径正确。
    - 第 70 条补充 `deviceId` 只能做设备标识，不能被当作密钥材料；这与 v1 sync 的设备 header 语义一致。
  - `AGENTS.md`
    - Storage Rule 要求 SQLite 是本地唯一权威源，JSON 只允许作为密文同步载荷或引用。
    - Sync Compatibility Rule 要求新同步能力必须走 `/api/v1/sync/*`、`/api/v1/keys/*`、`/api/v1/devices/*`；旧 `/api/sync/*` 只允许迁移期只读，禁止新增依赖。
  - `packages/utils/cloud-sync/cloud-sync-sdk.ts`
    - `handshake()` 调用 `/api/v1/sync/handshake`。
    - `push()` 调用 `/api/v1/sync/push`。
    - `pull()` 调用 `/api/v1/sync/pull`。
    - `uploadBlob()` 与 blob download 调用 `/api/v1/sync/blobs/*`。
    - 未看到 SDK 回退到旧 `/api/sync/*` 的路径。
  - `packages/utils/types/cloud-sync.ts`
    - `SyncItemInput` 只有 `payload_enc?: string | null` 与 `payload_ref?: string | null`，没有 `value_json`、`payload_json` 或其他业务明文字段。
    - `meta_plain` 仍存在，因此只能放非敏感 metadata；不能承载 snippet body、clipboard text、URL 明文或浏览器数据标题。
  - `apps/nexus/types/sync-api.d.ts`
    - OpenAPI 类型只声明 `/api/v1/sync/handshake`、`/api/v1/sync/push`、`/api/v1/sync/pull`、`/api/v1/sync/blobs/*` 等 v1 路径。
    - v1 push request body 只接收 `SyncItemInput[]`。
  - `apps/nexus/server/api/sync/pull.get.ts`
    - 旧 `GET /api/sync/pull` 直接抛 `410`，错误码为 `SYNC_RETIRED_READ_DISABLED`，提示改用 `/api/v1/sync/pull`。
  - `apps/nexus/server/api/sync/push.post.ts`
    - 旧 `POST /api/sync/push` 直接抛 `410`，错误码为 `SYNC_RETIRED_WRITE_DISABLED`，提示改用 `/api/v1/sync/push`。
  - `apps/nexus/test/api/sync/sync-routes-410.test.ts`
    - 测试断言旧 pull / push route 始终返回 `410`，且 push 不进入鉴权链路。
    - 这能防止 legacy route 被误恢复成可写同步入口。

- 结论：
  - 主文档的同步安全口径成立。Tuff 当前面向客户端的 `CloudSyncSDK` 和 Nexus OpenAPI 类型都以 `/api/v1/sync/*` 为主路径，旧 `/api/sync/*` 没有继续承载 pull / push 业务。
  - 旧 route 不是“兼容同步服务”，而是显式退役入口：调用后只会得到 `410` 和 v1 路径提示。这个行为比 silent fallback 更适合当前 hard-cut 目标，因为它不会让插件、CoreApp 或外部脚本误以为旧明文/旧协议仍可写入。
  - 这与竞品“设置、片段、插件数据可同步”的产品心智可以映射，但 Tuff 不能把它表达成普通 JSON 同步能力；准确表述应是：私有同步必须走 v1 sync、密文 payload 或 blob ref、设备授权与 token 握手，公开内容分享则另走 CloudShare。
  - 后续 evidence 重点不应再证明旧 route 可用，而应抽样确认三件事：SDK 发出的 URL 没有 `/api/sync/*`；push item 不含业务明文字段；旧 route 的 410 测试仍在质量门禁中运行。

- 是否发现需修正的主文档问题：否。`09-cross-platform-local-data.md` 和 `11-100-round-cross-review-ledger.md` 没有把旧 `/api/sync/*` 误写成可用能力，也没有把 sync 口径夸大成明文 JSON 兼容同步。现有文档只需要后续 release evidence，不需要修正主文档事实。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增本文件作为中文 Markdown 微审计记录；未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未改业务代码，未执行 git commit / push / reset / checkout。
