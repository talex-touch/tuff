# 维护审计：需处理项（2026-08-16）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-14 审计](./maintenance-audit-2026-08-14.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布、运行与人工验收

- **发布包没有截图 native addon 的硬性产物门。** [#321](https://github.com/talex-touch/tuff/issues/321) 仍确认 release workflow 未构建、未要求且未从打包运行时加载 `tuff_native_screenshot.node`；干净 runner 可发布后退化为 `ERR_NATIVE_SCREENSHOT_UNAVAILABLE`。需先决定「截图能力是否为发布必备」：若是，发布 job 必须先构建，再在 release-only preflight/afterPack 以及 packaged self-check 中 fail closed；不能先加必需文件检查，否则会立即阻断每次发布。
- **Windows Everything 仍缺打包交互验收。** [#308](https://github.com/talex-touch/tuff/issues/308) 需要 Windows 打包 CoreBox 录入普通、`@file`、结构化筛选及结果/空态/降级态，并以完整 manifest 通过严格验证。`windows:acceptance:verify` 在未提供 JSON manifest 时按设计以 `Unexpected end of JSON input` 退出；这不是已采集证据的回归。
- **OTA 和发布说明仍缺真实宿主证据。** [#326](https://github.com/talex-touch/tuff/issues/326) 尚缺 Windows/Linux 实际 handoff、health/recovery 和 N/N-1 兼容验证；[#482](https://github.com/talex-touch/tuff/issues/482) 尚缺运行中 CoreApp 的桌面及窄窗口 release-notes/Update-history 截图。静态检查、CI 和 macOS 启动探针不可替代。

## 数据库与安全门禁

- **默认开启的 search-index 分库仍无隔离 profile 运行证明。** `07-28-migrate-search-index-split-write-paths` 已与 default-on/`=0` rollback 合同同步，但其验收仍要求：首启重建、应用/文件结果和计数一致、`search-index.db` 已填充、无 WAL/busy 风暴，以及实际 `=0` 回退。未验证 writer 仍可能造成静默数据偏移；这是当前 release gate，不是待开启功能。
- **SQLite 写入所有权未覆盖完整可变域。** [#351](https://github.com/talex-touch/tuff/issues/351) 的 guard 目前只约束 search-index 三表；71 张 schema 表中已有写入的 59 张仍需完成 owner map、准入/退避合同和争用/关机恢复证据。先由架构 owner 定义多写入域的合法 owner，再扩展 guard；不能把现有写入点机械固化为契约。
- **Renderer CSP 收紧仍待真实使用数据。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 `script-src` wildcard 和 `unsafe-inline` 已移除；剩余强制策略的 `default-src`/`connect-src` wildcard 只能在 report-only 违规日志经真实使用（含 widget、Nexus、Sentry）无违规或得到明确 origin 清单后提升。`unsafe-eval` 仍由预编译 widget 的 `new Function` 路径依赖，不能作为 CSP 清理顺手删除。

## 任务记录、文档与路线图

- **in-progress Trellis 记录缺少继续条件。** 本条原先点名的另外两个任务目录并不在仓库里（一个被 `.git/info/exclude` 显式排除，一个未跟踪），断言只在作者本机成立、任何人都打不开，`check:audit-report-claims` 因此拒绝该结论；此处不再复述其名称，否则同一条规则仍会命中。仓库内可验证的那一个 `08-15-local-nexus-publish-path` 当时确实缺 `meta.nextAction`/`blocker`/`evidence` 三字段，现已补齐真实内容并通过 `docs:verify`。若那两个任务确需跟进，应先让其进入仓库再重新下结论。跟踪：[#309](https://github.com/talex-touch/tuff/issues/309)。
- **CatalogService 的文档收尾未完成。** `07-13-catalog-service-mvp` 已勾选前八项验收，唯一未勾的是 R8 PRD、执行计划、质量基线、changelog、任务工件与开发者文档的 completed/open 边界。路线图只写“暂停”不能替代该边界，需完成文档更新或明确实际未满足的条件。
- **全仓治理审计已建 issue，PRD 未回填验收。** `08-05-full-repo-governance-audit` 记录已提交 454 项 verified finding（另有 #838 链路），但其 `prd.md` 六项验收仍未逐项和 `research/filed.jsonl` / `research/audit-summary.md` 对账。需做该对账或拆分未完成项，不能把「已 filing」当作任务完成。

## 本轮已排除的旧说法

- `v2.4.14-beta.8` 的 Build and Release run `31778105595` 已全部成功，包括 macOS、Windows、Linux、Create Release 与 Nexus sync；2026-08-14 报告中的发布失败已失效。
- 根 package 与 `apps/core-app` 的 version、description、author、homepage、license 一致；未发现同步器管理字段漂移。
- 文档相对链接审计通过（680 文档、944 链接、0 finding）。

## 推送回执基线

- GitHub 在本次推送回执中报告默认分支有 16 个 Dependabot alerts（6 high、7 moderate、3 low）。这只是告警库存基线，不表示运行时可达性、可利用性或本次文档分支引入了漏洞；需要依赖安全负责人逐项分流与处置。
