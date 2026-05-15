# 跨平台兼容与占位实现跟进报告（2026-05-14）

> 关系：本文承接 `cross-platform-compat-placeholder-deep-review-2026-05-13.md`，只记录本轮新增事实与口径变化，不替代 Windows/macOS 真机 evidence。

## 1. 总体结论

当前最大的兼容与质量风险已经从“占位/假实现”转为“真实 evidence 尚未补齐”。本轮一度发现的 FileProvider 编译面断裂已经恢复：

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复完整 `fileProvider` 导出。
- `pnpm -C "apps/core-app" run typecheck:node` 已通过。
- 仍需按发版节奏补文件搜索最近路径 smoke；Windows 真机 evidence 与 Nexus Release Evidence 不在本轮处理范围。

本轮没有发现新的 P0 级“生产固定假值成功”路径。昨天列出的两项 secret 风险已有实质进展，但仍未达到最终目标：

- CLI token 已进入 `CliCredentialStore`，POSIX 下写入目录/文件权限尝试收敛到 `0700/0600`，Windows 会对用户目录外存储给出 ACL warning；但仍不是系统 Keychain / Credential Locker / libsecret。
- `touch-translation` provider `apiKey/secretKey/token` 已迁入 `usePluginSecret()`，普通 `providers_config` 会剥离 legacy secret；CoreApp plugin secret 走 `secure-store` 加密 envelope，但当前 backend 是 `local-secret`，health 语义为 degraded。

## 2. 已恢复 blocker

### P0：FileProvider 入口文件为空

验证：

```bash
wc -l "apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts"
pnpm -C "apps/core-app" run typecheck:node
```

结果：

- `file-provider.ts` 已恢复为 `3813` 行。
- `typecheck:node` 通过。

恢复前影响：

- CoreApp 主进程类型检查不可通过。
- SearchEngine 无法注册 index/enrichment 层 file-provider。
- Windows Everything 降级到 file-provider、显式 `@file` file-provider 路由、文件打开器/缩略图/索引维护相关能力不可验证。
- macOS/Linux 的文件搜索与索引能力不能宣称 release-ready。

剩余建议：

1. 再跑文件搜索最近路径测试或 smoke：Everything fallback、macOS/Linux native/file search、file index settings、storage maintenance。
2. Windows 真机 evidence 与性能 evidence 仍按 `TODO.md` 跟踪。

## 3. 风险状态更新

### CLI token storage

当前状态：从“无权限保护的明文 JSON”降为“文件权限缓解已落地，OS 级 credential store 未闭环”。

代码事实：

- `packages/tuff-cli-core/src/auth.ts` 与 `packages/unplugin-export-plugin/src/core/auth.ts` 已通过 `createCliCredentialStore()` 读写 `auth.json`。
- `CliCredentialStore` 在 POSIX 下对配置目录与 token 文件执行 `0700/0600` best-effort chmod。
- Windows 下无法自动验证 ACL，仅对用户目录外存储给出 warning。

剩余目标：

- 抽象 `CliCredentialStore` 的 OS backend：macOS Keychain、Windows Credential Locker、Linux libsecret。
- 保留 `TUFF_AUTH_TOKEN` 作为 CI/headless 路径。

### 插件 provider secret storage

当前状态：`touch-translation` 已迁入 plugin secret capability，但 secure-store backend 仍为 local root secret。

代码事实：

- `plugins/touch-translation/src/composables/useTranslationProvider.ts` 使用 `usePluginSecret()` 保存 `deepl/bing/custom/baidu/tencent/caiyun` 的 secret 字段。
- 普通 plugin storage 中的 `providers_config` 会剥离 secret 字段，并迁移旧配置里的 secret。
- `PluginEvents.storage.getSecret/setSecret/deleteSecret` 在 CoreApp 内写入 `secure-store`。
- `secure-store` 当前 backend 为 `local-secret`，加密落盘但 health 标记 degraded。

剩余目标：

- 为 CoreApp secure-store 接入系统安全存储 backend。
- 在插件设置 UI 中暴露 secret storage health / degraded reason（`touch-translation` provider 配置弹窗已接入）。
- 对已有插件普通 storage 中遗留 secret 做一次性清理 evidence。

## 4. 占位/假实现复核

本轮限定主线源码扫描后，未发现新的 P0 级固定假成功路径。仍需沿用 2026-05-13 报告中的 P1 清单：

- AI 兼容占位成功响应退场。
- 插件 shell capability 统一诊断。
- retained raw definition 高频路径继续迁移。
- SRP 大文件继续小切片。

需要注意的非问题：

- `.fake-background`、输入框 `placeholder`、UI mock payload preview、playground mockup 不等同于生产假实现。
- `packages/tuff-native` OCR stub 是显式平台 stub，关键是 UI/SDK 必须透传 unsupported reason。

## 5. 架构健壮性观察

生产样式源码仍存在大量超长文件，最大风险集中在：

- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`

建议继续避免扩大 CoreBox/Search 高风险主路径重构面。下一步应按单职责切片推进：

1. FileProvider：补最近路径验证。
2. CoreBox retained alias：只继续小批次 canonical event + legacy alias registry + dual listen。
3. PluginModule：secret/storage IPC 与 lifecycle/surface wiring 分离。
4. AppProvider：scanner、launch resolver、metadata enrichment、diagnostic evidence 分离。

## 6. 本轮验证

- `pnpm -C "apps/core-app" run typecheck:node`：通过。
- `pnpm -C "apps/core-app" run typecheck:web`：通过，仍输出既有 Tuffex `TouchScroll` dts / Sass / Browserslist 噪声。
- `pnpm -C "plugins/touch-translation" run typecheck`：通过。
- `git diff --check`：通过。
- 静态扫描：
  - 平台分支与系统命令调用。
  - `localStorage` / `payload_enc` / `/api/sync/*` / secret storage。
  - `TODO/FIXME/placeholder/stub/fake/mock` 生产命中抽样。
  - 生产样式源码大文件行数统计。

## 7. 未执行

- 未运行完整 `pnpm lint`、`pnpm quality:release`。
- 未执行 Windows/macOS/Linux 真机验证。
- 未执行 git commit / push。
