# Tuff v2.4.7 更新说明

> 统计口径：基于 `2.4.6 -> 2.4.7` 区间（从 `apps/core-app` 版本由 `2.4.6` 切换至 `2.4.7-beta.1` 起），主线累计 **600+ 非发版提交**，覆盖 `core-app / nexus / utils / tuffex / plugins`。

## 2.4.6 → 2.4.7 核心变化

### 1) Intelligence Agent 主链升级

- Core/Nexus 命名空间统一切换到 `intelligence:agent:*`。
- `session/stream` 执行主链切换到图状态机（`plan -> execute -> reflect -> finalize`）。
- Prompt Registry（record + binding）落地，补齐管理 API 与控制台管理面。
- Provider 探测与策略校验增强，Planner 超时/重试策略收口。

### 2) 发布与更新链路重构

- 桌面发版统一到 `build-and-release` 主线。
- GitHub Release / Nexus Release / CLI npm 发布链路打通并自动化。
- 更新资产补齐 manifest 与校验信息，同步 Nexus release/update 可观测入口。
- 新增版本化发布日志入口：`/notes/update_<version>`。

### 3) Nexus 平台能力与稳定性

- OAuth/回调链路多轮稳定性修复，云端运行时兼容性增强。
- i18n 去 `?lang` 依赖，locale 编排统一，降低回调后语言回退。
- Store（原 market）相关路由、API、管理流程持续收敛。
- Dashboard/Review/Assets/Updates 多处体验与可维护性改进。

### 4) Core-App 与插件体系演进

- 插件问题同步机制升级为增量事件 + 全量对账兜底。
- Quick Actions、权限判定、manifest 校验等核心路径增强。
- OmniPanel Feature Hub、开发设置、插件管理交互持续补齐。
- OCR/native 集成链路增强，提升平台能力可用性。

### 5) SDK/Transport 与架构清理

- SDK Hard-Cut 持续推进，跨层调用进一步向 typed transport 收口。
- 旧同步链路风险持续清理，legacy `syncStore` 下线。
- Flow / DivisionBox 权限与触发链路一致性持续修复。

### 6) 设计系统与 UI 收敛

- Tuffex 组件持续迁移与行为稳定化（特别是 overlay/dialog 体系）。
- `FlipDialog` 在 Core/Nexus 两端统一封装与交互策略。
- 多处 UI 细节修复（遮罩误触、层级、尺寸与状态反馈一致性）。

## 提交分析（细化）

### 规模概览

- 非发版主线提交：`604`
- 触达文件（去重）：`4422`
- 主要改动热区（按“提交触达次数”）：
  - `apps/core-app`: `348`
  - `apps/nexus`: `194`
  - `packages/utils`: `161`
  - `packages/tuffex`: `113`
  - `docs/plan-prd`: `82`

### 阶段节奏（摘要）

- **2025-11（起始）**：Nexus 新应用形态落地、market 多源与启动优化基线建立。
- **2025-12（体系化）**：Release API/发布系统、Prompt/Intelligence 编排能力快速铺开。
- **2026-01（整合期）**：Agent 管理与多模块联调，发布/文档/质量流程持续固化。
- **2026-02（收口期）**：Auth/OAuth、Sync、Store 迁移、Intelligence graph runtime 与 UI 一次收敛。

### 代表提交（按主题摘选）

- **发布与更新链路**
  - `bc56d262`（2025-12-13）实现 release management API 与 composables。
  - `1da67f66`（2025-12-13）发布系统端到端实现并打通 update 侧。
  - `7d5b479d`（2026-02-10）更新任务复用化，下载管理增强。
- **Intelligence / Agent**
  - `b1e01942`（2025-12-18）引入 Prompt 管理系统。
  - `896666d0`（2025-12-19）落地 Intelligence orchestration 包与存储适配。
  - `f86d4596`（2026-01-19）增强 agent 管理与集成能力。
  - `02da84fb`（2026-02-26）切换到 agent graph runtime 并统一端点。
- **Nexus 身份与稳定性**
  - `15823a9f`（2026-02-04）Nexus auth 迁移至 nuxt-auth。
  - `bf87e09e`（2026-02-10）修复 sign-in callback 与 OAuth 稳定性。
  - `65f47e92`（2026-02-23）增强 OAuth callback fallback 处理。
  - `44c406d2`（2026-02-24）修复 Cloudflare 运行时 hkdf 兼容问题。
  - `5efaf342`（2026-02-26）稳定 i18n locale 流程并去 lang query 依赖。
- **Sync / Storage / Security**
  - `5d94e8ed`（2026-02-06）新增 CloudSyncSDK。
  - `0ffc835d`（2026-02-22）落地云同步模块并增强剪贴板协同。
  - `48ae43ff`（2026-02-26）移除 legacy sync store 并补守卫测试。
- **Store（market）迁移**
  - `2b9ce669`（2026-02-26）Nexus market 路由与 API 迁移到 store（含数据迁移）。
  - `f636d167`（2026-02-26）utils 侧 market domain hard-cut 到 store。
  - `705256fd`（2026-02-26）core-app 插件 market pipeline 迁移到 store。
- **Core-App / 插件能力**
  - `a818329e`（2026-02-24）落地 OmniPanel Feature Hub 与自动装载。
  - `08c85846`（2026-02-23）core+nexus+utils 联动集成 OmniPanel 与 workspace sync。
  - `aa474fc2`（2026-02-25）修复 quick-actions feature id 与权限问题同步。
  - `6429e781`（2026-02-25）插件 issues 改为按 id 增量同步。
  - `2fb46fc7`（2026-02-25）native OCR 加载与 smoke test 稳定性修复。
- **早期基线（2.4.7 周期开端）**
  - `3df15e30`（2025-11-20）启动链路优化（预取）。
  - `3e755571`（2025-11-29）引入新 Nexus app 架构形态。
  - `c7cf4a07`（2025-11-29）新增 typecheck 作业并收敛脚本。
  - `80ce220d`（2025-11-30）market 多 provider 支持落地。

### 完整附录

- 全量提交分组清单见：`notes/update_2.4.7.appendix.md`

## 兼容与迁移提示

- 旧 `intelligence-lab` 路由已下线，请迁移到 `intelligence-agent` 路由族。
- 更新/发布链路默认按新流程运行，发布日志建议按 `notes/update_<version>.{zh,en}.md` 维护。
