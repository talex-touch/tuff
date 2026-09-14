# PI-Desktop 竞品对比分析与吸收建议

> 日期：2026-09-12
> 对象：[`vastsa/PI-Desktop`](https://github.com/vastsa/PI-Desktop)（LGPL-3.0，v0.14.6，Early Preview）
> 本仓基线：`origin/master` @ `7fe51c791`
> 性质：只读调研与方案草案，**未改动任何产品代码**。安装与运行证据见 §6。

## 0. 一句话定性

两者**都长在 `pi` 上，但长在不同的根部**：

| | Tuff（本仓） | PI-Desktop |
| --- | --- | --- |
| 内核隐喻 | **桌面能力中枢**（launcher / OS 层） | **编码智能体工作台**（项目工作区） |
| 主动作 | 全局唤起 → 搜索/命令/分派到插件与系统能力 | 打开项目 → 与同一个 Agent 多轮会话 |
| Agent 的位置 | 能力面之上的一层消费方（当前为 Beta） | 产品本体（Agent / Plan / Goal 三态） |
| 许可证 | MPL-2.0 | **LGPL-3.0** |
| 体量 | — | 3.0k★ / 232 fork / 56 open issue / ~50 MB 仓库 / TypeScript |

## 1. 功能侧重与场景差异

| 维度 | Tuff | PI-Desktop | 差异性质 |
| --- | --- | --- | --- |
| 入口范式 | `⌘E` CoreBox 全局搜索、OmniPanel、DivisionBox、快捷抽屉、快操作 | Composer（会话输入框）+ 侧栏会话/项目 | 互补：Tuff 是"随处唤起一次"，PI 是"进入工作区待着" |
| 命令面板地位 | 核心产品面（features / searchProviders / 分派） | 刻意收窄：内置命令**只有 5 条**，且明确把 app 导航、设置、插件管理排除在命令契约之外（`docs/spec/04-ux/04-builtin-commands.md:3-4`） | 路线分歧：PI 不做 launcher |
| 核心对象 | 系统能力 + 插件 feature（`packages/utils/plugin/index.ts:572-749`） | Project/Workspace → Session → Turn（会话绑定项目，工具根绑定会话） | 数据模型不同 |
| 文件/应用/剪贴板/截图/OCR/翻译 | 一等公民（clipboard / screenshot / ocr / calculation / flow-bus 等主进程模块） | 有 `clipboard-history.ts`(4.6 KB)、`fs-index.ts`(5.4 KB)，但为主进程内部用途，无产品面 | Tuff 独有 |
| 写代码 / 跑测试 / 改仓库 | 有 `terminal` 模块与 tool-gateway，但非产品主线 | 本体能力：Read / Glob / Grep / Write / Edit / Bash + 审批 + 自验证 | PI 独有 |
| 语音听写 | 实时 ASR + 文件 STT + AI 润色（`packages/tuff-voice`、`voice-provider-runtime.ts:29-175`、`polish-prompt.ts:3-42`） | 完全缺失 | Tuff 护城河 |
| Agent 契约与审批 | 有 `plan` task type 与 `approvalMode: manual/preauthorized`（`agent-manager.ts:242`、`ai-automation-scheduler.test.ts:64,241`），无 host-owned 不可变审批工件 | `SubmitPlan/SubmitGoal` → host 写入不可变 `<root>/.pi/plan/*.md`（记录 path/hash/size）+ 独立审批行 + 重启不重放 fence | PI 明显领先 |
| 产出物审阅 | 会话内 chart / form 卡片工具（`tuff_render_chart`、`tuff_render_form`） | 工作面板（Review / Browser / Files），会话级 panel context，消息级 diff 快照 + 受保护回滚 | PI 领先 |
| 定时 / 自动化 | 已有 `ai-automation-scheduler.ts` + 工作流 `approvalPolicy.autoApproveReadOnly` | Scheduled 页（cadence / 手动 Run now；无人值守拒绝 Plan/Goal 任务） | 基本对等 |
| 存量迁移 | `ai-cli-import-service.ts`（扫描/导入 AI CLI 配置 + MCP profile） | 导入 Claude Code / Codex / OpenCode / Pi 的**会话** | 各有侧重 |

## 2. 架构对照

```mermaid
flowchart TB
  subgraph Tuff
    T1["Renderer (Vue / tuffex)"] --> T2["Electron Main 模块总线"]
    T2 --> T3["utilityProcess 插件宿主<br/>capability 白名单 + permission guard"]
    T2 --> T4["loopback tool-gateway<br/>per-session bearer"]
    T4 -.工具转发.-> T5["外部 pi CLI 子进程<br/>--no-session，历史归 Tuff"]
    T2 --> T6["SQLite: conversations / aiAgentProfiles /<br/>aiOrchestratorRuns / automations"]
  end

  subgraph PID["PI-Desktop"]
    P1["React Renderer（无 Node 集成）"] --> P2["Electron Main（薄编排）"]
    P2 --> P3["Rust host-core<br/>权限裁决 / 工具执行 / SQLite / secrets"]
    P2 --> P4["Node pi sidecar<br/>pi-ai + pi-agent-core"]
    P4 <--> P3
    P4 -.第三方 pi extension（agent.extension 高信任）.-> P4
  end
```

### 2.1 三条关键分歧轴

1. **信任边界方向**
   - Tuff：能力**始终**留在宿主，agent/插件只能请求，强制过确认门（`packages/pi-extension-tuff/README.md:4-6`）。
   - PI：`contributes.agentExtensions` 允许**第三方代码进入 agent 进程**执行（`docs/spec/07-plugins/16-trusted-extensions.md:2-3`），用一条 high-risk `agent.extension` 授权换取能力上限。
2. **同一 API 的两个生态位**
   - PI 的扩展契约就是 `@earendil-works/pi-coding-agent` 的 `ExtensionAPI`；Tuff 的 `packages/pi-extension-tuff/index.ts:34-36,371-381` 消费的也是 `registerTool` 同一 API。
   - 结论：**两边已经站在同一个扩展 API 上**，差别只在"谁能贡献扩展 + 以什么信任级别运行"。
3. **权限粒度**
   - PI：`permission + manifest 声明的范围`（`fs.read/write/delete` scope、`net.domains`），越界才询问，字段缺失即 fail-closed（`docs/spec/07-plugins/13-plugin-permissions-matrix.md:47-60`）。
   - Tuff：`permission id + 逐次请求 deny / session / always`（`permission-request-card.ts:9-33`），没有声明式范围。

## 3. 各自独有

### 3.1 Tuff 独有

- 系统能力面：剪贴板历史与标签、截图、OCR、下载中心、快速操作、flow-bus 工作流、omni-panel / division-box。
- 多能力路由：`text.chat / translate / embedding / audio.asr / audio.stt / tts / vision.ocr` 统一 capability binding（`packages/utils/types/intelligence.ts:330-433,2781-2916`）。
- 语音全链路：三个 ASR provider + 润色 + 跨应用写回。
- **插件供应链更成熟**：Ed25519 签名 + Nexus attestation + 发布资格门禁 + `.tpex` + 多源（GitHub / NPM / TPEX / File）（`packages/utils/plugin/signing.ts:1-105`、`apps/nexus/server/utils/pluginReleaseEligibility.ts:53-99`）。
- 插件宿主能力面更宽：browser / CDP、orca、sessions、quickOps、i18n / lexicon、divisionBox 等（`plugin-host-wire.ts:3-69`）。
- 运行时隔离已成型：utilityProcess 空 env + 128 MB oldspace + 全生命周期超时（`plugin-runtime-electron-process.ts:18-32,173-193`、`plugin-runtime-host.ts:65-101`）；插件视图剥离调用方 preload/partition 并隔离分区（`plugin-view-host.ts:38-74`）。

### 3.2 PI-Desktop 独有

- 单一 Agent × 三态契约（Agent / Plan / Goal）+ host-owned 不可变审批工件 + 启动 fence 不重放。
- 会话级权限模式（ask / accept-edits / auto）+ 按 toolName 的 session grant。
- 工作面板产出物模型：artifact 原子创建 → Review / Browser / Files tab；会话级保留；后台会话产物不抢焦点。
- 上下文预算治理：turn-boundary checkpoint 压缩、`new_context` 工具、溢出一轮重试、durable retained-tail 回退。
- 会话 fork / branch / pin / archive / sort、Subagents（`~/.agents/subagents`）、通知收件箱（只报失败）。
- 本地 loopback MCP 控制面：让**外部** agent 驱动桌面操作（`docs/spec/02-architecture/01-architecture.md` §3.6）。
- 工程化纪律：protocol v11 / schema v15 版本化、ADR + 决策日志、每请求 1 worktree 的 AGENTS 规则、E2E 计划、架构棘轮（`AGENTS.md:2-6`）。

## 4. 吸收候选（按性价比排序，均未实施）

| # | 吸收项 | 落点 | 成本 | 风险 / 边界 |
| --- | --- | --- | --- | --- |
| 1 | host-owned 契约与不可变审批工件（Plan 提交 → `.md` + hash + 审批行 + 重启不重放） | `apps/core-app/src/main/modules/ai/agents/agent-manager.ts` 的 `plan` 分支 + `ai-orchestrator-store` | 中 | 纯设计可借鉴；需与现有 `approvalMode` 语义合并而非并存 |
| 2 | 会话/任务级工作根绑定（工具根随会话，不随当前聚焦窗口） | `apps/core-app/src/main/modules/tool-gateway/*` 的路径裁决 | 低 | 直接消除"点错窗口就改错目录"一类缺陷 |
| 3 | 声明式权限范围（manifest 声明 fs scope / net domains，越界再问，缺失即拒） | `packages/utils/permission/*` + manifest schema | 中 | 与现有 permission id 体系叠加，不改插件作者既有写法；需同时收口 fail-open 开关（见 §4.1） |
| 4 | 产出物审阅面（会话内 artifact → 独立审阅面板 + diff 快照 + 可回滚） | 新 renderer 面 + 现有 conversation store | 中高 | 必须与 Tuff"轻量唤起"的交互哲学调和，避免做成 IDE |
| 5 | 上下文自动压缩策略 | `apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts` | 中 | 已有 CAS + 降级语义，可复用 |
| 6 | 子代理 / 后台委派 | `modules/ai/agents/` + 运行记录表 | 中高 | 需先定并发与配额边界 |
| 7 | pi extension 作为第三方贡献点 | 插件 manifest + `plugin-host-wire` | 高 | 直接触碰信任模型；建议只对本地/开发插件开放，对齐 PI 的 v1.1 保守做法 |

### 4.1 一条需要留意的反向缺口

Tuff 的权限判定存在"全局关闭强制"的开关语义（`enforcePermissions=false` 时 `hasPermission` 恒为假，即不拦截），而 PI-Desktop 的范围字段是**缺失即拒绝**。若实施第 3 项，必须同时盘清这个 fail-open 出口，否则新的范围字段会被同一个开关整体绕过。

## 5. 合规边界

- PI-Desktop 为 **LGPL-3.0**，Tuff 为 **MPL-2.0**。
- 借鉴**设计 / 协议 / 决策**（Plan 工件格式、权限矩阵、面板模型）→ 无许可证传染。
- **复制其源码文件**进 Tuff → 该文件仍受 LGPL-3.0；与 MPL-2.0 混合分发需在发布物中标注许可并保证对应源码可得。若确需移植代码，走"独立重写同语义实现"。

## 6. 本机安装与运行证据（2026-09-12）

| 项 | 结果 |
| --- | --- |
| 版本 / 资产 | `v0.14.6`，`PI-Desktop-0.14.6-arm64-mac.zip` |
| SHA-256 | `d1e03824fce489fb9e74dcc6c5ccdd783ef1bfe549d8b5d39d6124fcaf44a290` |
| 架构 | 主程序与 `Contents/Resources/bin/pi-desktop-host-core` 均为 `Mach-O 64-bit executable arm64` |
| 签名 | adhoc / linker-signed，无 Developer ID，无 TeamIdentifier（与 `README.md:353` 声明的"tagged release 默认未签名"一致） |
| 公证 | 无。`spctl` 报 `code has no resources but signature indicates they must be present` |
| 落地 | `ditto PI-Desktop.app /Applications/PI-Desktop.app` |
| 首次启动 | 未触发"已损坏"弹窗：`gh` 下载不写 `com.apple.quarantine`，仅有 `com.apple.provenance`，故 README 的 `xattr -r -d` 步骤本次不需要 |
| 运行进程 | 主进程 + `pi-desktop-host`（Rust host-core）+ `agent-runtime/sidecar.js`（pi Agent sidecar）+ 6 个 Helper |
| 窗口 | 位置 `(428,201)`，尺寸 `1200×800`，未最小化 |
| 崩溃 | 无（`~/Library/Logs/DiagnosticReports` 无 PI-Desktop 记录） |
| 随包插件 | `Contents/Resources/plugins/` 内含 `pi.advisor`、`pi.browser`、`pi.files` |

**未完成的验证（如实记录）**：`screencapture` 被系统拒绝（`could not create image from display`，终端无「屏幕录制」权限），AX 树读不到 Chromium 文本，因此"窗口可见"是基于窗口几何 + 进程树 + 首次启动无弹窗的推断，**未获得像素级截图**。

## 7. 待决问题

1. "融入 PI-Desktop 的内容"具体指哪一层？
   - (a) 只吸收契约层与安全层（§4 第 1–3 项）；
   - (b) 先做第 2 项（成本最低、可立即验证）；
   - (c) 整体搬入 PI 式的**项目会话工作台**。若选 (c)，需先回答数据模型问题：新增一个"工作区"目的地，还是把 CoreBox 的智能体结果升级为可长期驻留的会话？
2. 是否接受"吸收契约层与安全层、不吸收产品形态"的取向（当前建议）。
