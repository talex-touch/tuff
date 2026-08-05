# 本机 AI CLI 快速调用 — Implementation Plan

## Execution Strategy

先闭环只读快速问答，再逐个接入可证明的审批协议，最后加入 PTY 与打包证据。任何 provider/mode 的写入审批未被证明时，只关闭该 capability，不阻塞同一 provider 的只读问答。

## Ordered Checklist

### 1. Freeze provider protocol contracts

- [x] 为本机版本建立四个协议 probe：Pi RPC、OMP ACP、Codex app-server、Claude Agent SDK + discovered executable。
- [x] 捕获并保存脱敏 fixture：初始化、文本增量、session id、完成、失败、取消。
- [x] 对每个 provider 单独证明审批请求发生在工具执行前，且 allow-once/deny 能恢复或终止原请求。
- [x] 记录 `taskRead`、`taskWriteApproval`、`terminalRead`、`terminalWriteApproval` capability matrix；无证据的写能力默认为 false。
- [x] 不把真实 prompt、home path、token、原生 session file 或完整原生错误写入 fixture。

**Gate**：四个 read-only task 协议均可稳定启动/取消；至少 Codex、Claude、OMP 的 task approval 有官方协议和本地握手证据。Pi 写入 capability 可保持 unavailable，直到 bundled extension bridge 被证明。

### 2. Add shared typed contracts and SDK

- [x] 在 `packages/utils/transport/events/` 增加 Local AI CLI exact DTO、runtime normalizer、stream chunks 和 PTY events。
- [x] 从现有 `AiCliProviderId` 提取四个 canonical provider id，不新造第二套 id 字符串。
- [x] 增加 renderer SDK；不向 plugin SDK 暴露 status、start、approval、PTY 或 executable 信息。
- [x] 将 task stream 加入现有 MessagePort/stream allowlist，并保留 transport channel fallback。
- [x] 对 prompt/context/terminal dimensions/ANSI chunks/approval summaries 设定明确上限。

**Acceptance**：AC3、AC6、AC8 的合同基础。

### 3. Add Beta settings and authoritative normalization

- [x] 在 `packages/utils/common/storage/entity/app-settings.ts` 增加 typed `localAiCli` 默认值：master off、四 provider off、default null。
- [x] 在 main storage normalizer 中 fail-closed 补齐 malformed/missing fields；不依赖 `[key: string]: any` 接受未知值。
- [x] 实现 `isLocalAiCliBetaAvailable()`：仅 `darwin + TUFF_ENABLE_LOCAL_AI_CLI=1`。
- [x] status DTO 只返回 availability/capability/stable reason，不返回环境变量值。
- [x] executable override 只能由 main 文件对话框产生并经过 provider probe，renderer 不提交 path。

**Acceptance**：AC1、AC4、AC13、AC15、AC21。

### 4. Implement main module foundation

- [x] 新建 `apps/core-app/src/main/modules/local-ai-cli/` 并接入 startup module list。
- [x] 使用 module directory 创建隔离 `workspace/`；普通问答固定使用该目录。
- [x] 实现 executable resolver：override → process PATH → macOS known roots → fixed login-shell probe → locate dialog。
- [x] 对候选执行 `realpath/stat/X_OK` 和 provider-specific bounded version probe。
- [x] 实现 host-only handler guard；插件、错误 owner、gate off、settings off、provider off 全部在 spawn 前拒绝。
- [x] 建立 call/session owner registry 和统一 destroy/drain。

**Acceptance**：AC4、AC5、AC6、AC7、AC16。

### 5. Implement read-only task adapters

- [x] Pi adapter：RPC JSONL，stdin prompt/abort，增量文本、session id、终态与错误归一化。
- [x] OMP adapter：ACP/JSON-RPC，session initialize/prompt/cancel/finish 归一化。
- [x] Codex adapter：app-server stdio，thread/turn start、delta、complete、interrupt、resume。
- [x] Claude adapter：Agent SDK `query()`，`pathToClaudeCodeExecutable` 强制指向已验证用户 binary，禁用 SDK bundled binary 回退。
- [x] 普通问答使用 `answer-only`；显式目录只读使用固定 read/search tool allowlist。
- [x] prompt 只经 stdin/protocol 发送，不进入 argv、environment 或日志。
- [x] 每个 adapter 使用独立 decoder；generic runtime 不解析 provider-native fields。

**Smoke gate**：Beta env on + settings on 时，四个真实 CLI 均能从新 module 返回统一 task stream；gate/settings off 时进程计数保持零。

### 6. Build unified approval broker

- [x] 实现 owner-bound、one-shot、expiring `LocalAiCliApprovalBroker`。
- [x] Codex：映射 app-server command/file/permission approval request 与 allow-once/decline。
- [x] Claude：`canUseTool` Promise 等待 Tuff approval，返回 allow/deny；abort signal 关闭 pending approval。
- [x] OMP：映射 ACP permission request/form elicitation 与 response。
- [x] Pi：实现并打包最小 approval extension；使用 RPC extension UI request/response，在 before-tool hook 证据不足时保持 write capability off。
- [x] UI 只显示 bounded safe projection；renderer 不能修改 native tool input 或 grant session-wide permission。
- [x] 超时、deny、window destroy、stream cancel 和 app quit均向 native protocol 返回拒绝/取消。

**Acceptance**：AC11、AC23。禁止任何 auto-approve/bypass fallback。

### 7. Add real PTY runtime and packaged native dependency

- [x] 添加官方 `node-pty` CoreApp runtime dependency。
- [x] 将 `node-pty` 加入 `scripts/build-target/runtime-modules.js`；确认现有 `**/*.node` asarUnpack 覆盖 binding。
- [x] 实现 direct executable PTY create/write/resize/kill/onData/onExit；不启动 shell wrapper。
- [x] 绑定 session owner、cols/rows 上限、input/output backpressure 和 terminal cleanup。
- [x] 读取 adapter capability 决定 PTY access；没有外部 approval bridge 的 TUI 只读。
- [x] 实现 native session resume args；不支持 resume 时 UI 标记“新会话”。
- [x] 增加 unpacked/package native smoke：require binding、spawn、write、resize、kill、无残留进程。

**Acceptance**：AC7、AC9、AC10、AC20。

### 8. Add Settings surface and first-use return flow

- [x] 新增 `SettingLocalAiCli.vue`，仅 main status 报告 Beta available 时挂载。
- [x] 显示 master switch、provider allowlist、default provider、版本/路径、read/write capability、refresh/locate 和 Beta label。
- [x] 在 `AppSettings.vue` 使用 `data-settings-section="local-ai-cli"` 接入既有 section scroll。
- [x] 实现 memory-only pending draft；首次触发跳设置，启用后回到原 OmniPanel 草稿但不运行。
- [x] 设置变化后 main 在每次 start 再校验，禁止 renderer stale state 越权。
- [x] 添加中英文 i18n。

**Acceptance**：AC1、AC13、AC14、AC15。

### 9. Extend OmniPanel for local-agent mode

- [x] 复用 `OmniPanelModule.show()`、`buildDesktopContextCapsule()`、selection capture 和 active-app service。
- [x] 增加 memory-only local-agent draft：自由输入、四模板、provider/access、context chips。
- [x] 强制删除/忽略 `ocrText`；不采集 screenshot、window body、clipboard image/files。
- [x] 新增独立 `LocalAiCliPanel` 状态机，避免把 provider protocol 塞进现有同步 `AiPreviewState`。
- [x] 消费 typed task stream，支持 stop/retry、Markdown/text、approval sheet、copy、paste-back、terminal continue。
- [x] 嵌入 xterm terminal surface并同步 fit/resize；现有 placeholder `InteractiveTerminal.vue` 不作为 runtime boundary。
- [x] 面板关闭时取消 task/PTY/approval 并清除 prompt/context/output/session id。

**Acceptance**：AC2、AC10、AC17、AC18、AC20、AC22、AC23。

### 10. Wire CoreBox, shortcut and explicit paste-back

- [x] 在 CoreBox input actions 区增加 semantic “交给本机代理”按钮；不注册 always-match search provider。
- [x] 新建 `local-ai-cli.quick-open` main shortcut，通过现有 `ShortcutModule` 注册和配置；不复用 retired `core.box.aiQuickCall`。
- [x] CoreBox query 与 global desktop capsule 均进入同一 OmniPanel draft contract。
- [x] 复制操作显式写 clipboard。
- [x] 回填操作复用现有 auto-paste capability：校验 captured target、写 clipboard、隐藏 OmniPanel、恢复/确认目标、模拟 paste。
- [x] 原应用/窗口失效、Accessibility denied 或 target drift 时安全失败，不向未知窗口输入。

**Acceptance**：AC12、AC17、AC18、AC19。

## Verification Commands

在实现对应阶段后运行最小 focused gate；最后一次才运行完整范围。

```bash
# Focused contracts/runtime/UI
corepack pnpm -C "apps/core-app" exec vitest run \
  src/main/modules/local-ai-cli \
  src/main/modules/omni-panel \
  src/main/modules/global-shortcon.test.ts \
  src/renderer/src/views/omni-panel \
  src/renderer/src/views/base/settings/SettingLocalAiCli.test.ts

# Shared transport/sdk contracts
corepack pnpm -F "@talex-touch/utils" test -- --run \
  transport-domain-sdks local-ai-cli

# Type and scoped lint
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
corepack pnpm -C "apps/core-app" exec eslint \
  src/main/modules/local-ai-cli \
  src/main/modules/omni-panel \
  src/renderer/src/views/omni-panel \
  src/renderer/src/views/base/settings/SettingLocalAiCli.vue \
  --max-warnings=0

# Production bundles and unpacked native runtime
corepack pnpm -C "apps/core-app" run build:vite
corepack pnpm -C "apps/core-app" run build:unpack
```

## End-to-End Verification

1. Launch without env gate: no setting/action/shortcut; forged start request fails before spawn.
2. Launch with `TUFF_ENABLE_LOCAL_AI_CLI=1`: setting appears, feature remains off.
3. Trigger from CoreBox while off: draft preserved, Settings opens, no child process.
4. Enable one provider, return, run explicit quick reply: stream and result visible.
5. Repeat for Pi/Codex/Claude/OMP using real local authentication.
6. Test selected text + clipboard + active app/window chips; remove each and inspect final prompt fixture.
7. Test copy and paste-back into a controlled text target; switch target before paste and verify safe failure.
8. Test task cancel, PTY resize/input/exit/kill and app quit; verify no descendant process remains.
9. Exercise one allow and one deny approval on each provider/mode that reports write support; unsupported modes remain visibly read-only.
10. Run unpacked/package app with native PTY smoke and visually verify Settings, compact result, approval sheet and expanded terminal.

## Verification Evidence

- 聚焦 OmniPanel/本机代理测试：5 files、51 tests 通过；Node 与 Web 类型检查、作用域 ESLint 通过。
- `build:vite` 与 `electron-builder --dir` 均通过；打包应用内四个 provider 探测成功。
- 冷启动 OmniPanel renderer 握手在 2,108 ms 内返回，草稿 `COLD_HANDSHAKE_OK` 完整到达。
- 打包 Pi 任务返回 `PI_FINAL_OK`；原生 session 续接 PTY 接收键盘输入并返回 `PI_PTY_FINAL_OK`。
- Codex `workspace-write` 使用 `untrusted` 原生审批策略：批准后写入隔离工作区，拒绝后目标文件不存在。
- 无环境门控、首次启用、四类真实任务流、上下文移除、复制/安全回填、取消/清理及打包视觉界面均完成本机验证。

## Risky Files / Rollback Points

| Area | Risk | Rollback |
| --- | --- | --- |
| `packages/utils` transport events/SDK | Cross-bundle event drift | Revert exact event/SDK slice; no legacy alias. |
| `app-settings.ts` + main normalizer | Feature may appear enabled after malformed state | Defaults remain false; gate off makes persisted data inert. |
| OmniPanel main/renderer | Selection focus and paste target regressions | Keep existing AI actions unchanged; local-agent mode behind separate branch/gate. |
| Provider adapters | CLI version/protocol drift | Capability probe marks adapter unavailable/read-only; never reinterpret unknown events. |
| `node-pty` packaging | Dev works, package missing binding | Block package acceptance; task mode remains separately diagnosable. |
| Global shortcut | Conflict with existing OmniPanel/CoreBox shortcuts | Existing shortcut status UI reports conflict; unregister local id on module destroy. |

## Review Gates Before Task Start

- [x] User approves `prd.md`, `design.md` and this plan.
- [x] No unresolved product questions remain.
- [x] Provider approval capability semantics are accepted as per-version/per-mode, not “all four always writable”.
- [x] Implementation starts only after Trellis task activation.
