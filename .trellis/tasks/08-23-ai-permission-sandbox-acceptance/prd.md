# AI 权限与沙盒全链路验收

## Goal

以唯一终态审计、权威权限边界和可重复运行证据，验收用户入口到 Provider、工具、配额、沙盒和敏感数据生命周期的完整 AI 链路。

## Confirmed Baseline Facts

以下为规划时基线；已修项以 Acceptance Criteria 和 Current Acceptance Matrix 为准。

- Provider credential 已由 main-owned secure store 管理，普通配置只保留脱敏 metadata；保存、删除和失败回滚已有聚焦测试。
- 非流式 `invoke()` 在 primary success、fallback success 和 terminal failure 写 Intelligence audit；`stream()` 当前不写任何成功或失败 audit。
- Home conversation 正常路径优先使用 `stream()`；仅首内容前失败时才回退非流式调用，因此正常对话的 usage、cost 和长期配额事实源会系统性漏记。
- Intelligence usage/cost 由 audit flush 与 usage-stats 同事务聚合；minute burst admission 不能替代日/月 token 与 cost 账本。
- 工具 gateway 已具备 loopback bearer、逐次确认、read-only remember scope、超时拒绝和 host-only mode；部分 tool/MCP 原始异常仍会进入日志或模型，且缺少可关联的 call/decision/result 审计。
- 官方 child-process 插件 capability gateway 会按 authoritative activation、permission、revoke、timeout 和 abort fail-closed。
- renderer plugin Intelligence facade 已被官方 Translation 等插件使用，不能删除；但 plugin-facing event allowlist 尚未覆盖其间接 domain SDK 事件，通用 Intelligence registrar 也未显式启用 plugin fail-closed，当前测试存在接口假绿。
- 现有 Nexus invoke smoke mock 了 auth、network 和响应，只能证明本地合同，不能作为真实 Provider 证据。
- 只读基线的 17 个聚焦测试文件共 237 项通过。详细锚点见 `research/ai-permission-audit.md`。

## Requirements

- R1：流式 primary success、fallback success 和 terminal failure 必须各自形成至多一个请求级终态 audit；primary 的可回退失败不得单独计费或制造双账。
- R2：流式 audit 必须采用 Provider 最终返回的 trace、provider、model、usage 和 latency；缺失字段使用稳定安全默认值，不保存 prompt、response、Secret 或原始 Provider 错误。
- R3：取消、consumer early-return 和 outer-governed 调用不得被误记为普通失败或重复执行内层 quota/audit；行为与非流式治理语义一致。
- R4：audit 入库后 usage/cost 聚合和 quota snapshot 必须与流式终态一致；失败、重试和 fallback 不能重复增加 request/token/cost。
- R5：tool/MCP call、confirmation decision 和 result 必须可关联、字段白名单化并使用稳定错误投影；Token、API key、路径、原始参数和 Provider/MCP 异常不得进入日志、模型或证据。
- R6：plugin Intelligence 保留单一、显式的 plugin-safe 事件子集；所有 registrar 必须验证 authoritative plugin identity、sdkapi 和 `intelligence.basic`，runtime/permission 不可用时 fail-closed 且 Provider 调用次数为零。
- R7：synthetic Provider 必须覆盖 typed transport -> permission -> invoke/stream -> audit -> usage/quota 的成功、拒绝、失败、fallback 和取消链路，无需生产密钥。
- R8：真实验收至少覆盖一个隔离 profile 的 Nexus 或 Local/Ollama/Pi Provider，以及 packaged Electron 的授权/拒绝/remember/timeout/cancel 与 secure-store save/relaunch/delete；未执行项保持 blocked，不以 mock 代替。
- R9：证据只保留 bounded timestamps、稳定状态、计数和脱敏标识，不保留凭证、prompt/response、原始日志、真实 profile 或用户内容。

## Acceptance Criteria

- [x] 流式 primary 与 fallback 成功各写且只写一条 success audit，字段取自最终 Provider 终态。证据见 `research/stream-ledger-evidence.md`。
- [x] 首 delta 前全部 Provider 失败、首 delta 后中断各写且只写一条 redacted failure audit；取消、early-return 和 outer-governed 路径不写错误终态或重复账。证据见 `research/stream-ledger-evidence.md`。
- [x] audit flush 后 request/token/cost 聚合与 quota snapshot 可由测试核对，fallback 和失败不重复计数。证据见 `research/stream-ledger-evidence.md`。
- [x] tool/MCP 原始异常经过统一稳定投影，call/decision/result 审计可关联并通过 secret/path canary。证据见 `research/tool-plugin-sandbox-evidence.md`。
- [x] plugin Intelligence facade 的事件子集与 allowlist 一致；unavailable、deny、revoke、sdk mismatch 和 forged identity 均在 Provider 前 fail-closed。证据见 `research/tool-plugin-sandbox-evidence.md`。
- [x] synthetic typed-transport 全链路通过，证明权限、沙盒、Provider、流式、audit 和 quota 的组合行为。证据见 `research/tool-plugin-sandbox-evidence.md`。
- [x] 至少一个真实 Provider 从用户可见入口完成文本与流式调用；固定失败路径覆盖无 Provider、配额耗尽、模型不支持、权限拒绝、超时和取消。`86cbb6b9...6963` 同一物理 `app.asar` 证据见 `research/packaged-ai-acceptance.md`。
- [x] packaged Electron 完成工具确认 UI、secure-store save/relaunch/delete 与敏感数据脱敏 smoke；全隔离 profile credential canary 扫描通过。`86cbb6b9...6963` 同一物理 `app.asar` 证据见 `research/packaged-ai-acceptance.md`。
- [ ] 真实 MCP smoke 仅在显式 opt-in 环境执行；当前环境未 opt-in，保持 blocked，不以 mock 替代。
- [x] Core AI、Utils SDK、plugin-host、tool gateway 聚焦测试，Failure Matrix 85 项回归，CoreApp node/web typecheck、scoped ESLint、privacy inventory 和 `git diff --check` 全绿。证据见 `research/tool-plugin-sandbox-evidence.md` 与 `research/packaged-ai-acceptance.md`。

## Current Acceptance Matrix

| Area                   | Status  | Evidence / Remaining Gate                                                                                                                                                                                  |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider               | passed  | `86cbb6b9...6963` 的隔离 Ollama Provider 完成用户可见 Home 流、标题文本请求、重启恢复与删除；报告为 `evidence/provider-rerun-86cbb6b9-20260826.json`。                                                     |
| Streaming              | passed  | synthetic 唯一终态合同与 packaged 两次 Home stream、取消、post-delta timeout 均闭环。                                                                                                                      |
| Tool confirmation      | passed  | 同 `app.asar` 的 packaged deny/allow/remember/reset/timeout/cancel 6/6 通过，且 call/decision/result 审计可关联；原始报告与截图位于 `evidence/tool-confirmation-rerun-86cbb6b9-20260826/`。                |
| Quota and billing      | passed  | 四条真实成功 audit 与 day/month usage 的 request/token/cost 完全一致；固定失败与 fallback 不重复计数。                                                                                                     |
| Permission and sandbox | partial | child-process、renderer typed transport 与 packaged permission denial 均 fail-closed；真实 MCP 因环境未显式 opt-in 仍 blocked。                                                                            |
| Sensitive lifecycle    | partial | packaged secure-store save/relaunch/delete、bounded 全 profile credential canary 与工具脱敏已通过；orchestrator durable objective/cwd/output 尚无 typed Privacy delete/自动 retention，真实 MCP 也未执行。 |

该证据集的权威 curated manifest 为
`evidence/packaged-ai-evidence-manifest-86cbb6b9-20260826-final.json`。它将三份报告、
六张截图与物理 `app.asar` 绑定为 `packagedEvidenceSet: passed`，同时明确保留
`overallAcceptance: partial/blocked` 及两项未验证范围，不能作为任务完整通过证据。

本地、synthetic 与当前可运行的 packaged Tool/Provider/secure-store/固定失败门禁已在
`2.4.14-beta.14` / `86cbb6b9f1da612aa7de30c46f4b153f33a69914e9fcb078d74f5de891186963`
上通过。任务整体仍为 partial 且保持 `in_progress`：真实 MCP 因环境未显式 opt-in
而 blocked，orchestrator durable user-content 的 Privacy delete/自动 retention
仍是已知缺口；不得据此归档或改写为完整通过。

## Out of Scope

- 不在本任务中写入或轮换生产 Provider、Nexus、MCP 或签名凭证。
- 不把 mock、静态类型、UI 显示、下载完成或 Provider 建连单独计为全链路通过。
- 不扩展新的模型、Agent 产品功能或长期记忆策略；只关闭现有能力的可信验收缺口。
