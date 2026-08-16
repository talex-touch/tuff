# Implement — Beautiful UI → tuffex 移植

前置阅读顺序（所有实现 agent）：本文件 → design.md → 自己簇的 research/fusion-*.md → research/style-bridge-and-conventions.md §Part 4（仓库约定）。BUI 原始源码与截图在 research/beautifului-src/。

## Phase A — 基础设施（主会话，串行，先行）

- [ ] A1 `packages/tuffex/packages/components/style/bui-tokens.scss` 新建（33×2 token + 3 圆角 + mono 字体；排除 lexi/ld；overlay 暗色环用 line-strong）
- [ ] A2 `style/mixins.scss` 追加 bui-scope / 9 个 bui-keyframes-* / shimmer-text-surface / fade-up-in / pop-in / disclosure-collapse / tabular-nums / card-bar / card-pad / press-scale（rm 内建；stream-in 写 blur(0)）
- [ ] A3 `style/variables.scss` 追加 `--tx-ease-out-strong`
- [ ] A4 `style/index.scss` 挂 bui-tokens
- [ ] A5 `scripts/audit-package-size.mjs` LIMITS：baseCssBytes +8KiB、fullCssBytes +96KiB
- [ ] A6 验证：`pnpm -C packages/tuffex build` 绿 + `node ./scripts/audit-package-size.mjs` 绿
- 回滚点：A 全部是纯新增/两处小改，`git checkout -- <file>` 即回滚，无组件依赖。

## Phase B — 组件波次（6 个并行 agent，文件集互斥，详见 design.md §6）

每个组件的 DoD（各 agent 自查）：
1. 目录范式：`src/<kebab>/index.ts`（withInstall 路径 `'../../../utils/withInstall'`、导出 `Tx*` + types + `Tx*Instance`）+ `src/Tx*.vue` + `src/types.ts` + `__tests__/`
2. SFC：`defineOptions name`、withDefaults、emits 元组、defineSlots、`<style lang="scss">` 非 scoped、MIT 署名头、rm 块、keyframes 经 mixin emit
3. design.md §4 横切约定逐条过（受控原语 / a11y 补齐 / 缺陷修正 / 类名前缀 / var 回退 / U+2212）
4. `pnpm -C packages/tuffex test -- <name>` 绿；**不改共享文件**（barrel/README/nexus 插件/registry 一律不动）
5. 文档对 + demo（组件稳定后同 agent 续写）：mdc 8 字段 / 中文段名 / zh-en 段数相等；demo 复刻 BUI 时间轴

- [ ] B-W1 状态簇：working-indicator / agent-trace / task-rows / code-stream
- [ ] B-W2 聊天簇：inline-citation / prompt-bar ＋ sources、suggestion-chips 变体 ＋ 07 showcase demo
- [ ] B-W3 动作簇：approval-card / tool-chips / recommendation-card / signal-meter / selection-actions ＋ base-anchor flip prop
- [ ] B-W4 表格簇：diff-table / filter-chips / dot-indicator / cell-link ＋ data-table 扩展、checkbox indeterminate、tag 扩展 ＋ 12 records 组合 demo
- [ ] B-W5a 导航簇：context-cards / sidebar-nav / search-panel / icon-chip
- [ ] B-W5b 卡片簇：insight-cards / spark-chart / allocation-bar / fine-tune-card / scrub-field
- 回滚点：每个组件目录独立可删；现有组件扩展（data-table/checkbox/tag/sources/suggestion-chips/base-anchor）每项独立 commit-able，出回归单独 revert。

## Phase C — 共享文件集成（主会话，波次完成后串行）

- [ ] C1 `components.ts` barrel 字母序插入 24 行
- [ ] C2 `README.md` + `README_ZHCN.md`：总数 126→150、分类清单行（多数进 AI & Content，计数=条目数）
- [ ] C3 `apps/nexus/app/plugins/tuffex.ts`：24 组 loader + GLOBAL_TUFFEX_COMPONENTS（子导出 TxContextChunk/TxChartScrubber/TxDiffChips 也要能在 mdc demo 里用到的都注册）
- [ ] C4 `demo-registry.ts` 字母序插入全部 demo key
- [ ] C5 `DocsSidebar.vue` COMPONENT_STANDALONE_PAGES 加 `/docs/dev/components/ai-suite`
- [ ] C6 ai-suite.zh.mdc + en.mdc（19 组件完整案例 + 链接 + MIT 署名段）
- 验证：C 之后立即跑 Phase D 全矩阵。

## Phase D — 验证矩阵（design.md §7）

- [ ] D1 `pnpm -C packages/tuffex build` → typecheck → test → 四 audit
- [ ] D2 `pnpm -C apps/nexus typecheck`（包装层）→ `check:mdc-fences` → `test`
- [ ] D3 `pnpm lint:changed`
- [ ] D4 CDP 截图抽查 ≥6 组件 × 明暗（对 shots/），记录到任务 research/verify/
- [ ] D5 zh/en 段数核对（26 对 mdc）

## Phase E — 收尾

- [ ] E1 audit LIMITS 按实测回收裕度
- [ ] E2 spec 更新（trellis-update-spec：BUI token 层约定、bui mixin 用法）
- [ ] E3 提交（分组 commit：A 基础设施 / 各簇 / 集成 / 文档）
- [ ] E4 交付链接给用户：`/docs/dev/components/ai-suite`
