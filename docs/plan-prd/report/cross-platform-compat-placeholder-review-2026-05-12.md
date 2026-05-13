# 跨平台兼容与占位实现复核报告（2026-05-12）

> 复核范围：`apps/core-app`、`apps/nexus`、`apps/pilot`、`packages/*`、`plugins/*` 的生产源码、guard 脚本与 `plan-prd` 主入口。
> 基线：`2.4.10-beta.19`。
> 关系：本文是 `cross-platform-compat-placeholder-audit-2026-05-10.md` 的后续复核；旧报告保留为历史基线，当前执行口径以本文和 `TODO.md` 为准。

## 1. 总体结论

跨平台与假实现治理已经从“识别问题”进入“证据和退场”阶段：

- 2026-05-10 报告里的三类 P0/P1 假成功路径已基本收口：Pilot 系统状态改为 runtime metrics，Pilot 支付 mock 由 `PILOT_PAYMENT_MODE=mock` 显式门控，`plugins/touch-image` 图片历史迁入 plugin storage SDK 并保留一次性 retired localStorage 迁移。
- CoreApp 生产 raw channel 直连没有新增未授权命中；`transport-event-boundary.test.ts` 继续把 raw send、retained raw definition、typed migration candidate 分开统计，typed candidate 保持 `0`，retained raw definition 上限为 `264`。
- 当前最大 blocker 仍不在本地实现，而是真实设备证据：Windows `2.4.10` release gate 必须补齐 acceptance manifest、常见 App 启动、复制 app path、本地启动区索引、Everything target probe、更新安装、DivisionBox detached widget、分时推荐、search trace `200` 样本、clipboard stress `120000ms` 与 Nexus Release Evidence 写入。
- 结构治理继续有效，但主线仍有 52 个 `>=1200` 行文件；`size:guard:report` 当前显示 `newOversizedFiles=0`、`grownOversizedFiles=0`、`cleanupCandidates=0`，说明没有回涨，但 `plugin-module`、`file-provider`、`app-provider`、Nexus/Pilot 大文件仍是 2.4.11 前的 SRP 余量。

质量判断：当前代码比 2026-05-10 更稳，已消除最危险的“假值成功”默认路径；下一步应停止扩大治理范围，集中补真实设备证据和关闭清册退场项。

## 2. 本次复核事实

### 已收口项

- `apps/pilot/server/api/system/serve/stat.get.ts` 已改为 `buildPilotServeStat()`，不再返回 `Mock CPU` / `pilot-mock` / 固定磁盘内存。
- `apps/pilot/server/utils/pilot-payment-service.ts` 的 mock 支付 URL 仍存在，但所有创建/查询 pending mock 订单路径都会先执行 `ensurePilotPaymentMockEnabled()`；非 mock 环境返回 `PAYMENT_PROVIDER_UNAVAILABLE`。
- `apps/pilot/server/api/order/price/dummy.get.ts`、`balance.post.ts`、`subscribe.post.ts`、`target.get.ts` 均处理 `PAYMENT_PROVIDER_UNAVAILABLE`，不会默认成功返回 mock 订单。
- `plugins/touch-image/src/App.vue` 使用 `usePluginStorage()` 保存 `history-images.json`，只读取旧 `historyImgs` localStorage 做一次性迁移后删除，并限制历史上限为 50 条。
- `pnpm compat:registry:guard` 已通过：`compat-file=5`，`legacy-keyword=0`，`raw-channel-send=0`，`legacy-transport-import=0`，`legacy-permission-import=0`。
- `pnpm -C "apps/core-app" run runtime:guard` 已通过。
- `pnpm docs:guard` 已通过，六主文档日期与下一动作一致。
- `pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts"` 已通过。

### 本轮修正

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
  - 将测试标题中的 `legacy ids` 改为 `retired ids`，保持断言不变。
  - 目的：清理非行为性的 legacy 关键词噪声，恢复 `compat:registry:guard` 绿线。

## 3. 当前剩余风险

### P0：Windows/macOS 真实证据仍阻塞正式发布

本地 verifier 和模板已经很细，但不能替代真实设备。`2.4.10` 正式 gate 仍缺：

- Windows acceptance manifest 最终强门禁。
- 微信 / Codex / Apple Music 等常见 App 搜索、图标、启动与 CoreBox 隐藏证据。
- 复制 app path 加入本地启动区后的 reindex、搜索命中和 indexed result launch 闭环。
- Everything target probe、App Index diagnostic、Windows update install、DivisionBox detached widget、分时推荐手工证据。
- Search trace `200` 样本和 Clipboard stress `120000ms` 压测。
- Nexus Release Evidence 写入。

### P1：retained raw definition 仍是治理余量

`raw send violation` 已被 guard 卡住，但 retained `defineRawEvent` 仍大量存在。当前策略正确：二段事件或特殊 wire name 可以保留，符合 `namespace/module/action` 的三段事件不得新增 raw definition。下一批只建议迁移高频路径：CoreBox、terminal、auth、sync、opener、plugin-log。

### P1：CLI token 仍是明文 JSON

`packages/tuff-cli-core/src/auth.ts` 会把 login token 写入 `auth.json`。这不是 CoreApp renderer/localStorage 问题，但从 Security Rule 看仍是跨平台敏感凭据债务。

建议顺序：

1. 短期先写入后 chmod `0600`，并在 Windows 上确认 ACL 行为。
2. 中期抽 `CliCredentialStore`，优先接 Keychain / Credential Locker / libsecret。
3. 保留 `TUFF_AUTH_TOKEN` env 覆盖作为 CI/无头环境路径。

### P1：插件侧命令执行能力分散

`touch-system-actions`、`touch-quick-actions`、`touch-window-manager` 等插件仍直接使用 `exec/spawn/execFile` 调用平台命令。它们多数有 manifest 平台声明，但长期应纳入统一 Native/Permission capability 诊断口径，至少输出 unsupported/degraded reason，避免插件内部静默失败。

### P1：超长模块仍需要小步 SRP

本轮无新增/增长，但 `file-provider.ts`、`plugin-module.ts`、`app-provider.ts`、Nexus provider/lab/store、Pilot stream/tool gateway 等仍超过 1200 行。后续不要做大爆炸重构，优先按“可测试 helper + 保持外部合同”拆：

- `file-provider.ts`：扫描状态/索引调度/thumbnail pipeline/诊断导出边界。
- `plugin-module.ts`：lifecycle、runtime repair、surface/window wiring、registry 更新。
- `app-provider.ts`：launch resolver、metadata enrichment、diagnostic evidence。
- Nexus/Pilot 大文件：先拆 request parsing、sanitizer、provider adapter、view state composable。

## 4. 下一步建议

1. 先补 Windows 真机 evidence，不再扩大发版 blocker 范围。
2. 对 `compat-file=5` 做一次物理命名 hard-cut 评估：`startup-migrations.ts`、download migration 文件、`polyfills.ts`、`MigrationProgress.vue`。
3. 将 CLI token storage 作为 P1 安全债务立项，先做权限收紧，再评估系统凭据存储。
4. 迁移 retained raw definition 的下一批高频路径，保持 `typedMigrationCandidates=0`。
5. 继续 SRP 小切片，优先 `plugin-module` 与 `file-provider`，每切一块同步降低 size allowlist/growth cap。

## 5. 本次执行过的校验

- `pnpm compat:registry:guard`：通过。
- `pnpm size:guard:report`：通过，`oversizedFiles=52`，`newOversizedFiles=0`，`grownOversizedFiles=0`。
- `pnpm docs:guard`：通过。
- `pnpm -C "apps/core-app" run runtime:guard`：通过。
- `pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts"`：通过。

## 6. 本次未执行

- 未运行完整 `typecheck:all` / `release:guard` / 全量测试。
- 未做 git commit / push。
- 未执行 Windows/macOS/Linux 真机验证。
