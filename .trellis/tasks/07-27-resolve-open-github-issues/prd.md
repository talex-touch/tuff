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
| #295 | 已有多轮修复，验证后关闭 | `07-27-verify-close-issue-295` | `DbWriteScheduler`、AppProvider 分块提交、search split 与 app icon 自愈已有提交；focused Vitest 75/75 通过，仍需复核打包运行证据 |
| #213 | 信息不足，先请求最新版复现 | `07-27-diagnose-ubuntu-startup-213` | Issue 只有 Ubuntu 24.04/Xorg/GNOME 46 与旧截图；当前 CI 和 builder 已产出 AppImage/deb，缺版本、启动命令、stderr 与主进程日志 |
| #43 | 已实现，建议证据关闭 | `07-27-close-superseded-legacy-issues` | `apps/core-app/src/preload/index.ts` 已有启动品牌动画、progress、资源加载事件与淡出状态机 |
| #46 | 核心已实现、云端能力已被现代路线替代 | `07-27-close-superseded-legacy-issues` | CoreApp/Nexus/plugin SDK 已有统一 i18n/localized metadata；签名 Catalog 由 2.6.0 专项承接 |
| #54 | 已有现代等价实现，建议证据关闭 | `07-27-close-superseded-legacy-issues` | Nexus 已聚合双语开发者文档、导航、搜索和 docs APIs |
| #296 | confirmed，需修复 | `07-27-fix-permission-revocation-296` | `permission-store.ts` 的 revoke/revokeAll 未清 `sessionGrants` |
| #297 | confirmed，需完成 | `07-27-isolate-plugin-prelude-297` | `TUFF_PLUGIN_ISOLATION` 默认关闭，Prelude 仍在 Electron main 的 `vm` 中执行 |
| #298 | confirmed，需完成 | `07-27-secure-plugin-views-298` | compat profile 仍启用 Node、关闭 sandbox/context isolation；安全模式默认关闭 |
| #299 | confirmed，需修复 | `07-27-harden-plugin-storage-299` | SQLite/Secret permission runtime 缺失时 fail-open；raw SQL 可越界且无资源上限 |
| #300 | confirmed contract defect，需修复 | `07-27-fix-transport-caller-identity-300` | `verified` 仍由调用方 `uniqueKey` 非空派生，未表达 sender-bound proof |
| #301 | 产品与工程加固，需实现 | `07-27-sensitive-data-lifecycle-301` | 已有 telemetry/错误脱敏和 secret 加密，但缺统一保留、删除、导出、卸载及远程处理控制 |
| #302 | tracker，最后收口 | 父任务集成验收 | 依赖 #296-#301 的验收结论 |

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

- [ ] 12 个开放 Issue 均有仓库证据支持的处置结论和对应 Trellis 交付项。
- [ ] 所有“需修复”项的相关测试、类型检查和构建验证通过，原始失败模式有回归覆盖。
- [ ] 所有“已实现/可关闭”或“过时/替代”项均在 GitHub 留有可复核说明后关闭。
- [ ] 所有“需报告者补充信息”项均已请求具体诊断资料并记录当前阻塞条件。
- [ ] #296-#301 的安全边界、撤销、隔离、调用身份和隐私生命周期验收与 #302 总跟踪一致。
- [ ] 最终重新查询 GitHub，确认没有遗漏本次规划基线中的开放 Issue；执行期间新增 Issue 被记录但不自动扩张本任务范围。

## Product Decisions

- #43、#46、#54 使用“证据关闭”：在各 Issue 说明当前现代等价实现及后续专项路线后关闭，不重写为新的增强需求。
- #301 的具体默认保留期限和卸载删除策略在进入该子任务规划时逐项确认；在此之前不得自行假定会永久保留或立即删除用户数据。
