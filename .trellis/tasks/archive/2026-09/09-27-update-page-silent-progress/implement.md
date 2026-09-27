# Implement — 更新设置页重构

## 0. 实施地点（2026-09-27 用户选定：共享检出）

- **在共享检出里直接改**（`~/Workspace/Projects/talex-touch`，当前停在已合并的 `task/fix/packaged-onboarding-experience`，另有 20+ 个其他会话的在改文件）。
- 约束：
  - locale 与其他共享文件只做精确 Edit，不整文件重写。
  - 不 stash / checkout / restore。
  - 验证「是我改的」用 `git show HEAD:<path>` 做对照。
  - 不提交；用户要求提交时，按 `multi-session-collab-guide.md` 走 HEAD + 仅本任务行 / 私有 index，提交到从 `origin/master` 建的 `task/feat/update-page-silent-progress`。
- dev 实测会带上其他会话的半成品：如果它们导致 dev 起不来或报错，先判断是不是本任务文件引起的；不是就报告，不越界去修。
- 类型检查只对本任务文件范围判 0 错误，其他会话在改文件的报错不归本任务。

## 1. 有序清单

### A. utils 契约（先落，主进程和渲染端都依赖它）
- [ ] `packages/utils/types/update.ts`：`UpdateHistoryOutcome`、`UpdateHistoryEntry`
- [ ] `packages/utils/transport/events/types/update.ts`：`UpdateGetHistoryRequest`、`UpdateGetHistoryResponse`，并在 `events/index.ts` 的 import 列表与 `UpdateEvents.getHistory`（`update:service:get-history`）登记
- [ ] `packages/utils/transport/sdk/domains/update.ts`：`getHistory`
- [ ] `packages/utils/__tests__/transport-domain-sdks.test.ts`：补 `getHistory` 映射断言

### B. 主进程
- [ ] `update-attempt-repository.ts`：`listTerminalAttempts(max)`
- [ ] 新 `update-history.ts`：`buildUpdateHistory(snapshots, limit)`（映射、去重、夹 limit）+ `update-history.test.ts`
- [ ] `UpdateService.ts`：注册 `UpdateEvents.getHistory` handler（无仓库时返回 `success: true, data: []`）
- [ ] `UpdateService.ts` F3：`synchronizeCachedCheckResult` 成功标 `available` 后 `void this.maybeAutoDownloadLifecycle(...)`
- [ ] `UpdateService.test.ts`：覆盖三种情况——缓存命中 + autoDownload → 触发；autoDownload=false → 不触发；已有活跃尝试（冲突）→ 不触发。另补仓库查询测试（沿用现有 repository 测试的建库方式）
- [ ] **回退校验**：单文件撤回 F3 那一行，确认新测试变红（[[git-verify-per-file]]：用 `git show` 取回原文件，不用 stash/checkout）

### C. 渲染端 runtime
- [ ] `useUpdateRuntime.ts`：`DOWNLOAD_START_TIMEOUT = 30_000` 用于 `update:download`；新增 `getUpdateHistory(limit?)`
- [ ] `useUpdateRuntime.test.ts`：下载请求用的是长超时（假时钟推进 5s 不超时）；`getUpdateHistory` 失败时返回空数组

### D. 渲染端纯逻辑
- [ ] 新 `update-status-display.ts` + 表驱动测试：覆盖 design §3 每一行，外加 15s 宽限的两侧边界、macOS unofficial 下 ready 的动作替换
- [ ] `update-diagnostic-evidence.ts`：新增 `resolveBuildAuthenticity`；删除 `resolveMacNativeTrustDisplay` / `MAC_NATIVE_TRUST_RISK_KEYS`；同步 `update-diagnostic-evidence.test.ts`
- [ ] 新 `useUpdateDownloadProgress.ts` + 测试：匹配 taskId、忽略其他模块或任务、挂载回填、离开 downloading 后清空、卸载时解除订阅

### E. 组件
- [ ] 新 `SettingUpdateStatus.vue`（状态行：标题 / 第二行 / 进度 / 动作，`aria-live`）
- [ ] 新 `SettingUpdateHistory.vue`
- [ ] 重写 `SettingUpdate.vue`：三卡结构、可见性规则（design §4）、自动更新开关、骨架屏（`SettingSkeleton` + `useDeferredLoading`，只覆盖状态卡）、banner；删掉 install-mode、官方认证徽标、旧告警块、无用样式
- [ ] 重写 `SettingUpdate.channel.test.ts`：mock 改为 `dev.developerMode`；覆盖 release/beta 构建、已选 Beta、开发者模式开关前后的可见性；无「官方认证」、无「空闲」、无安装方式下拉；渠道切换保存/回滚/禁用这几个既有行为保留

### F. 文案（精确 Edit，禁止整文件重写）
- [ ] zh-CN / en-US：按 design §10 增、改、删；每个待删 key 先 `rg -n "<key>" apps/core-app/src packages` 确认零引用（flag 分开写，别用 `-rn`，见 [[rg-replace-flag-trap]]）
- [ ] 两个文件 `JSON.parse` 通过；新增 key 两边齐全

### G. spec
- [ ] `.trellis/spec/frontend/release-testing.md` §3 第 212 行与 §4 矩阵（design §11）

## 2. 验证命令

在实施地点根目录执行。先 `export PATH="$HOME/.local/share/mise/shims:$PATH"`；不要用 `timeout` 前缀（macOS 没有这个命令，会被静默吞掉），超时用 Bash 工具参数。

```bash
# 聚焦测试（core-app）
cd apps/core-app && ./node_modules/.bin/vitest run \
  src/renderer/src/views/base/settings/SettingUpdate.channel.test.ts \
  src/renderer/src/views/base/settings/update-status-display.test.ts \
  src/renderer/src/views/base/settings/useUpdateDownloadProgress.test.ts \
  src/renderer/src/views/base/settings/update-diagnostic-evidence.test.ts \
  src/renderer/src/modules/hooks/useUpdateRuntime.test.ts \
  src/main/modules/update/update-history.test.ts \
  src/main/modules/update/UpdateService.test.ts \
  src/main/modules/update/update-attempt-repository.test.ts
# 若 .bin shim 失效：node <repo>/node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run …

# utils
cd packages/utils && ../../node_modules/.bin/vitest run __tests__/transport-domain-sdks.test.ts

# 类型：node 侧与包脚本一致
cd apps/core-app && ./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false > /tmp/tc-node.log 2>&1; echo rc=$?
# web 侧：包脚本会先重建 tuffex dist（约 6 分钟，会影响其他会话）。若 dist 完整（ls packages/tuffex/dist/es | wc -l ≈ 160），直接跑 vue-tsc：
cd apps/core-app && ./node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false > /tmp/tc-web.log 2>&1; echo rc=$?
# 正向对照：临时埋一个 `const __probe: number = 'x'`，确认两个 tsc 都报错，再移除

# 格式 / lint：以包内配置为准，判 delta 不判零，不对整文件 --fix
node node_modules/.pnpm/prettier@*/node_modules/prettier/bin/prettier.cjs --check <改动文件>
cd apps/core-app && ./node_modules/.bin/eslint <改动文件相对路径>

git diff --check
```

## 3. 真机验证（交付前必须做）

1. `pnpm core:dev`（实施地点）。确认 CDP / 窗口是自己起的实例（`multi-session-collab-guide.md`）。进入 设置 → 更新：
   - 开发者模式关：只有 banner（dev 构建 = unofficial，应显示新 banner）、状态行、渠道行（当前是 beta 构建）、历史卡（有记录时）；无频率/安装方式/通知/诊断，无「空闲」「官方认证」。截图。
   - 开发者模式开：高级卡出现，自动更新开关可切换并持久化。截图。
2. 进度：本地 `2.4.14-beta.46` < 已发布 `v2.4.14-beta.47`。点「检查更新」→ 发现新版本 → 点「下载更新」（dev 不走自动下载，15s 宽限后按钮出现）→ 确认 4–8s 内无失败 toast、按钮 loading，进入下载中后进度条推进，显示百分比/大小/速度。离开页面再回来确认进度回填。截图。下载体积约 0.5 GB，产物在 dev 的更新目录，验证完清理。
3. R5 平台真伪（实物验证，不在本机安装）：从 `v2.4.14-beta.47` 下载 Windows x64 与 Linux x64 官方资产到 /tmp，解出 `resources/app.asar`、`build-attestation.json(.sig)`，用 `verifyBuildAttestation`（`build-verification/attestation.ts`）按 `platform: win32/linux` 校验，应得 `valid: true`，即正版用户不会误报。做完删除 /tmp 产物。做不了就在报告里写明「未验证」。
4. F3 只在打包构建生效（`!app.isPackaged` 门）：以单测与回退校验为证据，报告里注明未做打包实测。

## 4. 风险与回滚点

- `SettingUpdate.vue` 大改：保留渠道切换、频率保存、Renderer Override、下载包弹窗、导出诊断的既有逻辑，只改它们的位置和可见性。
- locale：只做局部 Edit。
- F3 一行调用可单独撤回。
- Spec 与代码同一批次提交，避免 spec 描述与实现不一致。
