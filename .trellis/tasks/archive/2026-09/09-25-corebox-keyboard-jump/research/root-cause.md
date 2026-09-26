# Research: CoreBox 输入文件扩展名后按 ↓，选中跳到列表末尾

- **Query**: 同事反馈「我输入了对应文件扩展名，下键 / 默认调到最后的一个文件 / 跳」——输入 `pdf` / `docx` / `png` 这类扩展名后按 ArrowDown，选中项没有从第 1 行移到第 2 行，而是跳到了列表底部。
- **Scope**: internal（renderer 的 useSearch / useKeyboard / CoreBox.vue，以及 main 进程 search-core / gather / sorter / 文件 provider）
- **Date**: 2026-09-26
- **行号基准**: `useSearch.ts`、`useKeyboard.ts` 与 HEAD 一致（工作区未改）；`CoreBox.vue` 按当前工作区计（另一会话加了 SearchPulse，约 +20 行）。

---

## 1. 复现条件

以下条件同时满足时触发：

1. **查询内容是纯文件查询**，例如 `pdf`、`docx`、`png`。这类查询几乎没有 app 或 feature 标题命中，快层 snapshot 通常为空或只有低分项，所以第 0 行先由某一批**文件**占住。
2. **文件结果分多个 `update` 批次到达**。macOS 上 `macos-spotlight-provider` 和 `file-provider`（索引）都是 deferred provider，各自完成后各发一个 update（Linux 同理：`linux-native-file-provider` + `file-provider`）。
3. **后到的批次把第 0 行那一项挤了下去**。两个来源对同一路径的打分不同（第 2 节第 3 条），后到的批次又会用同 id 替换先到的副本，所以重排几乎每次都会发生。
4. **用户还没动过选中**（focus 仍是新查询开始时重置的 0）。批次到齐后按 ↓，或者在两批之间按 ↓，都会触发。

用户看到的现象：批次落地后，高亮已经离开第 0 行，停在屏幕外很远的位置（第 20–50 行，某些情况下就是最后一行），列表本身不滚动。预览面板显示的是那个跑远了的文件。按一次 ↓ 后 `scrollActiveItemIntoView()` 把视口滚过去，于是表现为「一按下键就跳到最后面的文件」。

Windows 上较少见：`routeWindowsFileProviders`（`search-query-orchestrator.ts:138`）在 Everything 和 `file-provider` 之间只留一个，Everything 本身又是 fast provider（`everything-provider.ts:167`）。所以只有「第 0 行是低分快层项、后来被文件批次超过」这一种形态会触发（见 2.6 的场景 F）。

---

## 2. 因果链（每一环附 file:line）

### 2.1 新查询把 focus 重置为 0，之后没有地方再区分「默认选中」和「用户选中」

- `useSearch.ts:1313-1316`：`if (!options.preserveSelection) boxOptions.focus = 0`。
- `useSearch.ts:938-973`：`applySearchSnapshot` 在非 preserve 时不碰 focus。`useSearch.ts:969` 把 `boxOptions.layout = undefined`，所以**有输入的查询一律是列表模式**，不会进入 grid。

### 2.2 main 进程：每个 deferred provider 完成后单独发一个 update，每批各自排序

- `search-core.ts:349-358` 注册 provider。macOS 上是 `macSpotlightFileProvider`（354）加 `fileProvider`（358），二者都是 deferred：`native-file-search-provider.ts:255`、`file-provider.ts:310`。
- `search-gather.ts:417,433`：存在 deferred provider 时，快层那次 update 的 `isDone` 为 false。`search-gather.ts:472-491`：deferred 层每完成一个 provider 就 `dispatcher.emit({ newResults: [result] ... })`（485），默认并发为 2（`search-gather.ts:56-63`）。
- `search-core.ts:1603-1619`：后续批次走 `mergeAndRankItems`（1608），也就是 `tuffSorter`，然后 `sendUpdateToFrontend(sortedItems)`（1618，定义在 1296-1302）。

### 2.3 对扩展名查询，两个文件来源给同一个文件的分数不同

- 排序分由 `tuffSorter` 写回 `scoring.final`（`tuff-sorter.ts:370-374`），计算在 `tuff-sorter.ts:286-337`。
  - 标题命中：`"report.pdf"` 按 `.` 切词后前缀命中 `"pdf"`，得 500（`tuff-sorter.ts:125-132`、`246-251`）。对扩展名查询来说，**所有文件的匹配分都一样**，都是 `500 × 20_000 + file kindBias 6 × 300`（`tuff-sorter.ts:5-18`）。
  - 所以决定先后的只剩 `recency × 500`（`tuff-sorter.ts:291`）和按来源计的 usage。
- native provider 会带上 `scoring.recency`（mtime 衰减，`native-file-search-provider.ts:213-221`）。索引 provider 写死 `recency: 0`（`file-provider-search-result-service.ts:313`，type-only 和 extension-only 两条路径见 456、498）。
- 同一路径在两个来源里的 id 相同，都是 `mapFileToTuffItem` 里的 `id: file.path`（`utils.ts:232`）。usage、pinned 则按 `sourceId:itemId` 注入（`search-usage-service.ts:81-87`），两个来源各算各的。
- 结果：同一个文件由另一个来源再送一次时，分数会变；而后到批次里的新文件也常常排到先到的文件前面。

### 2.4 renderer 按分数重排，并让选中跟着 item id 走，不区分选中是否是默认的

- `useSearch.ts:1106-1139`（`case 'update'`）：
  - 1110：`const focusedItemId = res.value[boxOptions.focus]?.id ?? null`。focus 是 0 时，取到的就是第 0 行那一项。
  - 1120：`searchResults.value = mergeRenderedItems(searchResults.value, items)`。按 id 合并后调用 `rankRenderedItems`（`useSearch.ts:546-579`），排序依次看 pinned、score 降序、previousRank、index。
  - 1129：`restoreFocusedItem(focusedItemId)`。实现在 `useSearch.ts:581-590`，把 focus 改成这一项重排后的新下标。
- 引入时间：b592636ce（2026-08-05，「selection follows item ids across re-ranks」）。在它之前，`mergeRenderedItems` 是按插入顺序合并的 Map，只追加不重排（`git show b592636ce^:.../useSearch.ts` 460-469），第 0 行不会动。**这是一次回归。**

### 2.5 index-commit 刷新走的是同一个问题

- `useSearch.ts:1401-1445`：query 非空时，每次索引提交都会触发 `handleSearchImmediate({ force: true, preserveSelection: true, ... })`（1437-1441），最短间隔 500ms。
- `useSearch.ts:1201-1203`：`selectedItemId = res.value[boxOptions.focus]?.id`。focus 还是默认 0 时也会记录下来，之后经 `pendingPreferredItemId`（`useSearch.ts:1090-1096`、`1111-1133`）把 focus 恢复到这一项的新位置，同样会跑到下面去。
- 72bb2f855（2026-09-13）加入了这段 preferred 恢复逻辑，同时开始索引 macOS 的 home 目录。索引提交因此更频繁，这条路径也就更容易走到。

### 2.6 focus 变了但没有任何滚动；要等下一次按键才滚过去

- `scrollActiveItemIntoView` 只有两处调用：按键处理结束时（`useKeyboard.ts:1062`，函数体在 1070-1113），以及 grid 重排时（`CoreBox.vue:790-809`，`watch(addon)` 只在 `isGridMode` 下执行）。列表模式下，`restoreFocusedItem` 改了 focus 之后没有任何东西滚动视口。
- 高亮留在屏幕外。`activeItem = res[focus]`（`useSearch.ts:1890`）指向那个跑远的文件，文件类型会打开预览面板（`CoreBox.vue:731-741`）。
- 按 ↓（`useKeyboard.ts:892-911`，列表模式 `step = 1`，见 902-909）：
  - 一般情况下 focus 变成漂移后的位置 +1。
  - 如果漂移后已经是最后一行、且结果超过 20 条，focus 不动（905-909）。
  - 随后 `scrollActiveItemIntoView()` 把视口滚到那一行。用户看到的就是「一按下键就跳到最后的文件」。

### 2.7 用真实 hooks 复现

不改仓库代码。测试放在 `/tmp/kbjump`：真实的 `useSearch` 和真实的 `useKeyboard` 共用同一个 `reactive` 的 `boxOptions`，按 main 进程的形态推送 snapshot 和 update，再派发 ArrowDown。分数按 2.3 推导：索引文件记 `BASE`，native 文件记 `BASE + recency × 500`，其中 `BASE = 500×20000 + 6×300`。

| 场景 | 批次 | 原代码：批次后 focus → 按 ↓ 后 | 打补丁后 |
|---|---|---|---|
| A | snapshot 空；index 50 → Spotlight 50（15 个路径重合，上限 80） | 0 → **50/80** → 51/80 | 0 → 1 |
| B | snapshot 空；Spotlight 30 → index 30（10 个路径重合） | 0 → **20/50** → 21 | 0 → 1 |
| F | snapshot 为 1 个低分 feature（token 命中）；随后 30 个文件 | 0 → **30/31（最后一行）** → 仍是 30，视口滚到底 | 0 → 1 |
| 首个 harness | index 30 → Spotlight 30（10 个重合） | 0 → 30/50 → 31，`scrollTo(1136)` | — |
| G（契约） | 用户先在第 2 行，之后新批次超过它 | 跟随同一项到 12/20 | 同左（保留） |
| H（刷新） | index-commit 刷新，preserveSelection，focus 0 | 0 → **10/21** | 保持 0 |

另外用补丁版跑了仓库现有的 `useSearch.rank.test.ts`（7 个）和 `useSearch.core.test.ts`（30 个），全部通过。现有两个 preserve 相关用例都设了 `boxOptions.focus = 1`，不受补丁影响。

---

## 3. 置信度与已排除的假设

**置信度**
- 渲染层的机制：**高**。已用真实 hooks 复现，并定位到引入它的提交。
- 同事遇到的正是这个问题：**中高**。精确落在哪一行取决于对方的数据（usage、recency、两批到达的先后），但测过的每一种到达顺序都会漂到屏幕外。「最后一行」对应场景 F，或者上限 80、漂移后落在底部附近的场景 A。

**已排除**

| 假设 | 排除依据 |
|---|---|
| grid 列数为 0、NaN 或过期，导致 ↓ 一次跨很多行 | 有输入的查询一律是列表模式（`useSearch.ts:969`）；grid 只来自空查询推荐（`useSearch.ts:988`）。而且 `resolveVisibleGridColumns` 在列数为假值时回退到声明值（`useKeyboard.ts:75-81`），`resolveBoxGridFitColumns` 在没测到宽度时返回上限（`box-grid-layout.ts`）。 |
| 预览面板压缩到 40% 引起重排或 FLIP | 只在 grid 下生效：`CoreBox.vue:807-809`、`860`。列表模式下它不改 focus。 |
| 有代码把 focus 设成 `res.length - 1` | 所有写 focus 的地方都查过：只有越界钳制（`useKeyboard.ts:1056-1060`，focus 在范围内时不起作用）和 ArrowUp 回绕（`useKeyboard.ts:927-932`）。报告里按的是 ↓。 |
| `select` 和 `boxOptions.focus` 不同步 | `select` 只在 Enter 时使用（`useKeyboard.ts:888`），不参与导航。 |
| 鼠标悬停改了 focus | `CoreBoxRender`、`BoxItem` 上没有 mouseenter 或 mousemove 处理器。`BoxInput.vue` 里的 `options.focus` 是组件自己的局部 reactive（30-32、94-95），不是 `boxOptions`。 |
| 结果先变少再变多，把 focus 钳到末尾 | `restoreFocusedItem` 找不到原来那一项时回到 0（`useSearch.ts:589`），不会去末尾；focus 为 -1 时由 `watch(res.length)` 置 0（`useSearch.ts:1839-1846`）。 |
| semantic recall 用原始 cosine 分（≤1）重发文件，文件沉到底 | 这些项确实绕过了 sorter（`search-core.ts:875-907`），但它只在 gather 的**第一次 update 同时就是最终结果**时才调度（`search-core.ts:1435`）。存在 deferred 文件 provider 时走不到这里。记为潜在隐患，不是本次原因。 |
| 键盘监听重复注册，或 IME 导致多次步进 | `useKeyboard` 只在 `CoreBox.vue:615` 注册一次；输入法状态下的 ArrowDown 也只走一步。 |

---

## 4. 修复方案（最小改动，只改 `useSearch.ts`）

原则：**只有用户主动移到的行（focus > 0）才跟随 item；默认的第 0 行始终停在排名第一的结果上。** 在 useSearch 内部，focus > 0 只会由用户操作产生（键盘、⌘数字、点击），或者由恢复用户之前的选择产生，所以可以用它来表示「用户动过」。已在 `/tmp/kbjump/useSearch.fixed.ts` 验证。

```diff
@@ case 'update'  (useSearch.ts:1110)
-                  const focusedItemId = res.value[boxOptions.focus]?.id ?? null
+                  // Only a row the user moved to is followed across a re-rank; the untouched
+                  // default (row 0) stays on the top result while batches stream in.
+                  const focusedItemId =
+                    boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
@@ executeSearch  (useSearch.ts:1201-1203)
-    const selectedItemId = options.preserveSelection
-      ? (res.value[boxOptions.focus]?.id ?? null)
-      : null
+    const selectedItemId =
+      options.preserveSelection && boxOptions.focus > 0
+        ? (res.value[boxOptions.focus]?.id ?? null)
+        : null
```

- 第 1 处修的是报告里的症状。`focusedItemId` 为 null 时，`restoreFocusedItem` 直接返回，focus 停在 0。1111-1119 里判断「刷新后用户移动过」的逻辑遇到 null 时不成立，pending 逻辑不受影响。
- 第 2 处让 index-commit 刷新和第 1 处保持一致（场景 H）。
- 不需要改 `useKeyboard.ts` 和 `CoreBox.vue`。「选中跟随 item」的既有契约保留：用例 `keeps the selection on the same item across a re-rank` 用的是 focus = 1。

**不在最小修复范围内的剩余问题**（供后续决策，不建议混进本次）：

1. 用户已经主动选中某一行（focus > 0）时，批次重排仍会让这一项漂到屏幕外，而且不滚动。例如打完 `pdf` 很快按了一下 ↓，第二批到达后高亮从第 1 行漂到约第 31 行（首个 harness 的 control 用例）。可选做法：
   - 重排移动 focus 后把它滚进视口。代价是没有任何输入时列表也会自己滚。
   - 用户交互之后冻结光标以上的顺序，新项只插到下方。改动更大。
2. 从开始搜索（1315 重置 focus）到 snapshot 到达之间按键，↓ 作用在旧列表或旧 grid 上，得到的下标会带进新列表。这是另一种较少见的跳动，和本报告不是同一个问题。
3. main 侧可以补齐分数：索引结果也带上 mtime recency，使同一个文件在两个来源里同分，减少重排。但后到批次里更新的文件照样会排到前面，所以这只能减轻，不能替代第 1 处修复。

---

## 5. 验证方式

**单测形状**（在 `apps/core-app` 下直接执行 `node_modules/.bin/vitest run <path>`）：

1. `useSearch.rank.test.ts` 新增「keeps the untouched top selection on row 0 when a later batch outranks it」：
   - `runFirstBatch(hook, 'pdf', [file('/i/0.pdf','file-provider',BASE)])`，focus 为 0。
   - `pushDeferredBatch([file('/s/0.pdf','macos-spotlight-provider',BASE+400), ...])`。
   - 断言 `boxOptions.focus === 0` 且 `res[0].id === '/s/0.pdf'`。未修复时 focus 会跟到 ≥1。
2. 同一文件新增「a low-score fast row does not drag the default selection to the last row」：
   - snapshot 为 1 个 `score = 260×20000` 的 feature，随后推 30 个 `BASE` 文件。
   - 断言 focus 为 0。未修复时是 30，也就是最后一行。
3. `useSearch.core.test.ts` 新增 index-commit 刷新用例：
   - focus 为 0，快层有 1 项，刷新后的 update 带回原来第 0 行那个文件，位置更靠后。
   - 断言 focus 仍为 0。未修复时是 10。
   - 现有两个 focus = 1 的 preserve 用例必须保持通过。
4. （可选）集成用例：`useSearch` 和 `useKeyboard` 共用同一个 `boxOptions`，写法参考 `/tmp/kbjump/focus-drift.test.ts`。两批到齐后派发 ArrowDown，断言 focus 为 1，且没有朝视口外滚动。
5. 回归：`useSearch.rank.test.ts`、`useSearch.core.test.ts`、`useKeyboard.test.ts` 全部通过。

**真机检查**：

1. 启动 dev app。本机当前已有实例在跑，CDP 端口 9333；CoreBox 页面 target 的 body class 含 `core-box`。**这是其他会话共用的实例（另一个会话正在做 corebox-list-motion），操作前先协调。**
2. macOS 上按 ⌘E，依次输入 `pdf`、`docx`、`png`，每次等约 2 秒，让 Spotlight 和索引两批都到齐。
   - 修复前：第 0 行没有高亮，预览面板显示的不是第 0 行；按 ↓ 列表滚到很远或最底部。
   - 修复后：整个过程中第 0 行一直高亮；按 ↓ 到第 1 行，列表不滚动。
3. 用只读 CDP 量化：在 CoreBox target 上执行
   `[...document.querySelectorAll('.item-list > .CoreBoxRender')].findIndex(el => el.querySelector('.BoxItem.is-active'))`（可以同时读 `.length`），分别在按 ↓ 前后取值。修复后应为 0 → 1。
4. 刷新路径：保持查询打开，在已索引目录（例如 `~/Documents`）里新建或 touch 文件触发 index commit。高亮应始终留在第 0 行。
5. 契约检查：结果到齐之前先按两次 ↓ 选到第 2 行。批次落地后，被选中的仍是同一个文件（它可以换行）。这是既有行为，也是 4 节剩余问题第 1 条的现场。

---

## Files Found

| File Path | Description |
|---|---|
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts` | 流式合并与重排（546-579）、`restoreFocusedItem`（581-590）、update 处理（1106-1139）、preserve 刷新（1201-1203、1401-1445）；**修复位置** |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts` | ArrowDown（892-911）、钳制（1056-1060）、`scrollActiveItemIntoView`（1062、1070-1113） |
| `apps/core-app/src/renderer/src/views/box/CoreBox.vue` | 列表与 grid 渲染（1098-1135）、addon 预览（731-741）、只在 grid 下执行的 reveal（790-809） |
| `apps/core-app/src/renderer/src/components/render/BoxGrid.vue`, `box-grid-layout.ts` | grid 列数计算（已排除） |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | provider 注册（349-358）、每批排序后下发（1603-1619）、semantic recall（875-907、1435） |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` | 快层与 deferred 层；每个 provider 单独发 update（417、433、472-491） |
| `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts` | `final` 分的计算与写回（125-132、246-251、286-337、370-374） |
| `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.ts` | native 结果带 recency（213-221）、deferred（255） |
| `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-search-result-service.ts` | 索引结果 `recency: 0`（313、456、498） |
| `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts` | `id: file.path`（232） |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-usage-service.ts` | usage 按 `sourceId:itemId` 注入（81-87） |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.rank.test.ts` | 既有「选中跟随 item」契约用例（359-376） |

## Related Specs

- 没有现成 spec 约定「CoreBox 流式重排时的选中行为」。相邻的是 `.trellis/spec/main-process/search-hotpath-contracts.md`（80ms debounce，排序策略独立于传输方式）。修复落地后可以考虑用 `trellis-update-spec` 补一条选中契约。

## Caveats / Not Found

- 没有同事那台机器的平台和数据，也没有 search trace（本机 dev 日志没有开 search/debug 日志），所以无法确认同事具体落在 A、B、F 中哪一种。机制本身与数据无关。
- 复现和验证都用 `/tmp/kbjump` 里的 harness（`focus-drift.test.ts`、`variants.test.ts`、`compare.test.ts`、`useSearch.fixed.ts`、`regress/`，config 通过 `node_modules` 软链复用 core-app 的 vitest 配置）。仓库里没有写入任何临时文件。
- 没有驱动正在运行的 dev app，只做了只读的 CDP 列 target 和读 `body.className`，以免干扰其他会话。
