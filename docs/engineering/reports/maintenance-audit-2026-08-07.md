# 维护审计：需处理项（2026-08-07）

仅记录仍需动作的问题。任务状态、责任人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-06 审计](./maintenance-audit-2026-08-06.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 严格发布验收仍缺 manifest** — 2026-08-07 执行 `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以退出码 `1` 结束，诊断为 `Unexpected end of JSON input`。这是缺少采集输入，不是已提交 manifest 的回归。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态，写入 manifest 后重跑严格校验。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真实主机闭环缺失** — macOS 官方可信 N+1 包仍缺后台准备、单击、静默替换、自动重启与 health-ack 证据；OTA 父契约还缺 Windows/Linux 的真实 handoff、恢复与 health 证据。静态检查不得替代真实主机运行。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 本地未签名包不能满足 native trust `pass`；需对官方 attested N+1 包重跑 real-profile smoke。跟踪：[#310](https://github.com/talex-touch/tuff/issues/310)。
- **发布日志缺工作流与视觉验收** — `07-27-bilingual-whats-changed` 仍记录 actionlint 本机不可用，且 Electron desktop/narrow screenshots 被 release-build startup guard 阻塞。需在有 actionlint 的环境跑 `.github/workflows/build-and-release.yml`，并在无构建占用时补截图；不可将自动化检查等同视觉验收。跟踪：[#482](https://github.com/talex-touch/tuff/issues/482)。

## 数据库、功能与跨平台门禁

- **搜索索引分库仍可静默丢数据** — `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭，但环境变量仍可启用半迁移模式：剩余 provider/embedding 写入 `database.db`，读取改走 `search-index.db`。应完成每个 writer 的 worker 归属和 flag-on 应用证据，或在完成前硬禁用运行时开关；不得维持可公开激活的半迁移模式。跟踪：[#331](https://github.com/talex-touch/tuff/issues/331)。
- **SQLite writer ownership 分散** — scheduler、retry、worker、admission 与 observer 的职责尚未收敛，新的写路径可绕过策略。完成 #331 后需建立 owner map、显式窄 bypass 与真实锁竞争/恢复测试。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **大目录索引的结构性内存风险已缓解，但量化发布门禁未完成** — #480 的 2026-08-07 复查确认 worker、生产 client 与 reconciliation 已改为流式/有界路径，累积版 `scan()` 也已从生产代码删除；但尚无百万项 fixture、明确内存预算、三层峰值测量、取消/关机释放和打包响应性证据。应将 #480 收窄为该基准与验收工作，未通过前不能宣称 OOM 风险已完成关闭。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 架构发布策略未决** — 配置当前仅产出 `darwin/arm64`。需明确 arm64-only 并在下载/OTA 中显式拒绝不支持架构，或交付 x64/Universal 的签名、公证、清单、选择逻辑和真机矩阵。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 安全与发布治理

- **认证运行时的 Critical 依赖未升级** — `next-auth@4.24.14` 与 `@auth/core@0.34.3` 低于修复版本，处在 Nexus 身份边界；#329 仍是 P0 发布阻塞。升级后必须验证认证路由、Cloudflare 构建及生产依赖审计，不能以 ignore 代替修复。跟踪：[#329](https://github.com/talex-touch/tuff/issues/329)。
- **51 条 Dependabot 告警尚未形成可发布的处置门禁** — 2026-08-07 的已分诊基线为 3 critical、20 high、25 medium、3 low，全部有补丁；critical 集中在 #329。仍缺每条 critical/high 的责任人与目标日期，以及发布前对新 critical/high 的分诊门禁。告警数不是可达性结论。跟踪：[#483](https://github.com/talex-touch/tuff/issues/483)。
- **全仓治理审计的高风险发现待纳入修复排序** — `08-05-full-repo-governance-audit` 已记录 454 个已验证问题（104 high），其中 #838 追踪 renderer CSP、raw IPC、插件通道 default-deny 与文件写入组合形成的 write-then-execute 链。需按已建立的全局顺序为发布阻塞和 exploit-chain 项分配修复任务与验收，不能把“已建 issue”误作风险关闭。

