# PI-Desktop 竞品对比分析与吸收建议

> 日期：2026-09-14（在 2026-09-12 初版基础上复核）
> 对象：[`vastsa/PI-Desktop`](https://github.com/vastsa/PI-Desktop)（LGPL-3.0，v0.14.6，Early Preview）
> 本仓核对基线：`a37a04e91`（本次迁移代码仍在当前工作树，未推送）。
> 性质：持续调研、迁移复盘与候选排序；§4 以 2026-09-14 本地实现为准。

## 0. 一句话定性

两者**都长在 `pi` 上，但长在不同的根部**：

| | Tuff（本仓） | PI-Desktop |
| --- | --- | --- |
| 内核隐喻 | **桌面能力中枢**（launcher / OS 层） | **编码智能体工作台**（项目工作区） |
| 主动作 | 全局唤起 → 搜索/命令/分派到插件与系统能力 | 打开项目 → 与同一个 Agent 多轮会话 |
| Agent 的位置 | 能力面之上的一层消费方（当前为 Beta） | 产品本体（Agent / Plan / Goal 三态） |
| 许可证 | MPL-2.0 | **LGPL-3.0** |
| 体量 | — | 3.3k★ / 251 fork / TypeScript（GitHub 当前仓库页） | 规模与产品形态都明显不同 |

## 1. 功能侧重与场景差异

| 维度 | Tuff | PI-Desktop | 差异性质 |
| --- | --- | --- | --- |
| 入口范式 | `⌘E` CoreBox 全局搜索、OmniPanel、DivisionBox、快捷抽屉、快操作 | Composer（会话输入框）+ 侧栏会话/项目 | 互补：Tuff 是"随处唤起一次"，PI 是"进入工作区待着" |
| 命令面板地位 | 核心产品面（features / searchProviders / 分派） | 刻意收窄：内置命令**只有 5 条**，且明确把 app 导航、设置、插件管理排除在命令契约之外（`docs/spec/04-ux/04-builtin-commands.md:3-4`） | 路线分歧：PI 不做 launcher |
| 核心对象 | Project / Conversation + provider-native session pointer；Pointer 只保存本机 opaque 元数据 | Project/Workspace → Session → Turn（会话绑定项目，工具根绑定会话） | 数据模型不同，但 Tuff 已具备项目与原生会话续接边界 |
| 文件/应用/剪贴板/截图/OCR/翻译 | 一等公民（clipboard / screenshot / ocr / calculation / flow-bus 等主进程模块） | 有 `clipboard-history.ts`(4.6 KB)、`fs-index.ts`(5.4 KB)，但为主进程内部用途，无产品面 | Tuff 独有 |
| 写代码 / 跑测试 / 改仓库 | 有 `terminal` 模块与 tool-gateway，但非产品主线 | 本体能力：Read / Glob / Grep / Write / Edit / Bash + 审批 + 自验证 | PI 独有 |
| 语音听写 | 实时 ASR + 文件 STT + AI 润色（`packages/tuff-voice`、`voice-provider-runtime.ts:29-175`、`polish-prompt.ts:3-42`） | 完全缺失 | Tuff 护城河 |
| Agent 契约与审批 | 有 `plan` task type、`approvalMode: manual/preauthorized` 与预算/工具白名单；尚无 PI 式不可变 Plan/Goal 文件工件和重启 fence | `SubmitPlan/SubmitGoal` → host 写入不可变 `<root>/.pi/plan/*.md`（记录 path/hash/size）+ 独立审批行 + 重启不重放 fence | PI 在契约审批工件上领先 |
| 产出物审阅 | 已有会话内 artifact / widget / tool-call / source 预览索引与侧栏；尚无 PI 式 host-owned diff snapshot + hash rollback | 工作面板（Review / Browser / Files），会话级 panel context，消息级 diff 快照 + 受保护回滚 | Tuff 有投影面，PI 在可回滚变更审阅上领先 |
| 定时 / 自动化 | 已有 `ai-automation-scheduler.ts`、审批模式、工具/MCP/Agent 白名单与预算 | Scheduled 页（cadence / 手动 Run now；无人值守拒绝 Plan/Goal 任务） | 基本对等，PI 的 UI/契约可借鉴但不是空白 |
| 存量迁移 | 已有 AI CLI 配置/MCP/skill 导入；本次新增每项目显式发现并接管 Pi/OMP/Claude/Codex 原生会话 | 导入 Claude Code / Codex / OpenCode / Pi 的会话 | 已从“各有侧重”收敛为 Tuff 具备显式 adoption，仍不复制 transcript |


## 2. 架构对照

```mermaid
flowchart TB
  subgraph Tuff
    T1["Renderer (Vue / tuffex)"] --> T2["Electron Main 模块总线"]
    T2 --> T3["utilityProcess 插件宿主<br/>capability 白名单 + permission guard"]
    T2 --> T4["loopback tool-gateway<br/>per-session bearer"]
    T4 -.工具转发.-> T5["外部 pi CLI 子进程<br/>Home: --session/--session-id；其他调用：--no-session<br/>Pi transcript 权威，Tuff 保存 opaque pointer"]
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
   - Tuff：`permission id + 逐次请求 deny / session / always`（`apps/core-app/src/renderer/src/modules/permission/permission-request-card.ts:9-33`），没有 PI 式声明式范围。

## 3. 各自独有

### 3.1 Tuff 独有

- 系统能力面：剪贴板历史与标签、截图、OCR、下载中心、快速操作、flow-bus 工作流、omni-panel / division-box。
- 多能力路由：`text.chat / translate / embedding / audio.asr / audio.stt / tts / vision.ocr` 统一 capability binding（`packages/utils/types/intelligence.ts:330-433,2781-2916`）。
- 语音全链路：三个 ASR provider + 润色 + 跨应用写回。
- **插件供应链更成熟**：Ed25519 签名 + Nexus attestation + 发布资格门禁 + `.tpex` + 多源（GitHub / NPM / TPEX / File）（`packages/utils/plugin/signing.ts:1-105`、`apps/nexus/server/utils/pluginReleaseEligibility.ts:53-99`）。
- 插件宿主能力面更宽：browser / CDP、orca、sessions、quickOps、i18n / lexicon、divisionBox 等（`plugin-host-wire.ts:3-69`）。
- 运行时隔离已成型：utilityProcess 空 env + 128 MB oldspace + 全生命周期超时（`plugin-runtime-electron-process.ts:18-32,173-193`、`plugin-runtime-host.ts:65-101`）；插件视图剥离调用方 preload/partition 并隔离分区（`plugin-view-host.ts:38-74`）。

### 3.2 PI-Desktop 独有
- 单一 Agent × 三态契约（Agent / Plan / Goal）+ host-owned 不可变审批工件 + 启动 fence 不重放：仍是 PI 的主要领先项，Tuff 只有 workflow/automation approval。
- 会话级权限模式（ask / accept-edits / auto）+ 按 toolName 的 session grant：Tuff 已有 plugin permission id 与逐次授权，但没有完全等价的 Agent session mode。
- 工作面板产出物模型：artifact 原子创建 → Review / Browser / Files tab；会话级保留；后台会话产物不抢焦点：Tuff 有 preview artifact/widget/tool/source 投影，diff snapshot/rollback 仍是 PI 独有。
- 上下文预算治理与子代理：Tuff 已有 context hygiene/CAS、`agent.delegate`、scheduler、并发/预算/审批；PI 的 `new_context` 与完整工作台 UX 仍可借鉴。
- 会话 fork / branch / pin / archive / sort、Subagents：Tuff 已有项目/会话 pin/archive 等部分组织能力，但 fork/branch 与 PI 的完整工作台仍缺。
- 持久通知 inbox：PI 的 bounded completion/failure 语义可比较，但 Tuff 已有 host-owned inbox（`apps/core-app/src/main/modules/notification.ts:35-103`）；不是空白迁移项。
- 工程化纪律：protocol / schema / ADR / E2E 资产可借鉴流程，不应复制 PI 的 LGPL 源码或整套 Rust host-core。

## 4. 吸收候选（按 2026-09-14 状态排序）

### 4.1 已迁入或已有等价能力

| 能力 | 当前状态与证据 |
| --- | --- |
| 项目与原生会话发现 | **已迁入**。`apps/core-app/src/main/modules/local-ai-cli/native-session-discovery.ts:529-599` 对四类 provider 做有界、稳定文件读取，只接受 canonical cwd 等于既有 Project 根；`local-ai-cli/index.ts:327-346` 是 host-only 的显式 `session.discover`，不创建项目。 |
| Home Pi 原生会话权威 | **已迁入**。`apps/core-app/src/main/modules/ai/providers/pi-cli-provider.ts:222-357` 将 Home 会话映射为 opaque pointer，首次使用 `--session-id`、续接使用 `--session`，校验 Pi head/cwd/JSONL 分叉；非 Home 调用仍保持临时会话。 |
| 项目/会话归属与本地隔离 | **已部分迁入并覆盖本次路径**。`project-store.ts:49-110` canonicalize 目录并按根路径去重；`conversation-store.ts:90-123` 同步时保留本地 project ownership；通用 agent 执行仍需继续把 durable session workspace 从 metadata 统一收敛为 host-owned root。 |
| 上下文预算与压缩快照 | **已有，不应再列为完全缺失**。`intelligence-context-hygiene.ts:1348-1467` 做 token-budget pruning、压缩快照读取与 degraded projection；`:1729-1902` 以事务 + `updated_at` CAS 写入 snapshot/checkpoint。缺口是自动模型摘要触发与用户可见的 compact/recover UX，不是从零移植。 |
| 委派与后台自动化 | **已有受治理实现**。`ai-cli-orchestrator.ts:1803-1868` 的 `agent.delegate` 先规范化 plan、写入事件并等待 approval；`:1967-1988` 限制 `maxChildRuns`；scheduler 另有 manual/preauthorized 与 MCP/Agent/tool 白名单。缺口是面向普通 Home 用户的完整委派 UX，而非 PI 能力不存在。 |
| Skills / MCP / feature registry | **已有宿主边界**。`tool-gateway/agent-context-source.ts:37-64,99-160` 只读 active imported skills/MCP 并按 profile 调用；`packages/tuff-intelligence/src/registry/skill-registry.ts:1-65` 已有 skill metadata/tools/permissions；plugin business capability 在 `plugin-business-capabilities.ts:1048-1143,1221-1241` 做结构化投影和校验。PI 的 `manifest.mcp/skills/tools` 聚合字段不是当前 Tuff manifest 合同。 |
| 会话产物预览 | **有较窄等价能力**。`renderer/src/modules/conversation/preview-index.ts:21-75,212-250` 将真实 message parts 投影为 artifacts/widgets/toolCalls/sources；`HomeSidePanel.vue:12-43,66-96` 提供会话级面板。尚未宣称具备 PI 的 diff/rollback。 |

### 4.2 推荐后续迁入（按优先级）

| 优先级 / 能力 | Tuff ownership boundary 与用户价值 | 成本 / 风险 / 依赖 | 验收证据 |
| --- | --- | --- | --- |
| P1 — host-owned Plan/Goal 不可变审批工件 | 由 Main/SQLite + project root 持有 exact Markdown、sha256、size、kind、approval 与 execution epoch；renderer 只显示投影。把当前 `approvalMode` 的“允许执行”变成可审计、可恢复、重启不重放的用户流程。 | 中；不能复制 PI 源码，必须与现有 `AiAutomation`/`agent.delegate` 审批语义合并，避免第二套权限。依赖 durable Agent turn/session identity。 | Plan/Goal 提交生成唯一文件与 hash；拒绝/过期/崩溃不执行；重启不重放；批准后仅一次进入执行；SQLite/file hash 与 renderer 事件一致。PI 参考：[`03-tools-and-permissions.md` §2, §10.1](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/03-runtime/03-tools-and-permissions.md)。 |
| P1 — Tuff 本地 MCP control plane | 在 Electron Main 增加 opt-in、loopback-only、bearer-auth 的 Streamable HTTP MCP；每个 named/generic operation 复用现有 typed main handler，排除 secrets/provider writes/native pickers。用户可用本机外部 agent 驱动项目、会话、Agent，而不暴露远程控制。 | 中高；新攻击面和 token 文件权限是主风险，必须默认关闭、loopback、bounded payload、dangerous `confirm`、secret stripping。依赖稳定的 Project/Conversation/Agent SDK；不要把现有 tool-gateway 误当外部 MCP server。 | 无环境变量时无监听；启用后只绑定 `127.0.0.1`；无 token/Origin/危险确认拒绝；外部 mutating call 复用同一 session/project changed event；secret channels 不在 catalog。PI 参考：[ADR 0203](https://github.com/vastsa/PI-Desktop/blob/main/docs/adr/0203-local-mcp-control-plane.md)。 |
| P1 — durable session workspace root | 将 orchestrator/task/tool 的 workspace 从可变 `workingDirectory` 元数据收敛到 host-owned session/project tuple；background turn 不随当前 sidebar project 改根。已完成的 Local AI pointer/canonical Project root 作为同一策略的入口。 | 中；属于安全边界，必须迁移所有 caller，不能只加 fallback。依赖 session identity、workspace containment、plugin/MCP path policy。 | 切换项目时后台任务仍改原项目；symlink/`..` 逃逸拒绝；旧/缺失 session 不回落当前选中项目；跨 provider/session root 绑定冲突可解释。PI 参考：[03-tools-and-permissions.md §4](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/03-runtime/03-tools-and-permissions.md)。 |
| P2 — host-owned Review diff snapshot + rollback | 扩展现有真实 artifact projection：Main 在 Write/Edit 成功后保存 previous bytes、post hash、bounded hunks 和 messageId；renderer 只呈现；rollback 由 Main 做 hash guard。价值是把“AI 改了文件”变成可审阅、可撤销结果。 | 中高；磁盘、二进制/大文件、并发编辑与隐私清理复杂，不能把 Git HEAD 当 snapshot。依赖统一 workspace root 与 mutation serialization。 | 成功 workspace mutation 有 diff；scratch/失败/拒绝无 review；当前 hash 漂移时 rollback 返回 conflict 且不写文件；source/destination move 原子恢复；session 删除清理 snapshot。PI 参考：[03-tools-and-permissions.md §4c-4d](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/03-runtime/03-tools-and-permissions.md)。 |
| P2 — native fork / branch | 在 conversation Main store 新增原子 fork API，复制 Tuff 可见记录并显式声明“不复制 provider-native transcript/pointer”；若要 fork Pi 原生上下文，另起 provider-owned session，不能复用同一 native id。价值是探索分支，不污染主线程。 | 中；复制消息/附件/工具 parts 的隐私与 storage 成本；不能伪造 parent lineage 或让 fork 共享 native lease。依赖会话快照、project ownership、UI selection transaction。 | source busy 时拒绝；child 原子可见或完全不见；child 新 pointer/lease；source 与 child 后续互不影响；删除 child 不删 source/provider transcript。PI 参考：[ADR 0023](https://github.com/vastsa/PI-Desktop/blob/main/docs/adr/0023-independent-conversation-session-fork.md)。 |
| P2 — automatic context compaction UX | 复用现有 hygiene service/CAS，增加 turn-boundary 的模型摘要触发、可追溯 checkpoint、失败降级，而非重写 Tuff 的已有 snapshot store。价值是长会话稳定性。 | 中；摘要本身可能泄露或产生错误事实，必须复用 privacy/fact confidence gates。依赖 active model context window 和 durable session turns。 | 长会话自动生成一次 checkpoint；CAS 冲突不覆盖新 turn；secret/low-confidence/rejected summary 不进入 context；失败继续可用并带 degraded reason。PI 参考：[03-tools-and-permissions.md §10.1](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/03-runtime/03-tools-and-permissions.md)。 |

### 4.3 Later / rejected

| 能力 | 结论与原因 |
| --- | --- |
| Notification inbox parity | **已有等价基础，不迁移 PI UI**。Tuff `NotificationInboxStore` 已持久化、去重、分页、未读/归档/清除；后续只需按 Tuff 的 notification ownership 与 background session 语义补齐差异，不能重复造第二个 Bell/Popover。参考：[09-interaction-patterns.md §20](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/04-ux/09-interaction-patterns.md)。
| 第三方 `pi` extension 直接进入 Agent 进程 | **Rejected for default Tuff runtime**。PI 依赖 high-risk `agent.extension` 信任；Tuff 的插件 utility-process、host capability/permission 与 imported skill/MCP 已把能力留在宿主。若未来开放，只能做签名、版本、权限、隔离和 kill/revoke 完整的 opt-in profile，不能把任意扩展塞入 provider 进程。参考：[trusted-extensions](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/07-plugins/16-trusted-extensions.md)。 |
| PI 全套 IDE 工作台 / Rust host-core 重写 | **Rejected**。Tuff 的产品主线是全局唤起、系统能力和跨应用写回；复制 sidebar/work panel/settings 的全部形态会扩大常驻 UI 与维护面，且 LGPL 源码不可直接移植。只吸收可验证的安全/持久化契约。 |
| PI 的命令面板、Projects/Import/Skills/MCP/Subagents IA | **Overlapping / selectively adopt**。Tuff 已有 CoreBox、Projects、AI import、skill/MCP runtime 和 Agent orchestrator；只迁入缺失的 contract/acceptance，不另造第二套导航或 manifest。 |

### 4.4 权限语义纠正

旧稿把 `enforcePermissions=false` 写成了“关闭强制、因此不拦截”，这是错误的。Tuff `packages/utils/permission/index.ts:115-123` 在该状态直接返回 `false`；Main 的 `permission-store.ts:597-604` 也把 SDK 不兼容标记为拒绝，只有 `DEFAULT_PERMISSIONS` 的明确条目在 `:606-611` 默认允许。当前真实缺口是**没有 PI 式声明式 path/domain scope**，不是一个待关闭的 fail-open 总开关；新增 scope 时仍需保持未声明、越界、过期和错误解析全部 fail-closed。

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

## 7. 结论与可拆分任务

本轮结论不是“把 PI-Desktop 全部搬进 Tuff”，而是：**项目与原生会话能力已迁入；剩余最高价值是 host-owned 审批、外部本地 MCP、统一 durable workspace root；Review rollback、fork、自动压缩 UX 排在其后。**

建议按以下顺序拆成独立 Trellis 任务：

1. **Plan/Goal 审批工件**：先冻结数据模型、重启恢复和一次性 execution epoch，再接入现有 `approvalMode`/orchestrator，禁止新建平行授权体系。
2. **Local MCP control plane**：先做 opt-in loopback + token + operation catalog，再做外部客户端 smoke；默认不开启远程能力。
3. **Durable workspace root**：把所有 agent/tool/MCP/skill 调用的 root 由 durable session/project authority 统一解析，完成 background-switch 与 symlink/escape 矩阵。
4. **Review diff/rollback**：先只覆盖 workspace Write/Edit，采用 host-owned previous bytes + post-hash CAS；scratch、失败、拒绝和漂移必须无副作用。
5. **Native fork**：先定义“复制 Tuff 可见记录、绝不复用 provider-native id”的边界，再做原子 child selection。
6. **Automatic compaction UX**：复用现有 snapshot/checkpoint/CAS，补 turn-boundary 触发和 degraded UX，不重写 context store。

通知收件箱、第三方 `pi` extension 直入 Agent 进程、PI 全套 IDE/Rust host-core 暂不迁入，原因分别是先缺统一通知/保留策略、违背 Tuff 宿主掌权与隔离边界、以及产品形态和许可证/维护成本不匹配。
