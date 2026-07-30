# #301 导出、备份恢复与远程处理控制研究

## 结论摘要

仓库已有可复用的局部能力，但没有统一的数据生命周期导出/恢复服务：

- 已有 JSON 导出、文件选择、导入确认、回滚快照、分析数据导出、AI 审计导出等 UI/交互模式。
- `secure-store.ts` 已具备 AES-256-GCM、随机 nonce、HKDF 派生、串行变更、临时文件 + `fsync` + `rename` 的原子文件替换，可复用其信封、锁和原子写入思路。
- Node 24 内置异步 `crypto.scrypt()`，无需新增依赖即可实现用户密码派生。当前机器上 OWASP 最低 scrypt 参数 `N=2^17,r=8,p=1`、`maxmem=256 MiB`、32-byte 输出约 428 ms；`N=2^15` 约 64 ms。
- 当前不存在直接 Argon2 依赖；`node-forge` 只通过根 `pnpm.overrides`/传递依赖出现，不应作为新密码信封实现基础。`compressing` 是 CoreApp 直接依赖，可用于普通多文件归档，但 Secret MVP 不需要归档库。
- 现有单 Provider 配置导出会剔除 `apiKey`，这是正确模式；但完整 `IntelligenceConfig` 当前仍把 `apiKey` 放在 renderer 普通对象中并自动持久化，同时该配置位于云同步白名单。这与 #301 “API key 不进入普通 JSON/同步 payload”直接冲突，必须在全量导出/恢复之前先迁移 Provider Secret 或在所有普通快照边界统一剔除。
- 当前遥测有明确开关和上传目标说明，但新配置默认 `enabled: true`，属于 opt-out。远程 AI Provider 默认多数关闭，但 Nexus Provider 可被自动创建并强制启用，Provider 开关没有远程处理确认，也没有绑定 endpoint 的 consent 记录。

推荐 MVP 是“逻辑数据导出 + 独立 Secret 加密信封 + 分类别恢复”，而不是复制原始 user-data 目录或运行中的 SQLite 文件。Secret 恢复必须先完整认证、再完整校验、最后通过 secure-store 单次批量原子写入；普通数据按类别事务化恢复并返回稳定的逐类别结果。

## 规范约束

- `.trellis/spec/frontend/quality-guidelines.md:16` 禁止 plaintext provider secrets/API keys/tokens/prompts/responses 进入普通 JSON、日志、分析或同步 payload；`:29` 要求 typed transport。
- `.trellis/spec/frontend/type-safety.md:568` 起禁止 raw channel 和在可被记录/同步的普通 UI 对象中保存 Provider Secret。
- `.trellis/spec/frontend/state-management.md:54` 起规定业务数据以 host/SQLite 为 SoT，Plugin Secret 必须走 secure-store facade。
- `.trellis/spec/frontend/index.md:64` 起规定共享 transport/payload 类型归属现有 package，JSON 不能替代 SQLite 业务 SoT。
- `.trellis/spec/guides/cross-layer-thinking-guide.md:17` 起要求先定义 source -> transform -> store -> retrieve -> display 的格式、校验责任和错误合同。

因此新生命周期能力不应继续复制 `defineRawEvent('dialog:*')`，也不应把密码、解密后的 Secret 或完整备份对象放进 renderer 全局 store。

## 现有导出与导入能力

### 可复用实现

1. 分析数据导出

   - `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue:162` 请求 `AppEvents.analytics.export`，再下载 JSON。
   - `apps/core-app/src/main/modules/analytics/analytics-module.ts:219` 在 main 侧按时间窗和维度生成导出结果。
   - 适合复用“main 生成逻辑数据、renderer 只触发下载”的责任边界，不适合复用 renderer `Blob` 处理敏感/大型备份。

2. AI 审计导出

   - `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceAuditLogs.vue:185` 已支持 CSV/JSON 导出，字段包括 Provider、Model、token、延迟和错误。
   - `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:484` 返回的审计记录只有 prompt hash、Provider/Model/usage/metadata，不保存 raw prompt 字段。
   - 可作为“远程处理历史可见性”的数据源；导出前仍需对 `error`/`metadata` 做 lifecycle 专用 allowlist。

3. Provider 配置导出

   - `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue:107` 显式析构剔除 `apiKey`，并使用版本化 schema `tuff.intelligence.provider.config.v1`。
   - `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue:170` 生成 JSON 文件。
   - 这是普通导出必须遵循的基线：配置描述和 Secret 分离。

4. Preset 导入/导出

   - `apps/core-app/src/renderer/src/modules/layout/preset/usePresetExport.ts:164` 使用保存对话框并写版本化 JSON。
   - `apps/core-app/src/renderer/src/modules/layout/preset/usePresetExport.ts:239` 打开文件、解析 `unknown`、调用 `validatePresetData()` 后再进入确认。
   - `apps/core-app/src/renderer/src/modules/layout/preset/usePresetExport.ts:315` 有明确导入确认。
   - `apps/core-app/src/renderer/src/modules/layout/preset/usePresetExport.ts:110` 和 `:360` 有内存回滚快照。
   - 可复用“选择 -> 读取 -> 解析 -> 校验 -> 预览/确认 -> 应用 -> 回滚”的交互顺序，但生命周期恢复应移到 main service，不应在 renderer 直接应用多类别状态。

5. Prompt 导入/导出

   - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePromptsPage.vue:430` 读取 JSON 并下载导出。
   - `apps/core-app/src/renderer/src/modules/hooks/usePromptManager.ts:125` 以新 ID 合并自定义 Prompt。
   - 可复用 merge 语义，但当前解析/校验较轻，不应直接作为全量恢复的 schema validator。

### 文件对话框现状

- `apps/core-app/src/main/channel/common.ts:235` 定义了 `dialog:open-file`、`dialog:save-file`、`fs:write-file`、`fs:read-file` raw events。
- `apps/core-app/src/main/channel/common.ts:933` 和 `:1695` 使用 Electron `showOpenDialog/showSaveDialog`，并限制后续读写到用户选中的路径。
- `apps/core-app/src/main/channel/common.ts:745` 的路径授权最多保留 200 个、有效 10 分钟。
- `apps/core-app/src/renderer/src/modules/layout/preset/usePresetExport.ts:24` 以及多个设置页重复定义同一 raw event，已形成 contract duplication。
- `fs:write-file` 只接受 UTF-8 string，且直接 `writeFile`，没有临时文件、`fsync`、原子 rename、大小限制或二进制支持，不适合 Secret 备份和大型备份。

建议复用 Electron dialog 行为，但新增共享 typed lifecycle transport/domain SDK；实际读取、KDF、加解密、schema 校验和原子写入都由 main service 完成。renderer 只持有选择项、立即使用的密码输入和安全结果码。

## 存储面与备份数据源

### 应用配置

- `packages/utils/common/storage/constants.ts:1` 定义现有配置键。
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts:117` 给主要配置提供类型、默认值和 normalizer。
- `apps/core-app/src/main/db/schema.ts:1206` 的 `app_config_entries` 是当前 SQLite 配置 SoT，并带 revision/deleted/updatedAt。
- `apps/core-app/src/main/modules/storage/app-config-repository.ts:385` 已有按 key 排序加载全部配置记录的内部实现。
- `apps/core-app/src/main/modules/storage/app-config-repository.ts:527` 单项写入通过共享 writer + SQLite upsert，revision 防止旧值覆盖新值。
- `apps/core-app/src/main/modules/storage/app-config-repository.ts:586` legacy mirror 使用 temp + rename，但没有 `fsync`。
- `packages/utils/transport/events/types/storage.ts:53` 的 `StorageSaveRequest.persist` 和 `:94` 的 `StorageSaveResult` 可复用“只有持久化成功才确认生命周期操作”的语义。

普通导出应从 registry/明确 allowlist 读取，不应扫描整个 config 表。至少排除：账号 session、telemetry client ID、上报队列、运行时 cursor/queue 状态、路径和任何 Secret 引用对应的明文值。

### Plugin 数据

- `apps/core-app/src/main/modules/plugin/plugin.ts:1283` 将 plugin data 分为 `config`、runtime logs、data logs、temp。
- `apps/core-app/src/main/modules/plugin/plugin.ts:3609` 普通 Plugin config 是最大 10 MiB 的 JSON 文件集合，可列举和读取。
- `apps/core-app/src/main/modules/sync/index.ts:632` 云同步也只收集 `listPluginFiles()` 返回的 config JSON。
- Plugin SQLite、logs、temp 不在该普通 JSON 路径内，应分别分类；默认导出只含 config，SQLite 需显式选择，logs/temp 不导出。
- `apps/core-app/src/main/modules/plugin/plugin-module.ts:1310` 卸载已等待 runtime/SQLite 关闭、Secret purge、code/data 目录和 DB plugin_data 删除，但删除失败只部分阻塞，尚未给用户稳定的逐类别结果。

### 数据库与缓存

- `apps/core-app/src/main/utils/storage-usage.ts:135` 已维护业务表到 `file-index/search-index/clipboard/ocr/usage/plugin/intelligence/analytics/telemetry` 的类别目录，可作为生命周期 category inventory 的种子。
- `apps/core-app/src/main/service/storage-maintenance.ts:99` 起已有 clipboard、OCR、usage、analytics、downloads、intelligence 等清理函数。
- `apps/core-app/src/renderer/src/views/storage/Storagable.vue:77`、`:189`、`:324` 已有 `{ success, removedCount, removedBytes, error }`、危险操作确认和分类清理 UI。
- `apps/core-app/src/main/modules/database/index.ts:970` 和 `:1051` 表明运行时至少存在 primary `database.db` 和默认开启的 `database-aux.db`；search split 开启时还有 `search-index.db`。
- `apps/core-app/src/main/db/runtime-flags.ts:16` 表明 search DB 可重建且目前默认关闭 split。
- `apps/core-app/src/main/modules/database/index.ts:1399` 只有 destroy 时才做最终 WAL checkpoint 并关闭所有连接。

因此运行中直接复制/替换 SQLite 文件不是可靠恢复方案。搜索索引、OCR cache、recommendation cache、analytics queue 等可重建/短期数据默认不进入普通备份；用户数据通过逻辑行/schema 导出。

## Secret 与加密原语

### 现有 secure store

- `apps/core-app/src/main/utils/secure-store.ts:26` 定义 v1 `A256GCM` 信封。
- `apps/core-app/src/main/utils/secure-store.ts:67` 使用 32-byte key、12-byte nonce、16-byte tag。
- `apps/core-app/src/main/utils/secure-store.ts:302` 使用 HKDF-SHA256 从本机 root secret + key + purpose 派生每项 key，再 AES-256-GCM 加密。
- `apps/core-app/src/main/utils/secure-store.ts:364` 校验 key ID、nonce/tag 长度，并以 `decipher.final()` 完成认证。
- `apps/core-app/src/main/utils/secure-store.ts:43` 对同一 root 的变更串行化。
- `apps/core-app/src/main/utils/secure-store.ts:163` 使用 mode `0600` 的随机 temp 文件、文件 `fsync`、rename、目录 `fsync` 完成原子替换。
- `apps/core-app/src/main/utils/secure-store.ts:502` 当前只提供单 key set/delete 和 prefix delete，没有“枚举可导出 Secret”或“批量原子 restore”API。

现有 secure-store 信封不能直接作为用户密码备份：它依赖本机随机 `local-secret.v1.key`，换机后不可解密；同时信封不记录 `purpose`，恢复端不能仅凭 key 自动选择 `default`、`plugin-secret`、`ai-import-secret`、`auth-token`、`machine-seed`、`sync-payload-key`。

### Secret 类别与 purpose

- Auth：`apps/core-app/src/main/modules/auth/index.ts:47` 和 `:282` 使用 `auth-token` 和 `machine-seed` purpose。
- Sync：`apps/core-app/src/main/modules/sync/sync-payload-crypto.ts:10` 和 `:267` 使用 `sync-payload-key` purpose。
- Plugin：`apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:110` 和 `:353` 以 `plugin.<name>.<key>` + `plugin-secret` 保存。
- Plugin business secrets：`apps/core-app/src/main/modules/plugin/plugin-module.ts:1735` 和 `:1785` 也使用 `plugin-secret`，卸载按两个 prefix 清理。
- AI imported MCP：`apps/core-app/src/main/modules/ai/ai-import-runtime.ts:305` 和 `intelligence-mcp-registry.ts:379` 使用 `ai-import-secret` 或显式 authRef。
- Proxy auth：`apps/core-app/src/main/modules/network/network-service.ts:342` 使用默认 purpose，通过配置中的 `authRef` 解析。

推荐只允许用户创建/输入的 Secret 进入加密备份：Provider API key、Plugin Secret、MCP authRef、proxy credential。默认永久排除 auth session token、machine seed、telemetry client ID 和设备身份；sync payload key 是否允许恢复应作为单独“云同步恢复密钥”产品决策，不应混入普通 Secret 导出。

需要一个 main-owned、typed Secret descriptor registry，记录 `id/category/key/purpose/exportable/owner`。不要靠正则猜 purpose，也不要向 renderer 返回 Secret inventory 的值。

### 同步加密与当前缺口

- `apps/core-app/src/main/modules/sync/sync-payload-crypto.ts:130` 使用本机 secure-store 中的随机 256-bit key 和 AES-GCM 加密同步 payload。
- `apps/core-app/src/main/modules/sync/sync-payload-crypto.ts:191` 对 tag/nonce 失败返回稳定 `SyncPayloadCryptoError.code`。
- `apps/core-app/src/main/modules/sync/index.ts:70` 同步白名单包含 `StorageList.IntelligenceConfig`。
- `packages/utils/renderer/storage/intelligence-storage.ts:62`、`:77`、`:95` 表明完整 Provider 对象被 autosave 到 `IntelligenceConfig`。
- `packages/utils/types/intelligence.ts:346` 的 Provider 普通类型直接包含 `apiKey?: string`。
- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceApiConfig.vue:29` 和 `:138` 表明 API key 进入 renderer reactive Provider 对象并被送入 test payload。
- `packages/utils/renderer/storage/base-storage.ts:586` 和 `:716` 表明 autosave 会把完整 reactive data 转成普通值并发送到 app storage。

虽然 sync wire 上是 AES-GCM 密文，API key 仍属于 ordinary sync business payload，且还先进入普通 SQLite config。#301 要求下不能把“wire 已加密”等同于 Secret 独立备份。实施前应将 Provider 配置改为 `credentialRef/hasCredential`，Secret 仅在 main 调用 Provider 前注入；普通 export/sync 统一使用同一个 secret-free projection。

## 密码加密 Secret 信封可行性

### 无新增依赖方案

CoreApp 要求 Node `>=24.15.0`（`apps/core-app/package.json:89` 起），可直接使用：

- `crypto.scrypt()`：异步、可配置 `N/r/p/maxmem`，避免阻塞 main event loop。
- `randomBytes()`：生成 16-byte salt、12-byte GCM nonce。
- `createCipheriv('aes-256-gcm')` / `createDecipheriv()`：认证加密。
- `Buffer.fill(0)`：对派生 key 和解密 payload 做 best-effort 清零；JS password string 无法可靠清零，因此 renderer 必须只保留在本次 modal 的局部 ref，发送后立即清空。

本机 Node `v24.18.0` 合成基准：

| KDF | 参数 | maxmem | 32-byte 派生耗时 |
| --- | --- | ---: | ---: |
| scrypt | `N=32768,r=8,p=1` | 256 MiB | 64 ms |
| scrypt | `N=131072,r=8,p=1` | 256 MiB | 428 ms |

OWASP Password Storage Cheat Sheet 在 Argon2id 不可用时建议至少 scrypt `N=2^17,r=8,p=1`。Node 24 文档说明 salt 应随机且至少 16 bytes，且近似内存约束为 `128 * N * r <= maxmem`；该参数约需 128 MiB，所以显式 `maxmem=256 MiB`。

外部依据：

- Node.js Crypto v24：<https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback>
- Node.js GCM auth tag：<https://nodejs.org/docs/latest-v24.x/api/crypto.html#ciphergetauthtag>
- OWASP Password Storage Cheat Sheet：<https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>

### 推荐信封

```json
{
  "schema": "tuff.secret-backup",
  "version": 1,
  "createdAt": "ISO-8601",
  "kdf": {
    "name": "scrypt",
    "N": 131072,
    "r": 8,
    "p": 1,
    "dkLen": 32,
    "maxmem": 268435456,
    "salt": "base64"
  },
  "cipher": {
    "name": "aes-256-gcm",
    "nonce": "base64",
    "tag": "base64"
  },
  "ciphertext": "base64"
}
```

实现约束：

- 固定字段顺序生成 canonical header，并把 `schema/version/kdf/cipher.name/createdAt` 作为 AAD；salt/nonce 可在 header 中但必须被 AAD 覆盖。
- 读取时先限制文件字节数、JSON 深度/字段和 base64 decoded 长度，再检查 KDF allowlist 与上限，最后才运行 scrypt，防止恶意信封通过超大 `N/r/p/maxmem` 造成本地 DoS。
- wrong password、tag tamper、ciphertext tamper 对 UI 统一返回 `LIFECYCLE_SECRET_AUTH_FAILED`，不泄露 oracle 细节。
- 不允许 legacy plaintext fallback，不允许未知 KDF/cipher 自动降级。
- Secret plaintext payload 自身仍要有独立 `schema/version/categories[]` 和逐项 runtime validation。
- Secret payload 不压缩，避免增加 archive parser/解压上限/zip-slip 面；当前数据量无需 `compressing`。

## 威胁模型

| 威胁 | 资产/入口 | 必须控制 |
| --- | --- | --- |
| 备份文件被盗 | 用户下载目录、云盘、附件 | 用户密码 scrypt + AES-GCM；普通 export 永不含 Secret；敏感文件默认 `0600`（平台允许时） |
| 弱密码离线爆破 | Secret envelope | `N=2^17,r=8,p=1` 基线、随机 16-byte salt；UI 提示但不记录 password strength 文本 |
| 信封篡改/降级 | `version/kdf/cipher/ciphertext` | header AAD、固定 allowlist、未知版本拒绝、wrong-password 与 tamper 同码 |
| 恶意 KDF 参数 DoS | 导入文件 | 运行 KDF 前 clamp `N/r/p/maxmem/dkLen`，限制 envelope/ciphertext/category/item/value 大小和数量 |
| 路径替换/符号链接 TOCTOU | Electron 选择后的 restore 文件 | main 立即以受控 handle 打开、`lstat/fstat` 校验 regular file、限制大小；不要让 renderer 再按 path 读取 |
| renderer/XSS 获取 Secret | password、解密值、Provider key | crypto/main-only；renderer 只发送一次 password 并立即清 local ref；不进入 store/devtools/log/toast/error |
| Plugin 越权导出其他 Secret | Plugin transport | lifecycle events 只允许 trusted CoreApp renderer + sender-bound context；不暴露到 plugin SDK |
| 部分认证后写入 | 多个 Secret | 完整 AEAD `final()` + 完整 schema validation 后才开始任何 write |
| restore 中途崩溃 | secure-store、配置、SQLite | secure-store 单次 batch temp+fsync+rename；配置/DB 按类别 transaction；返回逐类别状态；原始 DB 替换只在 restart gate |
| 并发 Secret 更新丢失 | restore 与运行时 set/delete | 复用 `runSecureStoreMutation` 同 root 队列，在锁内 read-strict -> clone -> apply-all -> write-once |
| Secret 进入日志/遥测 | catch、结果、进度 metadata | public stable code；local raw error 也不得带 password/plaintext/ciphertext；transport 不回传路径或解密项 |
| 远程 AI 未知外发 | prompt、selection、clipboard、OCR image | endpoint-bound consent、local/remote 分类、调用前 main policy gate、目标变化后 consent 失效 |
| 自动启用远程 Provider | Nexus sync/fallback | 禁止 Provider sync 绕过 consent；远程 enabled 与 consent 分离，缺 consent 时 fail-closed |

## 原子恢复约束

### Secret 恢复必须是单次原子提交

推荐阶段：

1. `select/read`：main 打开用户选择文件，限制大小并读入 Buffer。
2. `parse-header`：只解析 bounded envelope；检查 schema/version/KDF/cipher 参数。
3. `authenticate`：异步 scrypt，设置 AAD，完整执行 `decipher.final()`；此阶段无任何持久化 side effect。
4. `validate-payload`：将 plaintext 当作 `unknown`，完整校验 category、descriptor id、key、purpose、owner、value 类型/大小/数量；确认当前 secure-store 可用。
5. `prepare`：读取当前 secure-store strict snapshot，解析所有导入冲突并生成 preview。用户选择 `skip/replace` 后重新检查 store generation/fingerprint。
6. `commit`：在现有 secure-store mutation queue 中对 clone 应用全部导入值，按本机 root secret 重新加密，并只调用一次原子 `writeSecureStoreFile()`。
7. `finish`：best-effort 清零 password buffer、derived key、plaintext buffer；返回不含 key/value/path 的稳定结果。

现有 `setSecureStoreValue()` 每项都会单独写完整文件，循环调用会产生“前几项成功、后项失败”的部分 restore。因此必须新增内部 batch mutation，不能用现有单项 public API 循环模拟原子性。

### 普通数据无法跨所有介质形成一个 ACID 事务

当前业务数据横跨 primary DB、aux DB、可选 search DB、plugin JSON/SQLite 和文件目录。跨这些介质不能用一个 SQLite transaction 保证全局原子性。

最小可靠合同：

- AEAD 认证和整个备份 schema 校验必须在任何类别写入前全部完成。
- 每个类别单独原子：SQLite 类别一个 transaction/batch；配置类别一个 revision-aware batch；plugin JSON 先写 staging dir 再 rename；Secret 单次 secure-store batch。
- 应用顺序先可回滚普通类别，Secret 最后提交；任一类别失败，后续类别标记 `skipped_dependency`，并尝试回滚已提交类别。
- 如果 rollback 失败，顶层状态为 `partial`，逐类别明确 `rollback_failed`，绝不显示“恢复成功”。
- 原始 SQLite 整库恢复只允许“stage -> 请求重启 -> modules 未打开前替换 -> quick_check -> 启动迁移”；运行中不得替换 DB/WAL/SHM。
- 搜索索引、cache、telemetry queue、download chunks 等可重建数据不做原始恢复，恢复后重建。

## 远程 AI 与遥测现状

### AI Provider

- `packages/utils/types/intelligence.ts:2829` 起的远程默认 Provider 多数 `enabled: false`，Local Provider 指向 localhost。
- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue:205` 和 `:324` 显示 Provider 名称/type、Nexus cloud badge 和直接 enable switch。
- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue:78` 的 switch 直接 `updateProvider({ enabled })`，没有 disclosure/consent gate。
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceChannelsPage.vue:66`、`:119`、`:136` 表明 Nexus fallback 可创建为 `enabled: true`，且 sync/ensure 会强制保持 enabled。
- `apps/core-app/src/main/modules/ai/provider-runtime.ts:14` 表明 Nexus auth token 只在 main runtime 注入，这是正确的 Secret 边界。
- `apps/core-app/src/main/modules/ai/providers/langchain-openai-compatible-provider.ts:603` 和 `anthropic-provider.ts:153` 最终按 Provider base URL 把内容发给远程 SDK。
- 当前没有 `remoteProcessingConsent`、disclosure version、endpoint fingerprint 或 local-only 全局 policy。

不能仅靠 Provider `type === 'local'` 判断本地处理：custom/local 的 `baseUrl` 可变化。main policy 应基于解析后的目标 origin 判断 loopback/local IPC 与 remote，并把 Provider ID + normalized origin + disclosure version 绑定到 consent。endpoint 变化后旧 consent 自动失效。

### Telemetry

- `apps/core-app/src/renderer/src/views/base/settings/SettingSentry.vue:31` 和 `:97` 已有 enabled/anonymous 控制。
- `apps/core-app/src/renderer/src/views/base/settings/SettingSentry.vue:175` 明确说明上传性能与错误指标；`:311` 提供远程隐私管理/分析面板入口。
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts:178` 和 `sentry-service.ts:220` 默认 `enabled: true, anonymous: false`。
- `apps/core-app/src/main/modules/sentry/telemetry-sanitizer.ts:126` 和 `:399` 有 sensitive-key drop、移除 request/breadcrumb/extra/path/stack context 的上传前 sanitizer。
- `apps/core-app/src/main/modules/sentry/sentry-service.ts:940` 起 search analytics 内部曾构造 sample query，但 `beforeSend` sanitizer 最终只保留 environment/operational contexts；依赖该间接删除仍不如源头不构造 raw query 稳健。

Telemetry consent 应和 AI remote consent 分开。新安装建议默认关闭，用户明确打开后记录 disclosure version；升级用户保留现有开关值，但在隐私页展示当前上传目标、数据类别、最近上传和“清空本地 queue/stats”。关闭后应停止新采集/上传并清空待上传 buffer/queue，是否删除历史本地统计由单独 clear action 控制。

## 推荐最小产品形态

在现有 Settings / Storage 信息架构中增加一个统一“数据与隐私”页面，沿用 `TuffGroupBlock`、`TuffBlockSwitch`、`TuffBlockSlot`、`TxBottomDialog` 和 `vue-sonner`，不新增 renderer 全局 Secret store。

### 1. 数据导出

- “导出我的数据”选择类别并显示 estimated records/bytes。
- 默认包含：用户设置、快捷键、主题/布局、自定义 Prompt、用户创建的 AI 配置（Secret-free）、Plugin config、用户选择的 clipboard records。
- 默认排除：auth/session/device ID、Secret、logs、telemetry queue、analytics queue、OCR/cache/search index/recommendation/download chunks。
- 输出版本化逻辑格式 `tuff.user-data-export.v1`；每个 category 有 schema version、count、checksum。
- 大数据由 main 直接写用户选择路径，使用 temp + fsync + rename；renderer 不接收整个 payload。

### 2. Secret 加密备份

- 独立按钮“导出加密凭据”，必须输入并确认用户密码。
- 只允许导出用户输入的 Provider/API key、Plugin Secret、MCP/proxy credentials；逐类别明确选择。
- 永远不导出登录 session token、machine seed、telemetry/device ID；sync payload key 单独延期决策。
- 输出 `tuff.secret-backup.v1`，不与普通 JSON 合并为 plaintext，也不进入 cloud sync。
- 密码只存在当前 modal local ref 和一次 typed request；操作完成立即清空。

### 3. 恢复

- 选择普通 export 或 Secret envelope 后先做无 side effect preview：版本、来源 app version、类别、条数、冲突、需要重启的项目。
- 普通类别提供 `skip/merge/replace`；Secret 只提供 `skip existing/replace selected`，默认 skip existing。
- 恢复前二次确认；逐类别进度来自 main typed result，不显示 Secret key/value 或绝对路径。
- 整库/不可在线恢复类别显示 `requires_restart`，不要静默热替换。

### 4. 远程处理

- 全局“仅本地处理”开关：开启时 main policy 拒绝所有非 loopback AI/MCP 目标，不能被 Provider sync 绕过。
- 每个 Provider 显示 `本地` 或 `远程`、目标 origin、会发送的数据类型；首次启用远程 Provider 必须确认。
- consent 绑定 `providerId + normalized origin + disclosureVersion`；endpoint、owner 或 disclosure 变化后重新确认。
- Nexus fallback/sync 可以创建配置，但在 consent 前只能是 `configured/blocked`，不得自动获得远程执行权限。
- 调用结果/审计页继续展示实际 Provider、Model、target class、timestamp 和 usage；不保存 raw request/response。

### 5. Telemetry

- 保留现有启用/匿名开关和目标信息。
- 新安装默认关闭并要求显式 opt-in；升级保留当前值并记录 migration source。
- 增加“清空本地待上传数据/统计”操作，复用 Storage cleanup confirmation/result pattern。
- 远程官网 privacy link 是补充入口，不能替代本地关闭、查看和清理能力。

## 稳定结果与错误合同

现有可复用惯例：

- `StorageSaveResult { success, version, conflict? }`：`packages/utils/transport/events/types/storage.ts:94`。
- `StorageCleanupResult { success, removedCount?, removedBytes?, error? }`：`apps/core-app/src/main/service/types/storage-maintenance.ts:1`。
- Plugin Storage 用固定 code union：`packages/utils/transport/events/types/plugin.ts:641`。
- Sync crypto 用 `SyncPayloadCryptoError(code)`：`apps/core-app/src/main/modules/sync/sync-payload-crypto.ts:21`。
- Operational error spec 要求 transport/UI 只见 safe public result，不见 raw error/path/SQL/content：`.trellis/spec/frontend/quality-guidelines.md:879` 起。

建议 lifecycle domain 统一返回：

```ts
type LifecycleOperationStatus = 'completed' | 'partial' | 'failed' | 'cancelled'
type LifecycleCategoryStatus =
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'rolled_back'
  | 'rollback_failed'
  | 'requires_restart'

interface LifecycleCategoryResult {
  category: LifecycleCategory
  status: LifecycleCategoryStatus
  code: LifecycleResultCode
  itemCount?: number
  byteCount?: number
  retryable?: boolean
}

interface LifecycleOperationResult {
  operationId: string
  operation: 'export' | 'restore' | 'clear' | 'secret-export' | 'secret-restore'
  status: LifecycleOperationStatus
  schemaVersion: number
  categories: LifecycleCategoryResult[]
}
```

最小固定错误码：

- `LIFECYCLE_CANCELLED`
- `LIFECYCLE_INVALID_FORMAT`
- `LIFECYCLE_UNSUPPORTED_VERSION`
- `LIFECYCLE_SIZE_LIMIT_EXCEEDED`
- `LIFECYCLE_KDF_PARAMS_REJECTED`
- `LIFECYCLE_SECRET_AUTH_FAILED`
- `LIFECYCLE_SECRET_STORE_UNAVAILABLE`
- `LIFECYCLE_CATEGORY_VALIDATION_FAILED`
- `LIFECYCLE_CONFLICT`
- `LIFECYCLE_IO_FAILED`
- `LIFECYCLE_ROLLBACK_FAILED`
- `LIFECYCLE_RESTART_REQUIRED`
- `REMOTE_PROCESSING_CONSENT_REQUIRED`
- `REMOTE_PROCESSING_TARGET_CHANGED`
- `REMOTE_PROCESSING_LOCAL_ONLY`

UI 根据 code 做 i18n 映射。不要把 `error.message`、password、Secret key/value、ciphertext、绝对路径或 Provider request/response 放入 public result、toast、analytics 或 Task metadata。

## 推荐实现边界与复用清单

1. Shared contract（`packages/utils` 现有 transport/types 归属）：category、schema、preview、result/error code、typed events。
2. Main lifecycle service：export projection、bounded file I/O、scrypt/AES-GCM、Secret descriptor registry、restore planner、category adapters。
3. Secure-store extension：复用现有 queue/envelope/atomic writer，新增 strict list metadata 和 batch mutation；不要向 renderer 暴露明文。
4. Storage adapter：复用 `mainStorageRegistry` normalizer、revision/persist 语义；新增 allowlisted batch read/write。
5. Plugin adapter：复用 `listPluginFiles/getPluginFile`、Plugin SQLite owner close barrier、卸载 Secret prefix。
6. DB adapter：复用 Drizzle transaction、`dbWriteScheduler`、WAL lifecycle；逻辑类别恢复，不做运行时 DB 文件替换。
7. Renderer：复用 Settings group/block、Storage cleanup confirm、Preset import preview/confirm 交互；替换 raw event duplication 为 lifecycle SDK。
8. Remote policy：main invocation 前统一判断 target origin + consent；Provider UI 只编辑 intent，不能自行授予 authority。

## 必须覆盖的合成测试

- Secret envelope 同一 plaintext 两次导出得到不同 salt/nonce/ciphertext。
- wrong password、tag/ciphertext/header tamper 均失败且无任何 secure-store 写入。
- 超大文件、非法 base64、未知 version/KDF/cipher、超界 `N/r/p/maxmem` 在 KDF 前拒绝。
- secure-store 第 N 项验证失败时零写入；commit 写盘失败时原 store 完整保留。
- restore 与并发 set/delete 串行，不丢更新；冲突 preview 后 generation 改变则返回 stable conflict。
- ordinary export/sync/provider config 的所有序列化结果都不含合成 API key/Plugin Secret/MCP token。
- Provider API key 迁移后普通 `IntelligenceConfig` 只含 credential ref/availability，不含明文。
- Remote Provider 无 consent、endpoint 变化、local-only 开启时 Provider 方法完全不被调用。
- Nexus sync/fallback 不能自动越过 consent；loopback local Provider 保持可用。
- telemetry 关闭后不再新增/上传，queue clear 返回稳定计数；sanitized payload 不含 query/path/prompt/response。
- 多类别 restore 一类失败时，后续状态和 rollback 状态准确，顶层不得误报 completed。
- restart-stage 恢复只在数据库模块打开前替换，执行 `quick_check`，失败保留旧文件并返回稳定码。

## 规划时需要明确记录的产品决定

推荐以以下值作为 MVP 设计基线，若产品决定不同应在 `prd.md/design.md` 显式覆盖：

- 普通 export 默认不含 transient/cache/log/telemetry queue；clipboard 和 Plugin data 由用户显式选择。
- Secret export 默认只含用户输入凭据，基础设施/会话/设备密钥永不导出。
- Secret 冲突默认 `skip existing`，替换必须逐类别确认。
- 新安装 remote AI 和 telemetry 都需显式 opt-in；升级保留配置但在首次远程 AI 调用前完成 versioned disclosure。
- 远程 consent 以 main 解析后的 origin 为准，而不是 renderer Provider type。
- MVP 不承诺跨 primary/aux/plugin/file 的全局 ACID；承诺“认证前零写入、每类别原子、可回滚、逐类别真实结果”。
