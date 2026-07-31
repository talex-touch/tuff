# docs/ 全量盘点与结构分析

> 生成：2026-07-30 · 只读分析，未修改任何 docs 文件
> 数据口径：`find docs -name '*.md'`（125 个）+ 每文件 `git log -1 --format=%cs`；当前版本基线 root/`apps/core-app` = `2.4.13`
> 注意：`docs/design/` 下 **没有 md**（仅 `.pen` 设计稿 + 生成图 + 1 个 `.js`），PRD 中"docs/design/{corebox,nexus}"按资产目录处理，不计入 125 个 md。

## 1. 总量与目录分布

| 目录 | md 数 | 最新修改 | 性质 |
| --- | --- | --- | --- |
| `docs/` 根（INDEX + script-native-*） | 8 | 2026-07-28 | 导航 + 脚本原生专题 |
| `docs/plan-prd/`（根 + 01~04） | 44 | 2026-07-30 | 优先级/路线/PRD/实施，主 SoT 区 |
| `docs/plan-prd/docs/` | 6 | 2026-07-28 | 运维清单/质量基线/长期债务（嵌套异味） |
| `docs/plan-prd/report/` | 7 | 2026-06-08 | 6 月初增量审计流水（嵌套异味） |
| `docs/engineering/`（根 + notes） | 9 | 2026-07-30 | 规范/交接/清单 |
| `docs/engineering/reports/` | 45 | 2026-07-30 | curated evidence 与审计报告 |
| 非 md 资产 | ~20+ | — | design `.pen`/png、reports evidence json/png/json、`.DS_Store`（1 个，建议删） |

## 2. 分目录文件清单

日期 = 最后 git 提交日。`★` = 被 INDEX/README 收录的关键入口。

### 2.1 docs/ 根（8）

| 文件 | 日期 | 一句话判断 |
| --- | --- | --- |
| INDEX.md ★ | 07-28（工作区已改） | 全仓导航，治理规则明确，链接全部有效（见 §4） |
| script-native-build-distribution.md | 06-21 | 脚本/原生构建分发方案，较新 |
| script-native-capability-matrix.md | 02-09 | 能力矩阵与降级策略，偏旧但属长期设计 |
| script-native-constraints.md | 02-09 | 约束清单，同上 |
| script-native-native-integration.md | 01-21 | 原生集成方案，最旧一批 |
| script-native-provider-examples.md | 02-09 | provider 示例 |
| script-native-python-runtime.md | 01-21 | Python 运行时策略 |
| script-native-test-plan.md | 01-21 | 测试计划 |

→ 7 个 script-native-* 是同一专题（2026-01/02 设计，06-21 仅更新 1 篇），**未被任何 INDEX/README 收录**，游离于导航外。

### 2.2 plan-prd/ 根 + 01-project（7）

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| README.md ★ | 07-28 | 规划入口，治理规则完善 |
| TODO.md ★ | 07-30 | 全局两周执行顺序 SoT，质量高（见 §5） |
| TODO-AI.md ★ | 07-16 | AI 专题 |
| TODO-R3.md ★ | 07-18 | Search/Indexing 专题 |
| TODO-nexus.md ★ | 07-16 | Nexus 专题 |
| 01-project/CHANGES.md ★ | 07-28 | 完成事实索引，高信号、按日组织 |
| 01-project/CALENDAR-PRD.md | **01-17** | 日历插件 PRD，半年未动，状态不明 |
| 01-project/DESIGN_IMPROVEMENTS.md | **01-17**（内容写 2025-10-30 / v2.1.0+） | 明显过时的设计建议快照 |

### 2.3 plan-prd/02-architecture（4）

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| platform-capabilities-prd.md | 07-14 | 活跃 |
| intelligence-power-generic-api-prd.md | 06-21 | 活跃 |
| nexus-provider-scene-aggregation-prd.md | 06-21 | 活跃 |
| module-logging-system-prd.md | 02-22 | 偏旧，需确认是否已落地 |

### 2.4 plan-prd/03-features（23，含子目录）

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| ai-2.5.0-plan-prd.md | 07-16 | 活跃 |
| ai-2.5.3 / 2.5.4(×2) / 2.5.5 / 2.5.8 系列 | 07-14 | AI 版本线 PRD，成组活跃 |
| plugin-runtime-isolation-prd.md | 07-29 | 活跃（对应安全加固线） |
| i18n-lexicon-catalog-2.6.0-prd.md | 07-14 | 活跃 |
| omnipanel-assistant-next-prd.md | 07-14 | 活跃 |
| tuff-quickops-prd.md | 07-14 | 活跃 |
| division-box-prd.md | 06-21 | 较新 |
| native-rust-runtime-migration-prd.md | 06-21 | 较新 |
| cloudshare-plugin-content-prd.md | 05-19 | 中期 |
| build/build-integrity-verification-prd.md | 06-21 | 较新 |
| build/build-signature-system-prd.md | **01-19** | 旧，与前者可能重叠 |
| download-update/DOWNLOAD_CENTER_REFERENCE.md | 07-18 | 活跃 |
| download-update/github-auto-update-prd.md | **01-19** | 旧，OTA 线已由 Trellis 任务承接，疑部分过时 |
| download-update/github-release-asset-spec.md / pre-release-validation.md | 05-30 | 中期 |
| download-update/update-regression-checklist.md | 06-20 | 较新 |
| meta-overlay/META-OVERLAY-PRD.md | 05-21 | 中期 |
| search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md | 07-17 | 活跃（对应 Windows Everything 任务） |
| search/INDEXING-RUNTIME-V1-PLAN.md | 07-04 | 活跃（R3） |
| search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md | 07-29 | 活跃 |
| search/WINDOWS-FILE-SEARCH-PRD.md | **01-22** | 旧，已被 07-17 ROADMAP 与任务树覆盖 |
| tuff-ui/TUFF-UI-MIGRATION-PRD.md | 06-21 | 较新 |
| view/attach-view-cache-prd.md | 02-20 | 旧 |
| view/multi-attach-view-prd.md | **01-17** | 旧 |

### 2.5 plan-prd/04-implementation（15）

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| README.md ★ | 07-16 | 索引清晰，且自标 Historical 区，治理样板 |
| Roadmap-vNext-2026-06-18.md ★ | 07-28 | R0-R9 路线 SoT，内容仍新（见 §5） |
| Stability-Architecture-Optimization-2026-07-04.md ★ | 07-16 | 稳定性代码落点，活跃 |
| Current-Execution-Plan-2026-06-17.md | 07-28 | 已退役为兼容跳转（README 明示），保留合理 |
| Evidence-Matrix-AI-Stable / Release-Integrity | 07-28 | 活跃 evidence |
| Evidence-Matrix-Nexus-Governance / Platform | 06-24 / 06-19 | 中期 evidence |
| R8-R9-Next-Stage-Execution-Plan-2026-06-24.md | 07-14 | 专题计划 |
| Launcher-TuffIntelligence-QuickReview-Roadmap-2026-07-07.md | 07-17 | 专题路线 |
| Pricing-SoT-2026-06-18.md | 06-21 | Pricing SoT |
| Project-Roadmap-Audit-2026-06-18.md | 07-16 | 历史快照（README 已标 Historical） |
| Release-2.4.11-Closure-2026-06-13.md | 07-16 | 历史收口（已标 Historical） |
| AI-2.5x-Execution-Plan-2026-06-16.md | 07-14 | 历史/阶段计划（已标 Historical） |
| performance/PERFORMANCE_REFERENCE.md | 02-13 | 旧，与 reports 性能审计关系待确认 |
| performance/WindowsStartupOptimization-2026-06-18.md | 06-21 | 较新 |

### 2.6 plan-prd/docs/（6 + 1 个 .mjs）——嵌套异味区

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| TODO-BACKLOG-LONG-TERM.md ★ | 07-28 | 长期债务池，被 INDEX/README 引用，内容活跃 |
| build-strategy.md | 07-17 | 打包策略，属工程规范性质 |
| NEXUS-RELEASE-ASSETS-CHECKLIST.md | 05-30 | 发布核对清单（Gate D），运维性质 |
| PRD-QUALITY-BASELINE.md | 07-16 | PRD 质量口径；**引用了不存在的 `06-ecosystem` 目录**（陈旧引用） |
| COREBOX-ROADMAP-06C-REGRESSION-BASELINE.md | 03-09 | 06-C 回归基线，已完成的 roadmap 子项记录 |
| PERIPHERAL-DOCS-BROKEN-LINK-INVENTORY.md | 07-28 | Batch C 断链审计的"immutable 修复前快照"，一次性产物 |
| peripheral-docs-link-audit.mjs（非 md） | — | 上述审计的辅助脚本 |

→ 该目录是"运维清单 + 质量口径 + 一次性审计产物"的混编，目录名 `docs/` 与顶层 `docs/` 撞名，是主要结构异味。

### 2.7 plan-prd/report/（7）——嵌套异味区

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| cross-platform-compat-...-audit-2026-06-01 ~ 06-07（6 篇） | 06-01~06-08 | 逐日增量审计流水，结论高度重复（每篇 P0 结论几乎同文），属历史快照 |
| performance-audit-2026-06-07.md | 06-08 | 性能审计（基线 2.4.11-beta.7），已被后续 optimization-dry-run 等覆盖 |

→ 性质与 `engineering/reports/` 完全相同（审计报告），却放在 plan-prd 下；且 reports/README 声明"6 月以前 reports 已移除"，这 7 篇是 6 月初的遗留，位置与保留策略都不一致。

### 2.8 engineering/ 根 + notes（9）

| 文件 | 日期 | 判断 |
| --- | --- | --- |
| README.md ★ | 07-30 | 工程入口，治理良好 |
| security-hardening-handoff-2026-07-15.md ★ | 07-29 | 活跃交接 |
| security-hardening-remaining-backlog-2026-07-15.md ★ | 07-29 | 活跃 backlog |
| sensitive-data-inventory.md (+.json) | 07-30 | 活跃 SoT（md+json 双轨） |
| plugin-prelude-isolation-migration.en/zh-CN.md | 07-29 | 活跃双语迁移指南 |
| coreapp-ui-contract.md | 06-13 | 较新规范 |
| monorepo-standards.md | 02-23 | 规范类，旧但长尾有效 |
| cloud-sync-sdk-usage.md | 02-13 | SDK 用法，旧，需对照当前 SDK API |
| tuff-intelligence-rollout-todo.md | **02-20** | 与 TODO-AI / 04-implementation 多个 AI 计划重叠，疑已被取代 |
| notes/left.md | **01-17** | 个人任务梳理草稿，明显过时，无导航引用 |

### 2.9 engineering/reports/（45）

- 顶层报告：maintenance-audit-2026-07-30（新）、nexus-docs-issue-report-2026-07-27（新）、full-repo-audit-lint-2026-06-24、coreapp-button-migration（05-11）、module-lifecycle-telemetry（02-04，变更记录性质，非报告）。
- 子目录 evidence：coreapp-visible-ai-stable-2026-06-18/（5 md）、r3-indexing-runtime-2026-06-25/、release-integrity-2026-06-22/、native-screenshot-rust-2026-06-21/、nexus-performance-2026-06-21/。
- **startup-packaged-cold-runs / hot-runs-2026-06-21/**：各 10 篇逐次运行报告 + 汇总，共 22 个 md，占全 docs 18%。单篇信息密度低，汇总报告已覆盖结论；与 reports/README "不提交 raw 流水"的口径相悖。
- reports/README.md（07-04）：提交边界明确，治理良好。

## 3. 过时与重复识别

**明显过时（建议归档或标注 Historical）：**

1. `01-project/DESIGN_IMPROVEMENTS.md` —— 内容自述适用 v2.1.0+（当前 2.4.13），9 个月前快照。
2. `engineering/notes/left.md` —— 1 月个人草稿，"未完成/待验证"清单早已漂移。
3. `engineering/tuff-intelligence-rollout-todo.md` —— 2 月 AI 落地待办，已被 TODO-AI + AI-2.5x 计划 + Evidence Matrix 三层覆盖。
4. `03-features/search/WINDOWS-FILE-SEARCH-PRD.md`（1 月）—— 已被 APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP（7 月）与任务树承接。
5. `03-features/download-update/github-auto-update-prd.md`（1 月）—— OTA 已由统一更新链路任务重做，需确认残留有效部分。
6. `04-implementation/performance/PERFORMANCE_REFERENCE.md`（2 月）、`engineering/cloud-sync-sdk-usage.md`（2 月）、`02-architecture/module-logging-system-prd.md`（2 月）—— 偏旧，需 owner 确认是否仍为实现依据。
7. `plan-prd/report/` 全部 7 篇 —— 6 月初审计流水，结论已被后续报告覆盖。

**重复/冗余：**

- `plan-prd/report/*` 与 `engineering/reports/*` 职能重复（都是审计报告）。
- startup cold/hot runs 20 篇逐次报告 vs 各自汇总报告（汇总已含结论）。
- `tuff-intelligence-rollout-todo.md` vs TODO-AI.md / AI-2.5x-Execution-Plan。
- `PERIPHERAL-DOCS-BROKEN-LINK-INVENTORY.md` 自述 immutable 一次性快照，修复完成后即无长期价值（属别的任务范围的产物，仅标记不处理）。
- `PRD-QUALITY-BASELINE.md` 引用 `06-ecosystem`（不存在）——口径陈旧。

## 4. INDEX.md 链接审计

- **出站链接 20/20 全部存在，无断链**（含 `../ROADMAP.md` untracked 新文件、`.trellis` 任务链接）。
- INDEX 更新时间写 "2026-07-31"，与 git 最后提交 07-28 不符（工作区未提交改动所致，提交后可视为合理）。
- **未被 INDEX 直接收录的重要文档**（多数经二级 README 可达，游离项标 ⚠️）：
  - ⚠️ `script-native-*.md`（7 篇）—— 无任何入口收录，完全游离。
  - ⚠️ `plan-prd/docs/build-strategy.md`、`NEXUS-RELEASE-ASSETS-CHECKLIST.md`、`PRD-QUALITY-BASELINE.md` —— 运维/质量口径，无入口。
  - `engineering/sensitive-data-inventory.md`、`plugin-prelude-isolation-migration.*` —— 经 engineering/README 可达，OK。
  - 03-features 各 PRD —— 经专题 TODO 间接可达，可接受。

## 5. 关键 SoT 抽样有效性

| 文档 | 角色 | 有效性评价 |
| --- | --- | --- |
| plan-prd/TODO.md | 全局两周优先级唯一 SoT | **强**。自我定位清晰（Authority 声明 + 禁止复制易漂移状态），安全门禁（DB_SEARCH_SPLIT flag）具体可执行，与 Trellis 任务树分工明确。 |
| 01-project/CHANGES.md | 完成事实 SoT | **强**。按日组织、每条带证据与边界声明（"不跨版本继承"），无流水账。 |
| Roadmap-vNext-2026-06-18.md | 产品阶段 SoT | **强**。决策锁定区防漂移，R0-R9 表带完成标准，Evidence 链接齐全；07-27 仍有维护。 |
| docs/TODO-BACKLOG-LONG-TERM.md | 长期债务池 | **中强**。与 TODO.md 分工明确；含已完成勾选项，可定期清理已勾项。 |
| engineering/reports/README.md | reports 提交边界 | **强**。可/不可提交清单具体，但 startup runs 22 篇的存在说明执行有破口。 |
| 04-implementation/README.md | 实施索引 | **强**。Historical 区显式标注，是处理旧文档的范式。 |

## 6. 结构优化建议（仅建议，未执行）

| # | 动作 | 对象 | 目标 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `git mv` 归并 | `plan-prd/report/` 7 篇 | `engineering/reports/cross-platform-audit-2026-06/` | 消除嵌套异味，与 reports 职能对齐；保 git 历史 |
| 2 | 重命名/归并 | `plan-prd/docs/` | 拆散：`build-strategy.md`、`NEXUS-RELEASE-ASSETS-CHECKLIST.md` → `engineering/`；`PRD-QUALITY-BASELINE.md`、`TODO-BACKLOG-LONG-TERM.md` 留 plan-prd 根或 `04-implementation/`；`PERIPHERAL-...INVENTORY`+`.mjs` 随对应任务归档 | 消除 `docs/docs` 撞名；按内容性质归位；需同步 INDEX/README 中 2 处引用 |
| 3 | 标 Historical 或移 archive | DESIGN_IMPROVEMENTS、notes/left、tuff-intelligence-rollout-todo、WINDOWS-FILE-SEARCH-PRD、github-auto-update-prd | 原地头部加 Historical 标注（仿 04-implementation 范式）或移入 `docs/archive/` | 保留历史但停止误导 |
| 4 | 精简 | startup cold/hot runs 各 10 篇 | 保留 2 篇汇总 + long-tail notes，逐次报告移出文档树或压缩为单文件附录 | 22→3，对齐 reports 卫生口径 |
| 5 | 补导航 | script-native-* 7 篇 | 在 INDEX 或 engineering/README 增设"脚本原生专题"入口 | 消除完全游离文档 |
| 6 | 小修 | `docs/engineering/.DS_Store` | 删除并确认 .gitignore 覆盖 | 仓库卫生 |
| 7 | 小修 | PRD-QUALITY-BASELINE 的 `06-ecosystem` 引用 | 随任务执行时更新或删除该引用 | 修陈旧口径 |
| 8 | 确认后处理 | module-logging-system-prd、cloud-sync-sdk-usage、PERFORMANCE_REFERENCE、build-signature-system-prd、attach-view-cache-prd、multi-attach-view-prd、CALENDAR-PRD | owner 确认仍有效→补导航；已取代→Historical | 7 篇中期旧文档状态待定 |

**不建议动**：plan-prd 01~04 的编号分层、INDEX/README 四级导航、Evidence Matrix 体系 —— 治理已成熟。
