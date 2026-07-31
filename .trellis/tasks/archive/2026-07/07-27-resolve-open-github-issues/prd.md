# 收口全部开放 GitHub Issues

## Goal

逐项核验、修复或基于证据关闭当前开放 GitHub Issues，并完成回归与 Issue 状态收口。

## Source Request

- 用户要求检查并处理仓库当前全部开放 GitHub Issues。
- “处理”包括：修复仍可复现且范围明确的问题；对已经实现、重复、过时或缺少必要复现信息的问题，基于仓库证据更新说明并关闭或请求补充信息。

## Confirmed Scope

截至 2026-07-27，`talex-touch/tuff` 有 12 个开放 Issue：

- 安全与隐私总跟踪及子项：#302、#296、#297、#298、#299、#300、#301。
- 稳定性与平台兼容：#295、#213。
- 历史产品需求：#43、#46、#54。

#302 是 #296-#301 的总跟踪项，不作为重复实现工作；它在所有 P0/P1 子项及总体验收完成后收口。现有 `.trellis/tasks/07-27-audit-plugin-privileged-security/` 已登记安全发现，但其范围明确停留在审计与任务图，不代表修复完成。

## Triage Evidence And Task Map

| Issue | 当前结论 | Trellis 交付项 | 关键证据/阻塞 |
| --- | --- | --- | --- |
| #295 | 已验证并证据关闭 | `07-27-verify-close-issue-295` | DbWriteScheduler/AppProvider 分块提交、search split 与 app icon 自愈证据已复核，focused regression 和运行证据满足 closure |
| #213 | 已请求报告者补充最新版复现资料，保持开放 | `07-27-diagnose-ubuntu-startup-213` | 已提供 v2.4.13 release/Linux CI，并请求包类型、`uname`、desktop/session、stderr、main log 与 sandbox 对照；等待外部回复 |
| #43 | 已实现，建议证据关闭 | `07-27-close-superseded-legacy-issues` | `apps/core-app/src/preload/index.ts` 已有启动品牌动画、progress、资源加载事件与淡出状态机 |
| #46 | 核心已实现、云端能力已被现代路线替代 | `07-27-close-superseded-legacy-issues` | CoreApp/Nexus/plugin SDK 已有统一 i18n/localized metadata；签名 Catalog 由 2.6.0 专项承接 |
| #54 | 已有现代等价实现，建议证据关闭 | `07-27-close-superseded-legacy-issues` | Nexus 已聚合双语开发者文档、导航、搜索和 docs APIs |
| #296 | 已完成并证据关闭 | `07-27-fix-permission-revocation-296` | 原子撤销 persistent/session grants；#299 awaited resource teardown 消费同一事件；提交 `8c52bf5b4` |
| #297 | 已完成并证据关闭 | `07-27-isolate-plugin-prelude-297` | 22/22 官方 Prelude 默认运行于 activation-scoped utilityProcess；typed capability、heartbeat/restart budget、legacy removal、1104 tests、production build 与 Electron smoke 通过；提交 `997b246f5` |
| #298 | 已完成并证据关闭 | `07-27-secure-plugin-views-298` | hardened Electron preferences、bridge v1、sender-bound resource/navigation policy 与 real preload smoke；提交 `3365c2340`、`ef4fba34b` |
| #299 | 已完成并证据关闭 | `07-27-harden-plugin-storage-299` | fail-closed identity/permission、canonical root、dual SQL policy、resource limits、worker termination 与 lifecycle cleanup；提交 `b95f9bd9c` |
| #300 | 已完成并证据关闭 | `07-27-fix-transport-caller-identity-300` | runtime-branded sender/port/instance/generation identity 覆盖 IPC/local/MessagePort/plugin-host；提交 `4b88e9550` |
| #301 | 已完成并证据关闭 | `07-27-sensitive-data-lifecycle-301` | owner-bound retention、typed Privacy SDK、atomic export/Secret backup、generation-bound uninstall、Settings controls、inventory 与 smoke；提交 `5bf6e08b4` |
| #302 | tracker，集成验收通过，待关闭 | 父任务集成验收 | 原始 12-issue baseline 已重新查询；#296-#301 一致，#213 外部阻塞已记录 |

## Requirements

### R1. 逐项证据化分流

- 每个开放 Issue 必须标记为“需修复”“部分实现”“已实现/可关闭”“过时/替代”“需报告者补充信息”之一，并给出代码、测试、构建产物、支持矩阵或历史任务证据。
- 不以 Issue 年龄作为关闭理由；关闭必须说明当前行为、验证方式和替代入口。
- Issue 内容涉及多个独立交付物时拆分 Trellis 子任务，并在父任务维护映射与依赖。

### R2. 修复与回归

- 仍成立的问题按安全风险、用户阻断程度和依赖顺序实施，优先级为：#299/#296/#295，随后 #297/#298/#300，再处理 #301/#213 与历史需求。
- 每个代码修复必须有覆盖原始失败模式的回归测试；跨平台问题需使用 CI、可复现环境或明确的人工验证证据。
- 安全测试只使用合成数据，不公开可武器化 payload、真实路径、秘密或用户内容。

### R3. Issue 状态收口

- 已完成项在 GitHub Issue 留下简洁的修复证据、关联提交/测试和验证结果后关闭。
- 信息不足但无法从仓库回答的问题，先向报告者请求最小必要信息；在信息返回前保持可追踪状态，不伪造修复结论。
- #302 仅在其定义的子项和集成验收满足后关闭；若 P2 产品决策被明确延期，必须记录独立后续范围而非静默勾选。

### R4. 工作区与发布边界

- 不覆盖或回滚当前工作区已有的未提交变更。
- 不主动提交、推送、发布或执行生产环境操作，除非用户在本任务中明确授权。
- 父任务仅负责总清单、子任务映射和最终集成收口；实际代码变更由可独立验收的子任务承担。

## Acceptance Criteria

- [x] 12 个开放 Issue 均有仓库证据支持的处置结论和对应 Trellis 交付项。
- [x] 所有“需修复”项的相关测试、类型检查和构建验证通过，原始失败模式有回归覆盖。
- [x] 所有“已实现/可关闭”或“过时/替代”项均在 GitHub 留有可复核说明后关闭。
- [x] 所有“需报告者补充信息”项均已请求具体诊断资料并记录当前阻塞条件。
- [x] #296-#301 的安全边界、撤销、隔离、调用身份和隐私生命周期验收与 #302 总跟踪一致。
- [x] 最终重新查询 GitHub，确认没有遗漏本次规划基线中的开放 Issue；执行期间新增 Issue 被记录但不自动扩张本任务范围。

## Product Decisions

- #43、#46、#54 使用“证据关闭”：在各 Issue 说明当前现代等价实现及后续专项路线后关闭，不重写为新的增强需求。
- #301 的具体默认保留期限和卸载删除策略在进入该子任务规划时逐项确认；在此之前不得自行假定会永久保留或立即删除用户数据。
