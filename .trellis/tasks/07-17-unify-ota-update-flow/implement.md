# 实施计划：统一 OTA 更新链路

## 1. 任务拆分

当前任务作为父任务，保留源需求、跨子任务契约与最终集成验收。实施前按以下顺序创建并执行子任务：

1. **统一 Provider 与安全门禁**
   - 统一 Nexus/GitHub provider outcome 与 candidate normalizer。
   - 收紧 manifest/identity/pair 校验。
   - 改为流式 SHA-256，删除网络公钥 fallback 与可选签名门禁。
2. **建立持久化 OTA 状态机**
   - 新增 attempt schema/repository/reducer。
   - 扩展 shared types、transport SDK 与 status snapshot。
   - clean cutover `autoInstallDownloadedUpdates -> installOnNormalQuit`。
3. **统一安装协调与平台恢复**
   - 接入 typed quit intent、`BEFORE_APP_QUIT` preflight 与 `WILL_QUIT` handoff。
   - 收敛 Windows/macOS/Linux adapter。
   - 实现 health ack、previous asset 轮换和 recovery loop guard。
4. **更新 UI、发布契约与跨平台验收**
   - 更新设置页、弹窗、通知、i18n 与诊断。
   - 升级 manifest/validator/Nexus/workflow 的 rollback compatibility contract。
   - 完成三平台真实宿主验收与父任务集成检查。

子任务存在严格顺序依赖：2 依赖 1 的 shared candidate；3 依赖 2 的 attempt reducer；4 依赖前三项稳定契约。父任务本身不直接承载实现代码。

## 2. 子任务一：统一 Provider 与安全门禁

### 2.1 共享契约

- 在 `packages/utils/types/update.ts` 增加 provider outcome、normalized candidate、manifest v2 与稳定 error code。
- 将 Nexus/GitHub 外部 payload 的 normalizer 和 runtime guard 放在单一 owner，renderer 不解析原始字段。
- Nexus 有效 `none/policy-block` 终止；仅 transient failure 进入 GitHub fallback。
- 将 cache key 改为 `source + channel`，隔离 ETag、Last-Modified、cooldown 和 releases。

### 2.2 Runtime 安全

- `UpdateSystem` 只能接受 normalized candidate，不再自行按文件名选择未声明资产。
- manifest、release identity、当前 pair、SHA-256 和 signature URL 任一缺失即失败。
- `SignatureVerifier` 只加载 embedded public key；删除 `signatureKeyUrl`、网络 key cache、env URL 与 `TUFF_UPDATE_REQUIRE_SIGNATURE`。
- checksum 改为 stream pipeline，避免将完整安装包读入内存。
- 清理 `UpdateSystem.checkForUpdates`、renderer provider 等重复版本/资产逻辑；保留一个 authoritative path。

### 2.3 验证

- Provider：Nexus candidate、authoritative none、policy block、timeout/429/5xx fallback、GitHub failure + stale verified cache。
- Security：manifest 缺失、pair 重复、identity 错配、hash 错误、signature 缺失/无效、embedded key 缺失均不能进入 ready。
- 运行 shared utils 与 CoreApp main 的定向 Vitest；运行 `pnpm -C "apps/core-app" run typecheck:node`。

## 3. 子任务二：建立持久化 OTA 状态机

### 3.1 数据与 reducer

- 新增 Drizzle schema 与 migration：`app_update_attempts`。
- repository 提供 compare-and-transition，事务内递增 revision；非法前序状态返回明确错误。
- 保留 `app_update_records` 处理 ignored/snoozed/acknowledged，不把下载和安装状态继续塞入 release payload。
- DownloadCenter 只拥有字节进度；attempt 只引用 task id。

### 3.2 Transport

- `UpdateGetStatusResponse` 改为 authoritative lifecycle snapshot。
- SDK 保留 check/download/install/ignore/settings 动作，但响应统一返回最新 snapshot 或稳定错误。
- renderer 以 revision 丢弃旧 snapshot；不得继续用本地布尔组合推断 ready/installing。

### 3.3 设置迁移

- `UpdateSettings` 新增 `installOnNormalQuit`，默认 true。
- 一次性读取旧 `autoInstallDownloadedUpdates` 值并迁移；随后删除旧字段、文案、诊断字段与平台特例。
- 迁移旧 `pendingInstallVersion` 到 attempt；缺完整 task/asset/verification 元数据时标记不可恢复并重新下载。

### 3.4 验证

- Reducer 覆盖全部合法转换、非法转换、重复命令、进程重启恢复和 revision 单调性。
- Migration 覆盖旧设置 true/false/缺失与旧 pending version。
- SDK producer/consumer round-trip，renderer stale revision 不得覆盖新状态。
- 运行 packages/utils 与 CoreApp main/renderer 定向 Vitest；运行 node/web typecheck。

## 4. 子任务三：统一安装协调与平台恢复

### 4.1 Quit intent 与 handoff

- 引入 typed quit intent：user-normal、update-now、system-shutdown、startup-failure、duplicate-instance、other。
- 所有可控退出入口统一设置 intent；实施时对导出 symbol 先跑 LSP references，再 clean cutover。
- `BEFORE_APP_QUIT` 只做 preflight、attempt persist、业务 flush 和 helper plan；`WILL_QUIT` 只启动已准备 handoff。
- 没有 user-normal/update-now intent 时不得安装。

### 4.2 平台 adapter

- macOS：删除 `MacAutoUpdaterAdapter` 分支；DownloadCenter 完成验证后只走 `macos-apply-update.sh`。
- Windows：复用 NSIS detached handoff，区分“进程启动成功”和“版本安装健康”。
- Linux：明确 AppImage/deb adapter；`openPath` 只算 handoff started，不算 healthy。
- 删除不再使用的 `electron-updater` 依赖、app-update 条件分支和对应死设置；不得保留 alias。

### 4.3 Health 与 recovery

- 在现有 `Startup health check passed` 之后补 attempt/version、database/update repository 和 renderer readiness 检查，写幂等 health ack。
- helper plan/ack 只写 update storage root，包含 attempt id、版本、随机 token；拒绝路径逃逸与旧 attempt 重放。
- macOS backup 在 health ack 前保留，超时/异常退出恢复旧 app。
- Windows/Linux 保留上一版已验证包；recovery 尽量自动启动原生安装流程，但正确报告 UAC/包管理器/用户确认。
- 每个 attempt 最多一次自动 recovery；再次失败停在 `recovery-required`。
- successful N+1 health 后删除 N-1，只保留 N。

### 4.4 验证

- 区分 user normal quit、install now、crash、startup failure、duplicate instance、system shutdown；只有前两类允许 handoff。
- macOS：替换成功、普通权限失败后管理员路径、copy 失败 restore、health timeout restore、防循环。
- Windows：受支持 NSIS、启动失败、UAC handoff、previous installer recovery。
- Linux：AppImage/deb 选择、handoff 失败、previous package recovery。
- 用临时目录和伪安装资产做 helper smoke，不操作真实 `/Applications`、系统包数据库或用户 profile。

## 5. 子任务四：UI、发布契约与验收

### 5.1 UI/UX

- `useUpdateRuntime` 只消费 lifecycle snapshot。
- 设置页增加默认开启的“正常退出时安装”，删除 Windows-only 自动接管描述。
- `ready` 同时显示“立即安装”和退出安装状态。
- verifying/handoff/awaiting-health/recovery/failed 使用准确文案；不得提前显示“安装成功”。
- native trust waived 在详情与诊断中持续可见。

### 5.2 Manifest 与发布门禁

- manifest schema v2 增加 `rollbackFromVersion`，validator 校验其等于同渠道 N-1。
- Nexus sync 和 GitHub fallback 共用 shared manifest contract；继续保持唯一 pair、SHA-256、signature sidecar。
- 添加 N 升级后由 N-1 打开同一测试 profile 的兼容 gate。失败 release 不允许退出自动安装。
- macOS 第一阶段不再要求 electron-updater metadata；workflow 稳定发布 dmg/app zip、manifest 与 signature sidecar。

### 5.3 跨平台验收

对 `win32/x64`、`darwin/arm64`、`linux/x64` 各自记录：

1. Nexus 正常发现；Nexus transient failure 后 GitHub fallback。
2. 自动下载、断点/重启恢复、hash/signature pass。
3. 正常退出触发 handoff；crash/system shutdown 不触发。
4. 新版本 health ack。
5. 首启失败进入平台恢复；previous asset 轮换。
6. N/N-1 profile compatibility。

真实宿主才可报告 runtime pass；其余平台只能 static-only。

## 6. 父任务集成门禁

- PRD 每条 requirement 都映射到至少一个子任务验收项。
- shared candidate、lifecycle snapshot、attempt reducer、quit intent 与 manifest validator 都只有一个 owner。
- 搜索并清除旧字段/路径：`autoInstallDownloadedUpdates`、`pendingInstallVersion`、`MacAutoUpdaterAdapter`、`TUFF_UPDATE_REQUIRE_SIGNATURE`、`signatureKeyUrl`。
- 没有兼容 alias、双状态源或旧 macOS updater 分支。
- 发布 workflow、Nexus payload、CoreApp runtime 和 renderer UI 对同一 release/attempt 的 version/source/pair/state 一致。

## 7. 最终验证命令

定向检查完成后执行一次完整门禁：

```bash
corepack pnpm -C "packages/utils" exec vitest run <update-contract-tests>
corepack pnpm -C "apps/core-app" exec vitest run <update-main-renderer-tests>
corepack pnpm -C "apps/nexus" exec vitest run <release-api-tests>
corepack pnpm -C "apps/core-app" run typecheck
node "scripts/update-validate-release-manifest.mjs" --manifest <manifest-v2-fixture>
node "scripts/check-release-gates.mjs" --tag <fixture-tag> --version <fixture-version> --stage gate-e --base-url <fixture-base-url> --manifest <manifest-v2-fixture>
```

随后分别执行三平台 packaged smoke；不以 workspace preview 或 macOS 上的静态检查替代 Windows/Linux Runtime 证据。

## 8. 回滚点

- Provider/security 子任务可在未迁移调用方前独立回退。
- 状态机 migration 一旦发布，回滚代码仍必须能读取新表；禁止删除表或复用字段语义。
- 设置字段只在所有 caller 迁移并通过 typecheck 后删除旧值。
- 平台 coordinator 上线前保留发布开关，但正式切换必须一次性移除旧 macOS 双路径；开关不是长期兼容层。
- manifest v2 在 Nexus、workflow、CoreApp 同一 release train 同步切换；任何一端未就绪则阻止发布，不做 v1 无签名降级。
