# CoreBox 应用搜索优先与索引减负

## Goal

老板 2026-09-26 的反馈："应用搜索为啥这么慢，老是出现搜索 loading 脉冲，应用无论何时都应该优先快速"。
分析结论（详见 research/analysis-2026-09-26.md）：应用匹配被绑在文件索引的数据路径上，脉冲语义又把"会话未结束"当成"还在加载"。本父任务把修复拆成四个可独立验证的子任务，并负责最终集成验证。

## Source Requirements

1. 应用结果必须在快层窗口（80ms）内返回，不再走"迟到结果"通道被追加到已渲染行下方。
2. 快层 provider 的索引读不得排在文件 provider 的慢查询后面。
3. 搜索脉冲只在"当前查询还没有任何结果上屏"时出现；已有结果、后台仍在补文件时用更弱的提示。
4. 文件索引停止膨胀：排除 Go 模块缓存等开发缓存目录，全量扫描断点续跑而不是每次启动从零开始，遗留 base64 图标行有清理路径。

## Child Task Map

| 子任务 | 交付物 | 依赖 |
|---|---|---|
| 09-26-app-search-in-memory-match | app-provider 不再对 9GB 索引发 FTS/关键词 SQL；内存匹配器 + 单测 | 无 |
| 09-26-search-read-fast-lane | 快层 provider 独立读 worker 车道；单测 + 合约测试 mock 更新 | 无（与上一项互补） |
| 09-26-corebox-pulse-semantics | 渲染层脉冲条件改为"当前查询无结果上屏"；弱提示；i18n | 无 |
| 09-26-file-index-bloat-control | 排除规则、断点续扫、遗留图标清理 | 图标迁移由其他会话进行，需协调 |

## Cross-Child Acceptance Criteria

- [x] `pnpm -C apps/core-app run typecheck:node` 通过（2026-09-26 14:1x）。
- [x] 子任务定向 vitest 通过；`search-engine`、`addon/apps`、`addon/files/services` 的剩余失败均来自其他会话的未提交改动（`win.test.ts` 图标路径、`indexing-worker-persist-entry-mapper` 两处、`file-index-persistence-repository.lock.test.ts`），与本任务文件无关。
- [x] 真实 dev 应用（CDP 探针 `/tmp/tuff-cdp/app-search-probe.mjs`）：`obs` 99ms 首批即为应用（Obsidian #1）；`visual` 99ms Visual Studio Code #0；`code` 204ms 首批全为应用。旧代码同机基线：`code` 应用 1573ms 追加在对话行之下，`obs` 3.5 秒内 Obsidian 未出现。见 research/baseline-2026-09-26.md。
- [x] 应用查询不再经过共享读 worker：日志 `App search catalog loaded { entries: 156, durationMs: 19–46 }`，`onSearch` 内存路径零 SQL。
- [x] 脉冲语义（子任务 corebox-pulse-semantics）由 talex-touch-40 在其区域落地（`useSearch.ts` / `CoreBox.vue`，随其 CoreBox 工作提交，不在本 PR）。真机探针（HMR 生效后）：`visual` 首行 156ms 上屏、光晕全程未亮；无结果查询 `zzqqxxv` 在最后一键后约 600ms 亮起、会话结束后熄灭。老板决定 settling 提示默认 sr-only；三处偏差（同查询重跑算 settling、执行时重置、不降低文字不透明度）经本任务确认。

## Notes

- 未经老板明确要求不 commit / push。
- 共享工作树：talex-touch-0d 会话确认不碰本任务文件；lang JSON 只加键不重排。图标迁移归属待 talex-touch-40 确认。
