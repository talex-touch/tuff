# 模型菜单筛选条改用 TxFilterChips：provider 级 chip、滑动指示器与固定单行

Parent: `.trellis/tasks/09-06-model-menu-redesign`
前置：`09-06-home-model-menu-channels`（渠道分层已落地：图标表、分组头、行换 TxCardItem）。

## Goal

筛选条从手搓按钮换成 tuffex 的 `TxFilterChips`，回到 **provider 一层**（pi 只有一个 chip），
单行固定高度不再折行，切换时有滑动指示器。渠道的分类职责整个交给列表的分组头。

## 需求来源

用户在真机看到上一轮结果后连提四条（2026-09-06，截图批注）：

1. 「不同 tabs 切换的动效呢」
2. 「为什么不用 tuffex 组件」
3. 「高度要固定！」
4. 「这个 touchapi grok 啥的都属于 pi 里面的 所以只有一个 pi 然后是 list 分类！！」
5. 「放icon啊！」——落地成纯文字 chip 后追加：三个 chip 排一行读作一句话
6. 「极度糟糕。。」——图标 + 文字版：仍连读成句、Local Model 与 Pi 图标相同、选中行多出一圈蓝边。拍板回到 v2 原设计的纯图标 tab
7. 「你自己测试过吗」「非常糟糕」——纯图标版在真机上文字仍在、指示器不画。两个缺陷都只在浏览器暴露（见 design §8），已修并有真机截图

第 4 条**推翻了上一轮的选择**（当时选的是「混排 + 分组头都要」）。真机上 8 个渠道 + 星标 + provider
把 30px 的槽撑成两行（截图里 `T` 单独掉到第二行），所以维度要收回 provider，渠道只在列表里分类。

## Background

- 现状筛选条是 `HomeModelMenu.vue` 里手搓的 `.HomeModelMenu-Filter` 按钮 + `flex-wrap: wrap`
  + `max-height: 64px`（两行封顶，上一轮为容纳 10 个 tab 加的）。切换只有 `background-color`
  0.15s 过渡，没有任何位移动效。
- `TxFilterChips`（`packages/tuffex/packages/components/src/filter-chips/`）语义对口：
  `role: 'toolbar'`（默认）下 chip 是 `aria-pressed` 切换按钮、方向键只移焦点不改筛选，
  与现状逐条一致；且 **`toolbar` 绕开了上一轮 design §4 明确否掉的「`tablist` 塞在 `role="menu"` 里」**。
  它自带 `overflow-x: auto` + 隐藏滚动条 + `flex: 0 0 auto`（26px chip），**天生单行固定高度**。
- 它**没有滑动指示器**：`.is-active` 是每个 chip 自己的 `background` / `box-shadow` / `color`
  0.2s 过渡。`TxTabs` 有完整的 pointer 实现（5 种 variant × 5 种 motion），但那是 900 行组件里的
  内联实现，不是可复用 composable，整套搬过来远超一条筛选条需要的量。
- `FilterChipItem` 只有 `value` / `label` / `dot` / `count` / `disabled`，**没有图标字段**——
  而它的兄弟 `TabBarItem` 与 `CardItemProps` 都有 `iconClass`。本任务补上这个空缺（真机看过纯文字版
  之后追加，见需求来源第 5 条）。
- 现存消费者：只有 `apps/nexus` 的两个文档 demo，**没有产品消费者**。模型菜单是第一个。

### 约束来源：BUI 家族硬规则（`.trellis/spec/frontend/bui-component-family.md`）

`tx-bui-*` 组件加动效受这几条直接约束：

- 规则 2：reduced motion 逐组件处理——砍 tween、保留状态机、延迟也归零，且**必须用编译 SCSS 的契约
  测试验证**（`sass.compileString` + 断言，参照 `context-cards-motion.test.ts`）。
- 规则 3：class 前缀 `tx-bui-filter-chips__*`；不得挂 `.tx-card` / `.tx-base-surface`。
- 规则 4：`<style lang="scss">` 非 scoped；每个 `var()` 带内联兜底；BUI 半透明用
  `color-mix(in oklab, …)`；不写 `@supports` 兜底层。
- 规则 8：SFC 保留 MIT 头。

## Requirements

1. **筛选条换成 `TxFilterChips`**，`role="toolbar"`，单选；chip 为**纯图标**（`iconOnly`），
   名字在 `aria-label` / hover `title` 上：星标 + 每个 provider。pi 与其它 local provider 的图标
   必须可区分。手搓的 `.HomeModelMenu-Filter*` 样式全部删除。
   （形态经历纯文字 → 图标+文字 → 纯图标三轮，见需求来源 5、6。）
2. **维度回退到 provider**：`ModelFilter` 从 `{kind:'bucket', key}` 改回
   `{kind:'provider', providerId}`；`visibleChoices` 按 `providerId` 过滤。
3. **渠道分类只在列表**：`bucketOf` / `visibleGroups` / 分组头保留不动——进入 Pi 后按
   `codex` / `cpa` / `touchapi` 出组头，这就是用户说的「list 分类」。`model-source-icons.ts`
   继续服务组头，不废弃。
4. **单行固定高度**：永不折行，溢出横向滚动（`TxFilterChips` 自带）。
   删掉上一轮加的 `flex-wrap: wrap` 与 `max-height: 64px`。
5. **滑动指示器**（tuffex 侧）：切换时活动态从旧 chip 平移到新 chip，而不是两处各自淡入淡出。
   静止观感与今天一致（白底 + 描边阴影），只是把它从每个 chip 挪到一个共享元素上。
6. **reduced motion**：`prefers-reduced-motion: reduce` 下指示器不做 tween，直接落位；
   按 BUI 规则 2 用编译 SCSS 契约测试钉住。
7. **首帧不滑**：面板打开时指示器直接出现在活动 chip 上，不得从 0 或从上一个位置滑过来。

## Constraints

- 不动数据层：`useModelOptions` / `ModelChoice` / pi 目录读取一律不碰。
- tuffex 改动同 commit 带 Nexus zh/en 文档（前端硬规则），并核查 wrapper 页面。
- 指示器只做**一种**观感（pill）与**一种**运动（平移+宽度补间），不复制 TxTabs 的 5×5 矩阵。
- ARIA 不退化：chip 仍是 `aria-pressed` 的 toolbar 按钮；指示器 `aria-hidden`，不进焦点序。
- 只有两个文档 demo 会跟着变观感，需在同一轮里确认它们仍然读得通。

## Acceptance Criteria

- [ ] 筛选条只有 收藏 / Local Model / Pi 三个 chip（本机数据），**纯图标且三个互不相同**，hover 显示名字，**永远单行**，高度恒定
- [ ] 选中行无蓝色描边；面板上同一时刻只有搜索框一个焦点环
- [ ] 切换 chip 时活动底色平移过去，肉眼可见位移；首帧打开不滑
- [ ] 进入 Pi 后列表按 `codex` / `cpa` / `touchapi` … 出分组头；⌘1–9 仍跨组连续
- [ ] `prefers-reduced-motion: reduce` 下无 tween，且有编译 SCSS 契约测试证明
- [ ] 键盘：Tab 只落在活动 chip（roving tabindex），方向键移焦点不改筛选，Enter/Space 才切换
- [ ] `filter-chips.{zh,en}.mdc` 补指示器的 props / 交互契约 / 最佳实践 / 覆盖说明，两个 demo 仍成立
- [ ] `npm run typecheck:web`、两个包内 eslint、相关 vitest 全绿
