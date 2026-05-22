# 微审计 49/70

- 审计主题

Raycast / Alfred / uTools 的键盘优先体验，是否能映射到 Tuff 当前 CoreBox 的 list/grid 导航、分组 grid 导航、快捷数字聚焦、Action Panel 打开与 Escape 分层退出，而不是只停留在文档描述。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
   - 第 3 节把 keyboard hook 归纳为：Enter execute，ArrowUp/Down list/grid，ArrowLeft/Right grid，`Cmd/Ctrl+K` MetaOverlay，数字聚焦，Esc 顺序清理 clipboard/provider/query/window。
   - 第 4 节把键盘导航差距写成 evidence 问题：缺 section/page/category jump evidence、grid section wrap 行为验收，而不是要求先复制竞品全部快捷键。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 49 条明确判断：Keyboard navigation 已覆盖 grid/list，仍应补体验审计样本。
3. `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
   - `Cmd/Ctrl+K` 会基于当前 focus item 或 active plugin feature 组装 builtin actions 与 item actions，并通过 `MetaOverlayEvents.ui.show` 打开动作面板。
   - `ArrowDown` / `ArrowUp` 在 grid 模式下按 columns 跨行移动；存在多 section 时走 `navigateGridDown()` / `navigateGridUp()`，可以在推荐区与 pinned 区之间移动。
   - `ArrowLeft` / `ArrowRight` 在 grid 模式下横向移动；`Meta+Left` / `Meta+Right` 保留给计算历史面板。
   - `Cmd+1` 到 `Cmd+0` 可把 focus 直接切到前 10 个结果。
   - `Escape` 的处理顺序是：先尝试关闭 MetaOverlay，再清理 clipboard/file attachments，再退出 active provider，再清空 query，最后隐藏 CoreBox。
4. `apps/core-app/src/renderer/src/components/render/BoxGrid.vue`
   - `containerLayout.sections` 会被转换成带 `startIndex` 的 section 数据，`BoxGridItem` 的 active 与 click 都使用全局 index，和 `useKeyboard.ts` 的跨 section focus index 模型一致。
   - grid item 会显示 `⌘1` 到 `⌘0` quick key，和 `useKeyboard.ts` 的数字聚焦相互对应。
5. `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
   - `isGridMode` 由 `boxOptions.layout?.mode === "grid"` 决定；grid 模式渲染 `BoxGrid`，list 模式渲染 `CoreBoxRender` 列表。
   - `handleGridSelect()` 复用普通 item trigger，说明鼠标选择与键盘 focus / execute 落到同一执行入口。
6. `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
   - 搜索结果会把 `initialResult.containerLayout` 写入 `boxOptions.layout`，因此后端返回的 grid/list 布局能真实影响前端键盘导航。
7. `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
   - `buildContainerLayout()` 会为推荐结果返回 `mode: "grid"`，并按 recommendations / pinned 生成 sections，说明分组 grid 不是前端孤立代码。
8. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffSearchResult.containerLayout` 与 `TuffSection` 是共享 DSL 字段，为 provider / recommendation 输出 grid/list 布局提供合同。

- 结论

主文档对该映射点的判断成立：Tuff 已经有真实键盘导航底座，且不是只覆盖最简单的上下列表。

当前实现至少形成了四层可用路径：

1. list 与 grid 共用同一个 focus index，并由 `boxOptions.layout.mode` 切换行为。
2. grid 模式下，上下键按列数跨行移动，左右键逐项移动；多 section grid 还能在 recommendations / pinned 等分组之间保持同列意图。
3. `Cmd/Ctrl+K` 已经能把 focused item 的 builtin actions 与 item actions 交给 MetaOverlay，足以作为 Raycast Action Panel / Alfred Universal Actions 的前端入口基础。
4. `Escape` 不是粗暴关闭窗口，而是按 MetaOverlay、clipboard/file input、active provider、query、window 的顺序收敛状态，符合命令面板的可恢复交互心智。

但这仍不是完整竞品级验收。当前缺口主要在可验证证据和自动化覆盖：`useKeyboard.ts` 里这些路径没有看到专门单测覆盖，已有测试更多集中在 `useActionPanel` / visibility / OmniPanel 局部交互；文档也没有宣称已经有 section jump、page jump、category tab 或文件菜单完整 parity。因此后续最小下一步应是补键盘脚本或定向测试样本，覆盖 list 15 项、grid 12 项、多 section recommendation、MetaOverlay 打开/关闭、clipboard attachment Esc 清理，而不是先改快捷键模型或复制竞品全量快捷键。

- 是否发现需修正的主文档问题

否。`05-search-performance-ranking.md` 与 `11-100-round-cross-review-ledger.md` 对键盘导航的表述与源码一致：当前已有 list/grid、分组 grid、数字聚焦、Action Panel 入口和 Esc 状态机；缺口是 release evidence 与更细的 section/page/category 行为验收，不是主文档事实错误。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-49.md`，未修改业务代码、未修改 01-11 主分析文档、未修改 `docs/INDEX.md` / README / TODO / CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
