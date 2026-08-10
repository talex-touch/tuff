# 审计证据 — 供应链与运行时安全配置

## 复核目标

验证 07-18-plugin-tuffex-supply-chain 八子任务闭环后是否仍有可绕过的 admission/安装/更新路径。仅报告可能漂移 or 未覆盖的新风险。

## ✅ 供应链已闭环项（不重复报告）

| 能力 | 状态 | 审计结果 |
|------|------|----------|
| Package Policy（Manifest/archive rules） | ✅ 已完成 | 跨 CLI/Nexus 共享、fail-closed |
| Security Scan（versioned rules） | ✅ 已完成 | Critical/High → block; secret leakage regression passed |
| 签名信任链（非对称签名+root+rotation） | ✅ 已完成 | 替代"hash==signature"混合语义 |
| Nexus 展示门禁（policy+scan+sig+audit） | ✅ 已完成 | 不满足任意一项 → 不可进入公开频道 |
| 真实上传证据（end-to-end） | ✅ 已完成 | SHA-256 贯穿全链路 |
| CLI shim 退场 | ✅ 已完成 | `tuff` 唯一命令面 |
| 发布证据 verifier | ✅ 已完成 | strict 模式 exit 0 |

## 运行时 admission（安装后上下文）

### ✅ G1 已闭合 — webContents 注册表防 sender 伪造

详见 [`isolation-transport.md`](./isolation-transport.md) G1 评估。Commit `83d292fc3` 已落地。

### 🔴 H2 backlog — 旧 SDK 插件视图仍使用 compat 模式

详见 [`isolation-transport.md`](./isolation-transport.md) F6。

### 🔴 C1-B 未完成 — 插件 Prelude 仍在主进程 vm

详见 [`sqlite-permission.md`](./sqlite-permission.md) F4。

## 宿主安全配置

### ✅ OTA 更新安全

- `apps/core-app/src/main/modules/update/UpdateService.ts` — manifest v2 + SHA-256 + detached signature + 内嵌公钥。
- `TUFF_UPDATE_REQUIRE_SIGNATURE=1` — opt-in强制签名验证。
- macOS 强制 Developer ID 签公证。
- N-1 回滚兼容与 version gate 已闭环（`07-17-unify-ota-update-flow`）。

### ✅ 协议安全

- `tfile` — allowlist 验证 + `bypassCustomProtocolHandlers` 转发 `file:`。
- `atom` — legacy only，无新 consumer。
- `stream` — scheme 已注册但无 handler，不会被误用为 blob tunnel。

### 🟡 依赖与原生模块

- `electron-builder.yml:48-57` — tesseract.js(~29MB)/mathjs(~13MB) 标注为未使用但仍在 devDeps（已知 C1 in search audit）。
- Rust 截图模块构建链未 verified（R1 in search audit）。
- `windows-acceptance-manifest-verifier` 已知部分项未验证（search audit OS-05）。

## 开发模式风险

- `plugins/touch-dev-utils/manifest.json` — 无 dev source 限制。
- 开发者模式插件通过 `devPluginWatcher.ts` 热更新，无签名校验。
- 本地开发模式下这些行为符合预期；但生产安装路径应确保 dev 包不会被误装。

## 总体结论

供应链从源码到发布、下载到安装的 integrity 链已闭环。运行时安全（C1-B 进程隔离 + H2 安全视图）是当前最高优先级未闭环项。SQLite `ATTACH` 绕过和 permission fail-open 是在既有的主进程信任模型内的可独立修复缺陷。
