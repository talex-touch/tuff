# Engineering Reports Hygiene

> 更新时间：2026-10-12
> 定位：工程报告、审计输出与 evidence 产物的提交边界。

## 提交边界

可以提交：

- 摘要报告、审计结论、迁移记录与人工可复核说明。
- evidence manifest、checklist、strict verify / readiness 输出与退出码。
- 最终可复核截图、录屏、JSON capture 或必要 DOM snapshot。
- 能解释 evidence 来源、限制和后续 blocker 的 `README.md` / `REPORT-HYGIENE.md`。

默认不提交：

- 调试日志、进程 pid、临时 stdout/stderr mirror。
- `*-probe-output.json`、`*-capture-output.json`、`*-dom-probe-output.json` 等命令输出镜像。
- 重复阶段截图、失败探索 probe、中间临时 profile 记录。
- Chromium / Electron `user-data`、GPUCache、Cookies、Local Storage、SQLite DB、`.key`。
- 不能作为验收 evidence 的本地 raw 产物。

## 目录约定

- 每个新 evidence 报告优先建独立目录，例如 `coreapp-visible-ai-stable-2026-06-18/`。
- 顶层目录只保留 curated 产物；raw/debug 放入本地 ignored evidence 目录。
- 6 月以前 reports 已移除；后续不再把历史 benchmark 流水账提交进文档树。
- `.gitignore` 已覆盖 `docs/engineering/reports/**/raw/`、`logs/`、`user-data/`、cache/profile/DB/secret 类产物。

## 当前 reports

- `coreapp-visible-ai-stable-2026-06-18/`：AI Stable / visible experience curated evidence。
- `release-integrity-2026-06-22/`：R1 Release Integrity Gate E 真实链路复采证据。
- `r3-indexing-runtime-2026-06-25/`：R3 Search / Indexing Runtime readiness、isolated SQLite/FTS copy simulation、legacy `file_fts` retain policy 与 packaged Settings diagnostics evidence。
- `startup-packaged-hot-runs-2026-06-21/`：packaged hot startup benchmark 摘要与结构化数据。
- `startup-packaged-cold-runs-2026-06-21/`：packaged cold startup benchmark 摘要与结构化数据。
- `native-screenshot-rust-2026-06-21/`：native screenshot Rust 验证摘要。
- `nexus-performance-2026-06-21/`：Nexus performance 当前工作表。
- [`release-gate-and-worktree-closeout-2026-09-13.md`](./release-gate-and-worktree-closeout-2026-09-13.md)：工作树收口与 `quality:release` 在 clean committed HEAD 上的分阶段复跑证据。
- [`cloudflare-ai-gateway-nexus-scene-routing-2026-09-25.md`](./cloudflare-ai-gateway-nexus-scene-routing-2026-09-25.md)：CF AI Gateway 接入 Nexus 的计费口径、硬限制、上游覆盖与本仓不变量冲突点调研结论（未落地，含待实测清单）。
- [`nexus-cn-access-2026-10-10.md`](./nexus-cn-access-2026-10-10.md)：中国大陆访问 Nexus 的链路实测与方案对比（优选 IP、EdgeOne、自建中转、国内反代），**检测中**（含待实测清单），附同批待定项：构建方式已定为继续用 Pages 构建，边缘缓存、Sentry、维护定时任务、共享 D1 读额度与 Smart Placement 执行位置待定。
- [`lightweight-voice-cloning-2026-10-11.md`](./lightweight-voice-cloning-2026-10-11.md)：轻量声音克隆与科幻系统声线调研，含 Qwen、Nano、ZipVoice 本地串行实测、电子处理参数、磁盘占用与试听验证；用户听感尚未确认。
- [`file-search-integration-2.5.1-2026-10-11.md`](./file-search-integration-2.5.1-2026-10-11.md)：everyfiles、fsearch 与文件动作体验融合调研；目标版本 **2.5.1**，状态 **待实施**，含现状差距、接入边界、隔离样本验证、实施清单与验收条件。
- [`tinycast-competitive-analysis-2026-10-11.md`](./tinycast-competitive-analysis-2026-10-11.md)：Tinycast 近三个月功能演进与用户口碑，含 Tuff 高频体验、窄迁移、按需 AI／语音及未来方向建议；调研完成，优化建议未实施，不改变现有版本范围。
- [`pulse-system-monitor-extension-analysis-2026-10-11.md`](./pulse-system-monitor-extension-analysis-2026-10-11.md)：Pulse 产品与平台边界调研，后续作为独立外置系统监控扩展；含 SDK 261011 现状、监控接口缺口、权限与生命周期设计及验收矩阵，建议未实施，未实测竞品性能。
- [`betterwispr-competitive-analysis-2026-10-12.md`](./betterwispr-competitive-analysis-2026-10-12.md)：BetterWispr 0.1.5 听写产品与源码调研，含中文后处理、隐私与跨应用输入边界、Tuff 现有能力对照及清理／纠错学习规则实测；优化建议未实施，未安装竞品或实测语音识别性能。
- [`voice-architecture-ecosystem-survey-2026-10-14.md`](./voice-architecture-ecosystem-survey-2026-10-14.md)：语音模型全景技术调研与 Tuff 指令二次确认/桌面语音选型报告，含阿里增强 7 模、智谱 GLM-ASR-Nano、SGLang-Omni MLX Native Voxt、通义 Qwen3-ASR-Flash 及 HN 爆火 EmbeddingGemma 288x 剖析；完成短指令控制与长语音听写的分层定位与三级架构设计。
- [`electron-browser-feasibility-survey-2026-10-17.md`](./electron-browser-feasibility-survey-2026-10-17.md)：Electron 构建浏览器可行性与兼容性调研报告，含通用主力浏览器 vs. 垂直工作流/AI 浏览器的技术壁垒对照（Chrome 扩展 MV3 缺陷、Widevine DRM 授权缺失、自动填充与权限管理纯手搓、Tab 生命周期与内存膨胀、Brave/Muon 重构教训）及架构定界建议。
- [`file-provider-architecture-refactoring-analysis-2026-10-18.md`](./file-provider-architecture-refactoring-analysis-2026-10-18.md)：`file-provider.ts`（4,073 行）巨石架构深拆分析与 4 角色解耦演进方案（SRP Wave C 规划），含已抽离 20+ 服务但宿主仍膨胀的归因剖析、4 角色解耦模型、4 步平滑迁移路径与 3 条工程底线。
- [`omp-runtime-and-tern-gui-integration-analysis-2026-11-01.md`](./omp-runtime-and-tern-gui-integration-analysis-2026-11-01.md)：omp 运行时与 Tern 预留协议 GUI 集成技术调研报告，含内置 `pi` 切换为 `omp` 的可行性、Tern 协议（Carly / ACP / Control Socket）接入路径、omp 为什么不能直接作为 Node 进程内 npm 包的四重技术鸿沟（Bun 绑定、事件循环阻塞、崩溃扩散、生命周期截断）及以 SDK 包装器模式分发的方案，并规划了 `HomePage.vue` 巨石瘦身与 `intelligence-uikit` 的四阶段演进路线。


## 活报告

以下报告不带日期，随代码演进持续更新（发现修复或失效时就地勾除并注明原因）；2026-10-03 从迁移前的任务文档迁入，原文逐字保留：

- [`search-crossplatform-audit.md`](./search-crossplatform-audit.md)：搜索系统与跨平台风险的活审计 backlog。
- [`search-index-split-write-acceptance.md`](./search-index-split-write-acceptance.md)：search-index split 写路径的应用级验收矩阵与执行记录。

## 复核要求

1. 生成或更新 evidence 后，先确认 manifest/checklist/README 引用的 artifact 存在。
2. raw/log/user-data 必须保存在 ignored 路径。
3. 提交前执行 `git diff --check`。
4. 含 JSON artifact 的报告至少确认 JSON 可解析。
