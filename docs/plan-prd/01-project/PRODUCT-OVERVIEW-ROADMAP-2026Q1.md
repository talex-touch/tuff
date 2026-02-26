# Tuff 产品总览与 8 周路线图（2026-Q1）

> 更新时间：2026-02-26  
> 适用范围：`apps/core-app`、`apps/nexus`、`packages/*`、`plugins/*`

## 1. 产品总览（是什么）

Tuff（原 TalexTouch）是一个 **Local-first + AI-native + Plugin-extensible** 的桌面指令中心。  
它的定位不是单一启动器，而是“统一入口层”：

- 用一个入口完成应用/文件/命令/插件能力的检索与执行；
- 通过插件体系承载扩展能力，形成可演进生态；
- 通过 Flow / DivisionBox / Intelligence 形成跨能力协作链路；
- 用可信发布与同步能力保障可持续交付。

## 2. 最终目标（North Star）

> 目标窗口：2026 年上半年（截至 2026-06-30）

### G1. 架构目标（可维护）
- 完成 SDK Hard-Cut（E~F），高频链路不再直连 legacy channel。
- renderer/main/plugin 的跨层调用统一走 typed transport/domain SDK。

### G2. 质量目标（可回归）
- `apps/core-app` 关键质量门禁长期可通过：`typecheck:node`、`typecheck:web`、定向 lint、关键测试。
- 核心链路（插件加载、搜索执行、Flow 会话、更新下载）具备稳定回归用例。

### G3. 发布目标（可可信）
- 发布链路完成 OIDC + RSA 官方构建验证；
- `build-and-release` 作为唯一桌面发版主线，Release notes 与 assets 自动同步 Nexus，结构统一为 `{ zh, en }`。
- CLI 四包 npm 自动发布（稳定版 `latest`，预发布 `next`）且同步 Nexus 更新公告。

### G4. 产品目标（可闭环）
- Flow / DivisionBox / Intelligence 的体验闭环完成（功能、权限、审计、文档、示例）。
- 保持“核心框架稳定 + 插件能力持续外移”的演进方向。

## 3. 质量约束（全项目强制）

### 3.1 代码质量门禁
- 不允许新增未类型约束的跨层调用（禁止新增 raw event 直连）。
- 新增模块必须提供最小可回归验证（lint/typecheck/test 至少 1 项）。
- 不得通过“关闭规则/降级配置”绕过质量问题（除非有明确豁免文档）。

### 3.2 架构约束
- 主流程优先复用 SDK 与现有模块，不允许重复造轮子。
- Storage 规则必须遵守：SQLite 为本地 SoT，JSON 仅作为同步载荷格式。
- i18n 必须走 hooks，不允许新增 `window.$t/window.$i18n` 直用。

### 3.3 发布与安全约束
- 生产链路禁止引入未审计的敏感数据外发路径。
- 官方构建验证链路（签名生成/验签）必须可追踪、可复核。
- 版本发布必须附带最小变更说明与风险说明。

### 3.4 文档约束
- 功能行为变化需同步 `README.md` / `plan-prd` / `docs/INDEX.md` 至少一处。
- 活跃 PRD 必须包含“最终目标、验收标准、质量约束、回滚策略”。

## 4. 8 周路线图（建议执行窗口：2026-02-23 ~ 2026-04-19）

### Week 1：基线收敛（质量止血）
- 目标：修复当前主线 typecheck 阻塞，建立可执行的质量基线。
- 交付：
  - 清理 `apps/core-app` 当前阻塞类型错误；
  - 清理 `packages/tuffex` 阻塞类型错误；
  - 固化“最小必跑校验清单”。
  - 详细执行清单：`docs/plan-prd/01-project/WEEK1-EXECUTION-PLAN-2026Q1.md`
- 质量闸门：
  - `pnpm -C "apps/core-app" run typecheck:node` 通过；
  - `pnpm -C "apps/core-app" run typecheck:web` 通过。

### Week 2：SDK Hard-Cut（E 批次）
- 目标：清理 renderer 侧主要直连调用点。
- 交付：
  - Settings / Permission / Intelligence 相关页面直连迁移；
  - Intelligence Agent 命名空间一次切换（Core IPC + Nexus API 同步切换）；
  - Prompt Registry（record + binding）落库并完成 capability 绑定迁移；
  - 增加迁移清单与剩余点位清单。
- 质量闸门：
  - 新增迁移点无 raw event；
  - 定向 lint + 回归测试通过。

### Week 3：SDK Hard-Cut（F 批次）
- 目标：清理 main/plugin 侧 legacy 分支并收口导出。
- 交付：
  - legacy handler 逐项下线；
  - hooks/SDK 对外入口统一。
- 质量闸门：
  - 新增代码 0 个 legacy channel 直连；
  - 迁移报告可追踪（变更点、风险、回滚点）。

### Week 4：Storage 统一推进（配置域）
- 目标：把高风险配置域纳入 SoT 规则并完成迁移验证。
- 交付：
  - 完成至少 2~3 个配置域的 SQLite 化迁移；
  - 明确 sync-needed 与 local-only 边界。
- 质量闸门：
  - 迁移具备 fallback 与回滚验证记录；
  - 不出现明文敏感配置落盘。

### Week 5：Flow / DivisionBox 闭环
- 目标：补齐会话审计与联调验收，完成开发者文档最小集。
- 交付：
  - Flow 审计日志、失败原因记录；
  - DivisionBox 生命周期文档补齐；
  - 至少 1 组 sender/receiver 测试插件验证。
- 质量闸门：
  - 主流程无阻断回归；
  - 文档 + 示例 + 代码三者一致。

### Week 6：稳定性与性能治理
- 目标：处理事故遗留与性能噪声（VC-4/DB-6/PERF-1）。
- 交付：
  - ViewCache 失效日志节流与可观测补齐；
  - DB 单写入策略连通性核查；
  - suspend/resume 误报抑制。
- 质量闸门：
  - `SQLITE_BUSY(_SNAPSHOT)` 显著下降；
  - EventLoop 误报得到隔离。

### Week 7：发布链路闭环
- 目标：OIDC + RSA + Nexus release 同步打通。
- 交付：
  - `build-and-release` 统一产物、生成 `tuff-release-manifest.json` 并同步 Nexus release/assets；
  - CLI 四包自动发布与 Nexus updates 同步；
  - 官网部署由 Cloudflare Pages 平台侧 Git 自动部署；
  - build signature 生成与验签流程持续增强。
- 质量闸门：
  - 预发布链路全程可复现；
  - notes/assets 字段结构校验通过。

### Week 8：RC 验收与文档冻结
- 目标：形成可发布候选（RC）与统一对外文档。
- 交付：
  - 关键体验回归清单与验收结论；
  - 文档冻结版本（README/PRD/Nexus docs）；
  - 下一阶段 backlog 与风险登记。
- 质量闸门：
  - 核心质量门禁稳定通过；
  - 无 P0/P1 未评估风险项。

## 4.1 v2.4.7 GA 收口里程碑（发布推进）

- **Gate A（已完成）**：版本基线对齐（root/core-app = `2.4.7`）。
- **Gate B（已完成）**：发布链路收敛（`build-and-release` + Nexus release 同步 + CLI 四包 npm 自动发布）。
- **Gate C（进行中）**：质量门禁清零（lint/typecheck 阻塞项收口）。
- **Gate D（进行中）**：发布资产核对（release notes `{ zh, en }`、assets、signature、manifest）。
- **Gate E（待执行）**：创建并推送 `v2.4.7` tag，完成 GitHub Release 与 Nexus 发布联动验收。
- **执行入口**：`docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`

## 5. 里程碑验收标准（跨周）

- **架构验收**：新增业务代码不再扩散 legacy channel。
- **质量验收**：核心门禁连续两周稳定通过。
- **发布验收**：预发布到正式发布流程具备同构能力。
- **文档验收**：项目入口文档与现状一致，避免“代码已变、文档失真”。

## 6. 风险与应对

- 风险：历史债务导致“修一个炸一片”。  
  应对：按模块分批 hard-cut，禁止跨域混改。
- 风险：发布链路变更影响现网节奏。  
  应对：先灰度到 snapshot，再放量 release。
- 风险：文档滞后导致执行偏差。  
  应对：将文档更新纳入每周验收 checklist。
