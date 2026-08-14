# 维护审计：需处理项（2026-08-14）

仅记录仍需动作的问题。任务状态、责任人与验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-13 审计](./maintenance-audit-2026-08-13.md) 作为当前问题索引，不建立第二套全局优先级。历史研究产物不是当前运行事实，除非本轮重新验证。

## 失败验证与人工运行证据

- **`v2.4.14-beta.8` 未发布** — GitHub release run `31778105595` 的 macOS 打包在签名和公证成功后，`dmgbuild` 无法卸载 `disk32`（`Resource busy`）而失败；Create Release 与 Nexus sync 随后跳过。CI、Windows、Linux、文档、typecheck 与 code-quality job 通过不构成 release 成功。维护者须在干净的 macOS runner/环境重跑并取得 DMG 与 release/sync job 成功记录。
- **Windows Everything 的打包交互验收未采集** — 仍须在 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选以及结果、空态、降级态，再用 manifest 严格校验；无输入 JSON 的失败是边界检查，不是已采集证据的回归。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 与发布 UI 的真实宿主证据未齐** — Windows/Linux 仍缺真实安装 handoff、启动 health/recovery；release-notes 仍缺运行中的 CoreApp 桌面与窄窗口截图。静态检查、hosted CI 与 macOS 的自动化路径不能替代这些证据。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)、[#482](https://github.com/talex-touch/tuff/issues/482)。

## 数据库、安全与发布门禁

- **search-index 分库仍缺运行证明** — split 自 `cd39bdbf6` 起默认开启，`=0` 是应急回退；不再是“默认关闭、等待开启”的迁移。仍须用隔离 CoreApp profile 证明首启重建、app/file 计数与查询一致、`search-index.db` 填充、无 WAL/busy 风暴，以及 `=0` 回退有效。未核验 writer 仍可能造成静默数据偏移。跟踪：[#1745](https://github.com/talex-touch/tuff/issues/1745)。
- **SQLite 写入所有权与关机恢复未收敛** — source guard 仅覆盖 `files`、`fileExtensions`、`keywordMappings`；剩余表的 owner registry、admission/retry 合同、锁竞争和关闭恢复仍无完整证据。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **OTA 的签名门禁仍需保持 fail-closed** — 已验证缺失 signature URL 被拒绝。对 Windows/Linux 真实 handoff 或后续 release 改动不得以 `allowUnsignedFallback` 绕过 SHA-256、pinned detached signature、rollback compatibility 与 health-ack 合同。
- **Renderer CSP 尚未可强制执行** — `default-src *` 与 `connect-src *` 仍在现行策略中；report-only 记录必须覆盖日常真实流量，按已观测指令和 origin 收敛后才可升级。跟踪：[#689](https://github.com/talex-touch/tuff/issues/689)。

## 任务、生成物与文档质量

- **活跃任务状态不可用于可靠排程** — 当前有 78 个活跃 Trellis 任务；catalog-service 与 bilingual-whats-changed 的实现记录已完成，但前者仍缺文档/运行证据，后者仍缺运行视觉证据。governance-audit 已记录 454 个 finding，却未回填 PRD 的验收清单。负责人须为每项补继续条件、阻塞或归档结论，避免把“代码已写”误报为完成。跟踪：[#309](https://github.com/talex-touch/tuff/issues/309)。
- **生成型研究有失效结论** — `07-30` roadmap factcheck 曾将 DB split 记为默认关闭，已在本轮更正；`08-05-full-repo-governance-audit` 的 OAuth 邮箱关联和 CSPRNG finding 是旧扫描快照，当前实现已分别要求受信发行方或严格 `email_verified === true`，并使用 `randomInt`。不得继续用旧 JSONL 作为未修安全问题；在再次报告或批量归档前应重跑生成器并重新核验。
- **包元数据仍有单向漂移决策** — 根 `package.json` 未定义 `homepage`，而 CoreApp 为 `https://tuff.tagzxia.com`；现有同步器只从根向 CoreApp 覆盖已定义字段。metadata owner 需决定根包是否成为完整规范源；本审计不直接改写生成元数据。
