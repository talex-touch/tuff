# 统一 OTA Provider 与安全门禁

## Goal

为 CoreApp OTA 建立唯一的 release discovery 与资产安全入口：Nexus 为主、GitHub 仅在明确瞬态故障时回退；两来源在进入下载层前归一化为同一候选契约；manifest、SHA-256 与包内固定公钥 detached signature 默认且始终 fail closed。
## Requirements

### R1 — 单一 Provider 协调器

- Nexus 和 GitHub adapter 必须返回统一、可判别的 outcome：candidate、authoritative none、policy block、transient failure。
- Nexus 的有效 none/policy 结果不得触发 GitHub；只有网络不可达、超时、429 或 5xx 可回退。
- 两来源缓存必须按 source/channel 隔离；GitHub 失败后才可使用仍满足完整契约的 stale verified cache。

### R2 — 唯一候选与 manifest 契约

- provider 外部 payload 必须在 adapter 边界归一化；后续 UpdateSystem/renderer 不再自行解析来源字段或按文件名猜测缺失资产元数据。
- candidate 必须绑定官方仓库、release identity/channel、已验证 manifest 和当前 `platform/arch` 唯一 CoreApp 资产。
- manifest 缺失、identity 错配、pair 重复或当前 pair 缺失一律不可下载/安装。

### R3 — 强制完整性与固定信任根

- 下载完成后使用流式 SHA-256，禁止把完整安装包读入内存。
- signature URL、包内固定公钥、signature payload 任一缺失或验签失败，一律不能进入可安装状态。
- 删除网络公钥 fallback、`signatureKeyUrl` 与 `TUFF_UPDATE_REQUIRE_SIGNATURE` 条件门禁；不保留 alias。

### R4 — 清理重复路径

- `ReleaseFetchService` 成为 release discovery owner；清理 `UpdateSystem.checkForUpdates`、renderer provider 等重复发现/选择逻辑的调用路径。
- 本子任务不实现持久化 lifecycle、install-on-quit、平台 recovery 或 UI 重构，但必须产出下一子任务可直接消费的 shared candidate/error contract。
## Acceptance Criteria

- [x] Nexus candidate 正常返回；Nexus authoritative none/policy 不回退；网络错误、超时、429、5xx 才查询 GitHub。
- [x] Nexus/GitHub 的 ETag、Last-Modified、cooldown、releases 按 source/channel 隔离，无跨源缓存污染。
- [x] 两来源输出同一 normalized candidate；main/renderer 不再读取来源私有字段来选择平台资产。
- [x] manifest 缺失、release identity/channel 错配、pair 重复、当前 pair 缺失均被拒绝。
- [x] SHA-256 以 stream 计算；大文件验证不再产生与包大小等量的单次 Buffer。
- [x] signature URL、embedded public key、signature payload 缺失或签名不匹配均 fail closed，且没有网络公钥回退或环境变量绕过。
- [x] 旧字段与死路径已清除；packages/utils 17 tests、CoreApp OTA 17 tests、renderer web typecheck 通过。Node typecheck 未出现 OTA 错误，但被并行中的 search-index/file-provider 未提交接口改动阻断。

## Verification

- `corepack pnpm -C "packages/utils" exec vitest run "__tests__/types/update.test.ts"` → 17/17 passed。
- `corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/update/update-system.test.ts" "src/main/modules/update/services/release-fetch-service.test.ts" "src/main/utils/release-signature.test.ts"` → 17/17 passed。
- `corepack pnpm -C "apps/core-app" exec vue-tsc --noEmit -p tsconfig.web.json --composite false` → passed。
- `corepack pnpm -C "apps/core-app" run typecheck:node` → OTA 相关错误为 0；命令仍因并行 search-index/file-provider 变更缺失 `PersistEntry` / `PersistAndIndexSummary` / `persistAndIndex` 及数个未使用变量而失败，本任务未改动这些文件。
## Constraints

- 继承父任务 `.trellis/tasks/07-17-unify-ota-update-flow/` 的平台矩阵、签名与 clean-cutover 决策。
- 不修改用户安装时机、平台安装器行为、recovery 或 renderer 交互。
- 不接受“兼容历史 unsigned release”作为降级理由；旧下载缺完整契约时必须重新下载。
