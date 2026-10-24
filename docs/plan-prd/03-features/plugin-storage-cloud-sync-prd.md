# 插件存储与云同步收敛 PRD

> 状态：设计稿，未改代码
>
> 范围：CoreApp 插件普通存储、插件配置云同步、Nexus Sync Blob 生命周期、云端存储详情展示
>
> 不在本 PRD 内：插件运行时隔离、插件 SQLite 业务模型、通用 CloudSync SDK 开放、账号 Secret 迁移

## 1. 一句话结论

当前实现不是“插件文件同步”，而是“插件 `config` 根目录下所有顶层 `.json` 的快照同步”。它会把草稿、临时状态和未声明的普通 JSON 一并纳入同步；大快照先上传随机 Blob，再提交逻辑同步项，但没有完整的旧 Blob、失败上传和删除 Blob 回收链路。

本 PRD 的目标是把它收敛为：

> **插件显式声明可同步对象 → 本地生成稳定同步项 → 加密快照幂等上传 → 服务端提交引用 → 引用驱动 Blob 回收 → 云端只展示用户可理解的插件数据。**

## 2. 现状证据

| 事实 | 当前实现 | 影响 |
|---|---|---|
| 插件文件枚举 | `TouchPlugin.listPluginFiles()` 读取 `config` 根目录，并筛选所有 `.json` | 没有 manifest allowlist；草稿、缓存、临时状态只要是 `.json` 就可能进入同步 |
| 同步身份 | `storage::plugin::<pluginName>::<fileName>` | 内部 qualified name 直接出现在云端详情；插件重命名可能改变同步身份 |
| 快照格式 | `type = storage.snapshot`，小对象使用 `payload_enc`，大对象使用 `payload_ref = blob:<id>` | 云端看到的是逻辑项和附件引用，不是原始文件目录 |
| 大对象流程 | 客户端先上传 Blob，再调用 `client.push(items)` | Push 失败、冲突、进程崩溃时可能留下未引用 Blob |
| Blob key | `userId/<randomUUID>` | 对象名随机，不等于插件原文件名；重复内容无法直接幂等复用 |
| Blob 清理 | 当前服务端有上传、读取和元数据记录路径，未形成按引用回收的删除/GC 闭环 | 旧版本、删除项和失败上传可能长期占用对象存储 |
| 删除语义 | `sync_items_v1` 保留行，仅更新 `deleted_at` | tombstone、oplog 和详情项目会持续积累，需要受控保留策略 |
| 非 JSON 数据 | 非 `.json` 文件、`config` 子目录文件不进入该同步链路 | “插件存储已同步”的产品语义不准确，开发者容易误判覆盖范围 |
| Secret | Secret 走独立 secure-store，不应进入普通快照 | 必须继续保持普通 JSON / sync payload 不承载凭据的边界 |

### 2.1 关键代码位置

- 本地枚举与同步收集：`apps/core-app/src/main/modules/plugin/plugin.ts`、`apps/core-app/src/main/modules/sync/index.ts`
- 快照 wire format：`apps/core-app/src/main/modules/sync/sync-payload-wire.ts`
- Blob 上传 API：`apps/nexus/server/api/v1/sync/blobs/upload.post.ts`
- Blob/D1 元数据：`apps/nexus/server/utils/syncStoreV1.ts`
- 对象存储写入：`apps/nexus/server/utils/storageObjectStore.ts`
- 云端详情：`apps/nexus/app/pages/dashboard/storage.vue`
- SDK 普通文件存储：`packages/utils/plugin/sdk/storage.ts`

## 3. 用户问题

### 3.1 终端用户

- 云同步详情出现 `plugin::name::xxx.json`、随机 Blob 名称等内部标识。
- 无法判断哪些数据是插件设置，哪些是草稿、缓存或历史残留。
- 删除插件或删除配置后，云端仍可能看到已删除项目。
- 云端容量数字和实际对象存储增长可能不一致：逻辑快照已覆盖，但旧 Blob 未回收。

### 3.2 插件开发者

- 只要写入普通 `.json`，就可能被纳入同步；无法通过 manifest 表达“这个文件可同步、那个文件只本地保存”。
- 非 `.json` 数据不会同步，当前规则不符合“插件存储”的直觉。
- 没有稳定的同步数据分类：设置、业务数据、草稿、缓存、日志和 Secret 的边界依赖约定。

### 3.3 平台与运维

- Blob 上传与逻辑 Push 不是一个原子操作，失败残留需要补偿。
- 随机对象 key 让重试去重、引用计数和孤儿扫描变复杂。
- D1 `sync_items_v1`、`sync_blobs_v1`、R2/外部对象存储和 quota 使用量没有一个清晰的最终一致性收敛合同。

## 4. 产品目标

### 4.1 必须达成

1. **显式范围**：新插件必须声明可同步文件；未声明的普通文件不进入云同步。
2. **安全默认**：Secret、token、API key、provider credential、日志、缓存和临时状态不能通过普通插件同步上传。
3. **稳定身份**：同步项使用稳定插件身份和稳定相对路径；展示名称与内部 key 分离。
4. **幂等上传**：同一用户、同一同步项、同一内容重复上传不会无限生成新逻辑对象或新 Blob。
5. **引用回收**：只有被当前同步项或受保护历史引用的 Blob 才保留；失败上传和旧引用必须可回收。
6. **删除可收敛**：删除、卸载、冲突、离线设备重新上线后，逻辑项和 Blob 都能在有限时间内收敛。
7. **可解释展示**：云端详情展示插件名称、文件显示名、数据类型、大小、更新时间和状态，不展示原始 `plugin::` key 作为主标题。
8. **兼容迁移**：已有插件和已有同步项不能因引入 allowlist、稳定 ID 或 Blob GC 而丢失数据。

### 4.2 非目标

- 不在本轮开放插件自定义云端 API；现有 `CloudSyncSDK` 继续保持不可用。
- 不把所有插件数据迁移到 SQLite。
- 不尝试对任意 JSON 做不可靠的字段级 Secret 自动识别或自动脱敏。
- 不立即物理删除所有历史 tombstone；离线设备需要一个可验证的保留窗口。
- 不改变现有 secure-store 的密钥、加密和 Secret 备份合同。
- 不把所有本地 `data`、运行日志、缓存和临时文件自动变成同步对象。

## 5. 目标用户体验

### 5.1 插件开发者

Manifest 增加同步声明。声明使用稳定相对路径，路径只能位于插件受控的配置/数据根目录，不能使用 `..`、绝对路径或符号链接路径。

建议形状：

```ts
interface PluginStorageSyncManifest {
  files: Array<{
    path: string
    kind: 'settings' | 'data'
    displayName?: LocalizedTextValue
  }>
}
```

示例：

```json
{
  "name": "example-plugin",
  "storageSync": {
    "files": [
      { "path": "settings.json", "kind": "settings", "displayName": "设置" },
      { "path": "bookmarks.json", "kind": "data", "displayName": "书签" }
    ]
  }
}
```

规则：

- `files` 只允许精确路径，第一版不支持 glob，避免误纳入新文件。
- `settings` 与 `data` 都可以同步，但必须显式声明。
- `cache`、`runtimeLogs`、`temp`、`secret` 不提供同步声明能力。
- Secret 必须使用 secure-store；普通 JSON 不得承载凭据。
- manifest 只能声明自己插件目录下的路径，不能指定其他插件或宿主路径。
- `displayName` 只用于展示，不参与同步身份和冲突判断。

### 5.2 终端用户

云端存储详情显示：

| 字段 | 示例 |
|---|---|
| 插件 | 浏览器工具 |
| 数据项 | 书签 |
| 类型 | 插件数据 / 设置 |
| 状态 | 生效中 / 已删除 / 等待回收 |
| 大小 | 12 KB |
| 最近更新 | 本地化时间 |

默认不展示：

- `plugin::...` 原始 qualified name；
- R2 / 外部对象存储的 object key；
- 加密 payload、Blob ID、内容哈希；
- 已回收的孤儿对象。

诊断管理员视图可以展示内部 ID、Blob 引用和回收状态，但不展示解密内容。

## 6. 目标架构

```text
┌──────────────────────── CoreApp ────────────────────────┐
│ Plugin Manifest                                          │
│   └─ explicit storageSync.files                          │
│                                                         │
│ Plugin Storage Service                                   │
│   └─ validate path / kind / owner                        │
│   └─ emit stable SyncItem {pluginId, path, contentHash}  │
│                                                         │
│ Sync Snapshot                                            │
│   └─ encrypt payload                                      │
│   └─ small: payload_enc                                  │
│   └─ large: upload staged Blob                           │
│                                                         │
│ Push Commit                                              │
│   └─ D1 upsert sync_items_v1                             │
│   └─ bind payload_ref                                    │
│   └─ mark Blob committed                                  │
└─────────────────────────────────────────────────────────┘
                         │ /api/v1/sync/*
                         ▼
┌──────────────────────── Nexus ───────────────────────────┐
│ sync_items_v1: logical current state + tombstones         │
│ sync_blobs_v1: object metadata + staged/committed state   │
│ R2/external object store: encrypted bytes only            │
│                                                         │
│ bounded reconciliation                                   │
│   └─ live payload_ref scan                                │
│   └─ staged TTL scan                                      │
│   └─ unreferenced Blob delete                             │
│   └─ quota repair                                         │
└─────────────────────────────────────────────────────────┘
```

## 7. 详细需求

### P0：Blob 生命周期安全

#### P0.1 Blob 状态机

`sync_blobs_v1.status` 至少区分：

- `staged`：对象已上传，但尚未被 `sync_items_v1.payload_ref` 引用；
- `committed`：存在当前同步项引用；
- `orphaned`：扫描发现无引用，进入删除宽限期；
- `deleted`：对象已删除或确认不存在；
- `delete_failed`：删除失败，保留稳定错误码并等待重试。

当前表已有 `status` 字段时优先迁移现有字段语义，不另造平行表。

#### P0.2 上传与 Push 的补偿合同

- `item_id`；
- 客户端操作标识 `upload_attempt_id`；
- 逻辑内容版本标识；
- 加密载荷大小；
- 服务端计算的加密载荷 SHA-256。

要求：

1. `prepare` 只提交 item/version/hash/size 元数据；匹配现有 Blob 时返回 `reuse`，不得先发送文件字节。
2. 上传成功只代表 Blob 进入 `staged`，不能代表同步项已生效。
3. Push 成功写入 `payload_ref` 后，Blob 才能变成 `committed`。
4. Push 冲突、Push 超时、客户端崩溃不删除当前有效引用；未绑定 Blob 由 TTL GC 回收。
5. 同一个 `item_id + logicalVersion` 重试必须返回已存在的 staged/committed Blob，而不是创建无限新对象。
6. quota 预占、提交、回收和对账必须可重复执行，失败不能报告虚假的最终成功。
7. 超过 1 MiB 的载荷使用 1 MiB 分块；服务端按用户、块 SHA-256 和大小复用已有块，提交后由 Blob Manifest 引用块。

#### P0.3 引用驱动 GC

新增有界后台回收任务：

- 扫描 `sync_items_v1` 当前非删除项的 `payload_ref`；
- 扫描受保留窗口保护的 tombstone 引用；
- 扫描 `sync_blobs_v1` 的 `staged`、`committed`、`orphaned`、`delete_failed` 状态；
- `committed/ready` 无任何当前引用 → 保留有限版本窗口（默认 24 小时）后标记 `orphaned`；
- `staged` 超过宽限期且无绑定引用 → 删除；
- `delete_failed` 按重试宽限期重新进入删除；
- 删除对象成功后再写 `deleted`，删除失败保留 `delete_failed`；
- 分块 Blob 删除时先释放 Manifest 引用；只有没有其他 Blob/上传会话引用的块才删除；
- 过期分块上传会话及无引用块由同一有界 GC 清理；
- 每轮使用 keyset 分页和固定上限，不一次加载全量用户对象；
- 删除操作必须按 user/owner 边界执行，不能接受客户端任意 object key。

推荐默认值：

- staged 宽限期：24 小时；
- committed/ready 旧版本保留窗口：24 小时；
- delete_failed 重试宽限期：24 小时；
- GC 扫描：同步握手、Push 成功后按用户触发有界 reconciliation，并可由后台任务复用同一入口；
- 所有期限必须集中配置，不能散落在 API handler。

#### P0.4 幂等策略

第一版采用“按用户、同步项、逻辑内容版本复用 Blob”的幂等策略，不要求跨不同同步项做内容去重。

原因：

- 跨同步项共享 Blob 会增加引用计数、删除和权限边界复杂度；
- 先解决同一项重试产生孤儿对象的问题；
- 不改变现有加密随机性和 payload wire format。

### P1：显式同步范围

#### P1.1 Manifest allowlist

扩展 `IManifest`，加入可选的 `storageSync` 声明。宿主加载 manifest 时完成：

- schema 校验；
- 相对路径规范化；
- 路径穿越和符号链接拒绝；
- 重复路径拒绝；
- 文件数量和路径长度上限；
- `secret`、`cache`、`temp` 等禁止类别拒绝。

同步收集器不再以 `.json` 后缀作为授权条件，而是只读取 manifest 的精确路径。
#### P1.2a 本地无变化抑制

- CoreApp 按同步项记录最近一次成功提交的明文内容哈希。
- 重复的文件监听、重复写入或启动期重新收集若内容哈希未变化，不生成新的 Push op，也不重新上传大对象。
- 哈希只作为本地去重提示；服务端仍以 item 版本、冲突顺序和当前引用为最终权威。


#### P1.2 兼容模式

为避免已有插件和已有云端项目丢失，迁移分两阶段：

- **兼容阶段**：未声明 `storageSync` 的已有插件继续使用旧的顶层 `.json` 规则，但标记为 legacy；新插件或已更新 manifest 的插件使用 allowlist。
- **收敛阶段**：新 SDK/manifest 模板默认生成 `storageSync`；宿主保留 legacy 读取和一次性迁移能力，不再将新发现的未声明 JSON 自动加入同步。
- **最终阶段**：legacy 插件仍可读取历史云端项，但必须通过显式迁移或插件更新继续产生新的同步写入。

兼容阶段不能把旧的 `storage::plugin::<name>::<file>` 直接改成新 ID，否则会造成重复项和数据分叉。

#### P1.3 稳定身份

- 新 manifest 优先使用稳定插件 `id`，不能使用 `displayName`。
- 对已有同步项保留原 item ID，并在 `meta_plain` 增加稳定 `plugin_id`、相对路径和展示元数据。
- 插件名称变化通过 alias/migration mapping 解析，不直接生成一条全新的逻辑项。
- 同一个插件的路径大小写和分隔符使用 canonical form。

### P1：普通存储和敏感数据边界

1. 普通插件存储 SDK 继续提供文件读写，但同步授权由宿主 manifest 决定。
2. Secret SDK 继续单独走 secure-store；Secret 不进入 `storage.snapshot`。
3. 不对任意 JSON 做“看起来像 token 就删除”的启发式处理。
4. 插件开发模板、审核规则和文档必须明确：普通 JSON 中不得保存凭据。
5. 对声明为 `settings` 或 `data` 的文件只同步加密 payload；服务端不解密正文。
6. `qualified_name`、显示名称和路径元数据不得包含 Secret 值、完整 prompt/response、token 或 provider endpoint。

### P1：删除和 tombstone

删除流程：

1. 本地文件删除或插件卸载产生逻辑 delete op；
2. `sync_items_v1.deleted_at` 写入 tombstone；
3. 若旧项存在 `payload_ref`，Blob 不立即删除；
4. 服务端根据设备游标、活跃设备和最小保留期判断 tombstone 是否可清理；
5. tombstone 清理后，只有确认无其他引用的 Blob 才进入 orphan GC。

保留合同：

- 最小 tombstone 保留期：30 天；
- 若仍有活跃设备未确认游标，则继续保留；
- 超过设备会话失效窗口的设备不能无限阻止 GC；
- 清理必须记录计数和稳定错误码，不记录文件内容。

### P1：云端详情展示

服务端 `SyncCatalogItem` 增加或规范化：

- `plugin_id`；
- `plugin_display_name`；
- `file_path`；
- `file_display_name`；
- `kind`；
- `lifecycle_status`；
- `storage_state`（inline/blob）；
- `payload_size`；
- `updated_at`；
- `deleted_at`。

Dashboard：

- 主视图按“插件 / 类型 / 数据项”展示；
- 不把内部 `qualified_name` 当主标题；
- Blob 只显示为“加密附件”，不显示 object key；
- 已删除项默认折叠；
- `staged/orphaned/delete_failed` 只在诊断视图展示；
- 诊断视图显示 Blob 生命周期账单：active/staged/orphaned/delete_failed/deleted 的字节数和对象数；
- 插件分组显示文件数和容量，展开后查看单文件；非插件同步项保持单项展示；
- 不新增解密或下载明文能力。

## 8. 数据迁移

### 8.1 D1 schema

建议新增迁移字段，具体以当前线上 schema 核对后落 SQL：

- `sync_blobs_v1.item_id`：可选，便于追踪 staged 上传归属；
- `sync_blobs_v1.logical_version`：客户端重试幂等键；
- `sync_blobs_v1.status`：统一 staged/committed/orphaned/deleted/delete_failed；
- `sync_blobs_v1.last_referenced_at`：GC 诊断与宽限期；
- `sync_items_v1` 的 `meta_plain`：增加稳定 plugin_id、path、kind、display metadata；
- 必要的 `(user_id, item_id, logical_version)`、`(user_id, status, created_at)` 索引。

迁移必须遵守主进程/服务端现有手写 migration 合同：显式列清单、可重复执行、先验证线上数据分布，再启用删除任务。

### 8.2 旧 Blob 盘点与首轮回收

上线前先执行只读盘点：

- `sync_blobs_v1` 中没有对应 `payload_ref` 的对象数量和字节数；
- 每个用户的 staged、committed、未知 status 数量；
- `sync_items_v1` 当前项、删除项和引用关系；
- R2/外部对象存储实际对象与 D1 元数据差异。

首轮回收要求：

- 先写 dry-run 结果；
- 默认只标记 orphaned，不立即物理删除；
- 经过一个完整宽限期且确认引用扫描没有遗漏后，再启用删除；
- delete_failed 必须可重试，不能通过删除 D1 行掩盖对象残留。

### 8.3 旧同步项兼容

- 原有 `storage::plugin::<pluginName>::<fileName>` 继续可 Pull；
- 新字段缺失时通过 item ID 和旧 `meta_plain.qualified_name` 推导展示信息；
- 已有插件首次声明 allowlist 时，按旧 item ID 进行就地升级，不复制 payload；
- 未被 allowlist 保留的旧文件生成 delete op，但遵守 tombstone 保留合同；
- 不在客户端启动时一次性重写全部插件文件，避免启动放大和大批量冲突。

## 9. 错误与边界矩阵

| 场景 | 必须行为 |
|---|---|
| manifest 路径绝对路径、穿越、符号链接或跨插件 | fail closed，返回稳定 manifest/storage 错误，不上传 |
| 未声明的新 `.json` | 不进入同步；本地读写仍可用 |
| 声明文件不存在 | 不生成空文件；按删除/缺失语义由明确迁移策略处理 |
| 大对象上传成功、Push 失败 | Blob 保持 staged，超过 TTL 后 GC |
| Push 冲突 | 不覆盖服务端当前项；新 Blob 不得成为 committed，后续回收 |
| 同一操作重试 | 返回已有 staged/committed 结果，不无限创建 Blob |
| 当前 Blob 被误删 | Pull 返回稳定同步错误并可重试；不得用空内容覆盖本地 |
| 删除文件/卸载插件 | 写 tombstone；Blob 延迟回收；不立即破坏离线设备恢复能力 |
| GC 删除失败 | 标记 delete_failed，记录稳定错误码，后续重试 |
| quota 对账失败 | 不报告回收成功；保留可重放状态和诊断计数 |
| 普通 JSON 含凭据 | 不做启发式脱敏；文档、SDK、插件审核明确禁止，Secret 必须迁移 secure-store |
| 旧插件无 manifest | 兼容读取旧项；按 rollout 阶段决定是否允许新增 legacy 写入 |

## 10. 实施阶段

### Phase 0：只读盘点与合同冻结

- 固化当前 item、Blob、quota、tombstone 的关系模型；
- 增加服务端 dry-run 查询/脚本，不删除对象；
- 明确 `sync_blobs_v1.status` 当前线上值；
- 冻结 manifest、item ID、Blob 状态机和 tombstone 保留合同。

交付：盘点报告、schema migration 设计、wire/API 兼容表。

### Phase 1：先修 Blob 安全

- staged/committed 状态；
- 上传-Push 补偿；
- 同一逻辑版本幂等；
- 有界 mark-and-sweep GC；
- quota reconciliation；
- 服务端回归和真实 Preview/对象存储验收。

这一阶段不改变插件 allowlist，先阻止对象存储继续无界积累。

### Phase 2：接入 manifest allowlist

- 扩展 `IManifest` 和 manifest validator；
- 同步收集器改为 exact path allowlist；
- 旧插件兼容模式；
- 新模板默认生成 `storageSync`；
- 迁移已有插件的稳定 display metadata。

### Phase 3：云端展示收敛

- Dashboard 使用结构化展示字段；
- 内部 key、Blob ID、object key 移入诊断视图；
- 删除项折叠；
- 添加“插件数据 / 设置 / 加密附件”状态说明。

### Phase 4：关闭 legacy 新写入

满足以下条件后再执行：

- 官方插件全部完成 manifest 声明；
- 兼容 Pull 和 migration 回归通过；
- 旧 Blob 首轮回收完成并有失败重试证据；
- 无数据丢失、重复 item 或同步冲突放大；
- 发布说明明确 legacy 行为变化。

## 11. 验收标准

### 11.1 本地同步范围

1. 一个插件创建 `settings.json`、`draft-key.json`、`cache.json`、非 JSON 文件和子目录文件。
2. manifest 只声明 `settings.json`。
3. Push 后只有声明项进入 `sync_items_v1`；未声明项仍可本地读写但不上传。
4. Secret SDK 写入的数据不出现在普通 snapshot、D1 metadata、Blob 明文或日志。
5. legacy 插件在兼容阶段仍能 Pull 原有项，且不会生成重复 item ID。

### 11.2 Blob 生命周期

1. 小快照继续使用 `payload_enc`，Pull 行为不变。
2. 大快照上传后 Push 成功，Blob 状态为 committed 且被当前 item 引用。
3. 上传成功后模拟 Push 失败、超时、冲突和进程退出，Blob 最终进入 staged/orphaned 并被 GC。
4. 同一逻辑内容重试不会无限增加 Blob 数量。
5. 更新同一大文件 10 次后，当前引用可定位，旧无引用对象在宽限期后删除。
6. 删除同步项后，tombstone 在保留窗口内可供离线设备 Pull；窗口后 Blob 和 tombstone 可收敛清理。
7. 删除失败能留下可重试状态，不能假报成功。

### 11.3 云端展示

1. 主标题显示插件 display name 和用户可理解的文件名。
2. 不显示原始 `plugin::` qualified name、R2 object key 或 Blob ID。
3. 已删除项默认折叠；Blob orphan 状态只出现在诊断视图。
4. 分类统计只计算逻辑同步项，不把内部 Blob 对象重复计为用户文件。

### 11.4 兼容与运行质量

- 现有 `/api/v1/sync/*`、keys/devices 合同继续使用；
- D1 查询预算和批量 Push 上限不被 GC 或展示接口突破；
- GC 使用有界分页，不阻塞正常 Push/Pull；
- CoreApp 本地读取、写入、删除、卸载路径无同步死锁；
- 真实 Preview/对象存储环境完成一次大对象上传、失败重试、回收和 Pull 闭环；
- 隐私清单、普通存储分类和文档同步更新。

## 12. 测试计划

### 单元与协议

- manifest storageSync DTO：精确路径、重复、穿越、符号链接、禁止类别；
- stable plugin ID/path canonicalization；
- small/large payload wire compatibility；
- upload idempotency key；
- staged → committed → orphaned → deleted 状态转移；
- tombstone retention and cursor rules；
- catalog display name fallback for legacy rows。

### 服务端集成

- D1 schema migration chain；
- upload success + push failure；
- push conflict after upload；
- retry after process interruption；
- GC mark/sweep pagination and retry；
- quota repair after orphan cleanup；
- R2/external storage delete failure；
- concurrent devices with one live reference and one delete op。

### CoreApp 集成

- plugin file write emits only allowlisted sync target；
- draft/cache/non-JSON/subdirectory exclusion；
- plugin uninstall tombstone generation；
- legacy item pull and in-place manifest migration；
- renderer/SDK storage behavior remains unchanged for local reads/writes。

### 真实运行验收

- 隔离 CoreApp profile；
- 真实 Nexus Preview/受控对象存储；
- 至少一个官方插件和一个带大配置的 fixture plugin；
- 断网、恢复、重复 Push、设备离线、插件卸载后重新安装；
- 验证 D1、Blob metadata、对象存储、Dashboard 四处状态最终一致。

## 13. 观测与运营

只记录必要的 metadata，不记录文件名中的 Secret、payload、prompt/response 或解密内容。

建议指标：

- `sync_blob_upload_staged_total`；
- `sync_blob_commit_total`；
- `sync_blob_gc_marked_total`；
- `sync_blob_gc_deleted_total`；
- `sync_blob_gc_failed_total`；
- staged Blob 存活时长分布；
- orphan Blob 字节数；
- legacy plugin sync item 数量；
- allowlist 拒绝原因计数；
- sync item conflict / retry / missing blob 稳定错误码。

指标只用于容量与失败路径治理，不能替代真实 D1/R2 对账。

## 14. 风险与取舍

| 取舍 | 选择 | 原因 |
|---|---|---|
| Blob key | 第一版按同步项逻辑版本幂等，不做跨项内容去重 | 降低引用计数和权限边界复杂度，先解决孤儿增长 |
| allowlist | 精确路径，不支持 glob | 防止新增文件意外进入同步 |
| 旧插件 | 先兼容、后关闭 legacy 新写入 | 避免一次性迁移造成数据丢失 |
| 删除 | tombstone + 设备游标 + 最小保留期 | 离线设备需要恢复窗口 |
| Secret 检测 | 不做 JSON 启发式脱敏 | 启发式会误删用户数据，且无法提供安全保证 |
| GC | 有界后台 mark-and-sweep | 不阻塞 Push/Pull，允许失败重试 |

## 15. 完成定义

本 PRD 只有在以下条件全部满足后才算完成：

- Blob 上传失败、Push 失败、冲突、删除、重试和 GC 都有稳定状态与回归；
- 新插件同步范围由 manifest 明确授权；
- 旧同步项可以无损 Pull 和迁移；
- 云端详情不再把内部 key 和随机 object key 当用户文件展示；
- 逻辑 quota 与对象存储实际引用经过对账；
- 官方插件回归、服务端测试、真实 Preview/对象存储闭环和隐私清单检查全部通过；
- 实施后的行为、接口、迁移和验收证据同步到对应工程文档与 `docs/plan-prd/01-project/CHANGES.md`。
