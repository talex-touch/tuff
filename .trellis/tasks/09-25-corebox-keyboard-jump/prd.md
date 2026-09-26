# CoreBox 下键选中跳到最后一个文件

父任务：`09-25-corebox-ux-polish`。调研：`research/root-cause.md`。

## Goal

输入文件扩展名这类纯文件查询时，结果分批流入的过程中，默认高亮始终停在排名第一的结果上；按 ↓ 从第 1 行移到第 2 行，不再"跳"到屏幕外或最后一个文件。

## Background

- 同事 @程耀宇（Crosery）反馈：「我输入了对应文件扩展名，下键 / 默认调到最后的一个文件 / 跳」。
- 根因（已用真实 `useSearch` + `useKeyboard` 在 `/tmp/kbjump` 复现，置信度：机制高，与同事现场吻合中高）：
  1. 纯扩展名查询几乎没有 app 命中，第 0 行先被第一批文件占住。macOS 上 Spotlight 与索引各自完成后各发一个 update（`search-gather.ts:472-491`），每批在 main 侧排序后下发（`search-core.ts:1603-1619`）。
  2. 扩展名查询下所有文件的匹配分相同，先后只取决于 recency。Spotlight 结果带 recency（`native-file-search-provider.ts:213-221`），索引结果写死 `recency: 0`（`file-provider-search-result-service.ts:313`）。两个来源对同一个文件用同一个 id（`utils.ts:232`），所以后到的一批会让列表重排。
  3. renderer 合并时按分数重排（`useSearch.ts:546-579`），并让选中跟随 item id（`useSearch.ts:1110` 取 `res[focus].id`，`1129` 调 `restoreFocusedItem`）。这一步不区分是默认的第 0 行还是用户移过去的行，于是高亮跟着原来第 0 行的那一项漂到第 20–50 行，甚至最后一行。
  4. 列表模式下 focus 变了不会滚动。`scrollActiveItemIntoView` 只在按键结束（`useKeyboard.ts:1062`）和 grid 重排时调用，高亮停在屏幕外；按一次 ↓ 视口才滚过去，表现为"跳到最后"。
  5. 索引提交触发的 `preserveSelection` 刷新（`useSearch.ts:1201-1203`、`1401-1445`）走的是同一个问题。
- 引入：b592636ce（2026-08-05，「selection follows item ids across re-ranks」）。在它之前合并只追加不重排，所以是回归。
- 已排除的假设：
  - grid 列数为 0 / NaN：有输入的查询一律走列表模式，见 `useSearch.ts:969`；
  - 预览面板压缩：只在 grid 下生效；
  - focus 被设成 `length - 1`；
  - `select` 不同步；
  - 悬停改 focus；
  - 键盘监听重复注册。

## Requirements

- **R1**：用户没有主动移动过选中（focus 为默认的 0）时，结果批次重排、索引提交刷新都不改变高亮，高亮始终在排名第一的结果上。
- **R2**：用户主动移到某一行（focus > 0）之后，保留"选中跟随 item"的既有契约。原因是 Enter 必须执行用户看到的那一项，见既有用例 `keeps the selection on the same item across a re-rank`。
- **R3**：修复限定在 renderer，不改 main 侧打分。main 侧补齐索引结果 recency 能减少重排，但只能减轻，不能根治，记为后续可选项。
- **R4**：用户主动选中的行（focus > 0）被后到的批次挤走时，选中继续跟随该项，并且如果它离开了视口，列表立即（不带平滑）滚到能看见它的位置。新查询把 focus 重置为 0 时滚回顶部。这与 `09-25-corebox-list-motion` 审计方案 D 是同一处改动，归本任务实现。（老板 2026-09-26 确认"跟随并滚进视口"）

## Technical Notes

最小修复只改 `useSearch.ts` 两处，都加 `boxOptions.focus > 0` 的判断。补丁版已在 `/tmp/kbjump/useSearch.fixed.ts` 验证，现有 `useSearch.rank.test.ts`（7 个）和 `useSearch.core.test.ts`（30 个）全部通过：

- `useSearch.ts:1110`：`const focusedItemId = boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null`
- `useSearch.ts:1201-1203`：`options.preserveSelection && boxOptions.focus > 0 ? … : null`

## Acceptance Criteria

- [ ] AC1（R1）：
  - 复现场景 A / B / F / H（见 research §2.7）在修复后，批次落地后 focus 都保持 0，按 ↓ 变为 1；
  - `useSearch.rank.test.ts`、`useSearch.core.test.ts`、`useKeyboard.test.ts` 全部通过。
- [ ] AC2（R2）：场景 G，即用户先选到第 2 行，之后被新批次超过：选中仍跟随同一个文件。
- [ ] AC3：真机上 ⌘E 依次输入 `pdf` / `docx` / `png`，每次等两批到齐，第 0 行始终高亮；按 ↓ 前后用只读 CDP 读到的高亮行号为 0 → 1，列表不跳。
- [ ] AC4：core-app 包内 eslint、`vue-tsc -p tsconfig.web.json` 通过，`git diff --check` 干净。

## Out of Scope

- main 侧给索引结果补 recency（可选的后续减轻手段）。
- 从开始搜索到 snapshot 到达之间按键、下标沿用到新列表的问题（research §4 第 2 条，属于另一种较少见的跳动）。
