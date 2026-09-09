# C3 · 颜色能力

父任务：`09-05-clipboard-history-detail-relayout`。设计稿：pen 画板 `l5aMCS`（S5 颜色）、`s72Ej9`（S2 图片主题色条）、SPEC 面板「颜色能力」一节。

## Goal

用户原话：「图片主题色」「如果复制了 #abcdee 这种也要展示颜色」。

## 依赖与顺序

**依赖 C2**：需要 `classifyClipboardItem` 的 `color` 形态判定与洞察路由第 4 位。C2 合入后开工。

## Requirements

### R1 颜色文本 → 色卡（S5）

复制 `#ABCDEE` / `rgb(...)` / `hsl(...)` 这类文本时：

- 预览区整块渲染为该颜色，色值以大号等宽字居中（前景色按对比度自动选黑/白）。
- 洞察区「颜色」分区给四种格式，逐行可点击复制：

  | 格式 | 示例 |
  | --- | --- |
  | HEX | `#ABCDEE` |
  | RGB | `rgb(171, 205, 238)` |
  | HSL | `hsl(210, 66%, 80%)` |
  | OKLCH | `oklch(0.84 0.06 249)` |

- 分区标题右侧附对比度结论：`点击任意格式复制 · 黑字 12.7:1 AAA`。完整的黑字/白字比值与 WCAG 判定放在这里，取色当场就能判断能不能用。

> 校验用真值（#ABCDEE，相对亮度 0.5853）：vs 黑 = 12.7:1（AAA）、vs 白 = 1.65:1（不达标）。实现后用这两个数字对拍。

### R2 图片主题色条（S2）

- 缩略图**正下方**贴一条 16px 高的调色板色带（6 段，等宽），下方一行 `主题色 · 点击复制` 说明。
- 点任一色块复制其 HEX。
- 完整调色板（超过 6 个）放进「更多信息」（C4）。
- **色值来源（已核实，与初稿假设不同）**：`getClipboardColorTokens` 确实会读 `meta` 的 `dominant_color` / `palette` / `accent_color` / `background_color`（`clipboard-items.ts:589-599`），但 `grep -rn "dominant_color\|palette\|accent_color" apps/core-app/src/main/modules/clipboard/` **无任何命中**——主进程入库时从来没写过这些 key。所以这条路径今天恒为空，不能靠它。

  改为**渲染进程侧提取**：详情面板已经拿到缩略图 data URL，把它画进离屏 `<canvas>`，降采样后做频次量化（或 median-cut）取前 6 色。全程在插件 webview 内完成，不改主进程、不加 IPC、不动 transport 契约。结果按 `item.id` 在组件内存里缓存，切回同一条记录不重算。

  > 若缩略图取不到（`resolveListImageSrc` 返回 null），主题色条整条不渲染，且不留空位。

### R3 文本内嵌颜色

一段 CSS 里出现多个色值时，沿用现有 `extractColorTokensFromText`，色卡以网格列在洞察区；默认 1 行，其余折叠为 `+N`。

### R4 缩略图角标

`缩略图预览` 角标定位在缩略图**右下角**（原设计在左上角，遮住图像主体）。

## Acceptance Criteria

- [ ] 复制 `#ABCDEE` 后：该记录出现在「颜色」分类下；详情预览是整块 `#ABCDEE`；洞察区给出四种格式且逐行可复制。
- [ ] 对比度显示为 `黑字 12.7:1 AAA`，白字判定为不达标。
- [ ] 复制 `rgb(171, 205, 238)` 与 `#abcdee`（小写）得到同一组四格式输出（大小写、格式归一）。
- [ ] 选中一张图片：缩略图下方出现主题色条；点击色块写入剪贴板的是 HEX 字符串。
- [ ] 主题色由渲染进程从缩略图提取，**未新增任何主进程改动 / IPC / 数据库字段**（`git diff --stat` 不含 `apps/core-app/src/main`）。
- [ ] 缩略图取不到时，主题色条整条不渲染，且不留空位。
- [ ] `缩略图预览` 角标位于缩略图右下角。
- [ ] `clipboard-items.test.ts` 覆盖：hex3/hex6/hex8、rgb/rgba、大小写归一、非法值（如 `#GGG`）不产出色卡。
