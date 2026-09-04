# status-badge 暗色语义 token 与图标家族统一

父任务：`09-01-tuffex-gallery-visual-polish`

## Goal

让 `TxStatusBadge` 在暗色下不再浑浊、三枚徽标读成一个家族而不是按钮。用户确认的修法：**组件层与暗色 token 层一起修**。

## 现状（实测）

组件 `packages/tuffex/packages/components/src/status-badge/src/TxStatusBadge.vue`；token `packages/tuffex/packages/components/style/variables.scss`。

**token 层**：`.dark` 块（第 312 行起）没有定义 `--tx-color-success / warning / danger`，直接继承 `:root` 的亮色值 `#67c23a / #e6a23c / #f56c6c`。这三枚是为白底设计的中饱和色，按家族配方（12% 填充 / 32% 描边）混到 `#141414` 上得到：

| 色调 | 文字 : 页面 | 12% 填充 | 32% 描边 : 页面 |
|---|---|---|---|
| success | 8.2 : 1 | `#1e2919`（橄榄） | 1.9 : 1 |
| warning | 8.4 : 1 | `#2d2519`（土黄） | 1.9 : 1 |
| danger | 6.4 : 1 | `#2f1f1f`（暗红） | 1.7 : 1 |

文字对比度够，问题是**填充的色相浑浊、描边成了一圈深色硬边**。亮色下同一组件是干净的粉彩，反证根因在 token。高对比暗色主题（`tx-high-contrast-dark`）已经换成浅调 `#86efac / #facc15 / #fda4af`，普通暗色没有。

**组件层**：
- 图标不是一个家族：success 用 `i-carbon-checkmark-filled`（实心盘），warning / danger / info 用描线圆（`warning` / `close-outline` / `information`），muted 用 `minimize`（一根横线）。实心绿盘分量最重，"在线"像被选中、另外两个像未激活，是假层级。
- 图标比文字大一圈：声明 14px，nexus 图标预设 ×1.2 后实渲 16.8px，文字 12px；图标撑满 27px 徽标高度，文字悬在中间。
- 形态读成按钮：圆角 8px + 可见描边 + 字重 600，与 `TxButton` 静默态几乎一样；同家族 `TxBadge` 是胶囊、字重 500。

## 需求

### token 层

1. `.dark` 块显式定义 `--tx-color-success / warning / danger`，不再继承亮色值；同步更新同块内的 `--tx-color-*-rgb` 三元组（第 359–362 行）使之与新 hex 一致。
2. 选值原则：暗色底上文字 ≥ 7 : 1（在 `#141414`）且 ≥ 4.5 : 1（在 `--tx-bg-color-overlay` `#1d1e1f`）；12% 填充色相清晰不发灰；danger 只按 AA 验收：≥ 4.5 : 1（页面与 overlay 两个底都要过），success / warning 仍 ≥ 7 : 1。**实心底配白墨水只记录不设门**——09-02 实算：红色在 `#141414` 上到 7 : 1 需要亮度 ≥ 0.349，保住白墨水 2.90 需要亮度 ≤ 0.312，可行窗口为空；`TxToolConfirmation .is-dangerous` 的白字对比从 2.90 降到 2.77（两者都不到 AA），作为相邻缺陷记录。候选（Tailwind 400 系）：

   | token | 候选 | 文字 : `#141414` | 12% 填充 | 备注 |
   |---|---|---|---|---|
   | success | `#4ade80` | 10.6 : 1 | `#1a2c21` | |
   | warning | `#fbbf24` | 11.0 : 1 | `#302916` | |
   | danger | `#f87171` | 6.7 : 1 | `#2f1f1f` | 与现值最接近；填充仍是三者里最不清晰的，可试 `#fb7185`（6.8 : 1） |

   高对比暗色那套粉彩（`#86efac` 等）**不能**直接搬来当普通暗色：白墨水压在 `#fda4af` 上是 1.8 : 1。
3. `.dark` 里硬编码的 `--tx-color-danger-light-5/7/9`（`#a43c3c / #7f2d2d / #4e1f1f`）是从旧 danger 推的；先 grep 消费者，有人读再重推，没人读则留注释说明来源。
4. `foundations.{zh,en}.mdc` token 表的 Dark 列三行（当前写着与 Light 相同的 hex）改为新值。

### 组件层

5. 图标统一为**描线圆家族**：success 改 `i-carbon-checkmark-outline`，muted 改 `i-carbon-circle-dash`；warning / danger / info 已是描线，不动。五个图标都已确认存在于 `@iconify-json/carbon`。
6. 图标尺寸 `1em`（随文字），不再写死 14px；在 nexus（×1.2）下实渲 ≤ 14.5px。
7. `border-radius: 999px`；`font-weight: 500`；md 内边距水平 ≥ 10px（胶囊端帽不裁到图标）。
8. **家族配方（12% 填充 / 32% 描边）不动。** `TxBadge` / `TxTag` / `TxAlert` 源码注释里写明了对齐这套配方；只在 status-badge 里改配方会产生家族漂移，暗色的浑浊由 token 层解决。

## 约束

- token 改动的爆炸半径：30 个 tuffex 组件目录读取这三枚 token（alert / badge / button / tag / toast / steps / timeline / stat-card / version-capsule / tool-confirmation / progress-bar / chat 系列……，清单见 `research/measurements.md`）。改完在画廊暗色下逐个截图目视签收，任何一处变差都要在报告里点名。
- 组件层改动只在 `TxStatusBadge.vue`；33 个下游调用方（nexus 页面、store、dashboard）不改，抽查 3 处实机。
- 测试：既有 `status-badge.test.ts` 断言 `i-carbon-information`（info）与自定义图标，不与本次冲突；新增用例见 implement.md，先红后绿。
- 文档同步：`status-badge.{zh,en}.mdc`（交互契约的图标映射、审阅说明）+ `foundations.{zh,en}.mdc`（token 表）。无 tuffex 内 wrapper。

## 验收标准

- [ ] `variables.scss` `.dark` 块内存在三枚 token 的显式定义，且 `-rgb` 三元组与 hex 一致（单测锁定，含阳性对照）
- [ ] 所选值满足需求 2 的四条对比度约束（数值记入 design.md）
- [ ] `TxStatusBadge` 五个色调的默认图标全部是描线圆家族（单测逐个断言）
- [ ] 画廊 StatusBadge 格子暗色截图：图标实渲 ≤ 14.5px、圆角 999px、字重 500；三枚徽标视觉分量一致
- [ ] 亮色截图无回归（粉彩观感保持）
- [ ] 爆炸半径清单逐个签收，报告列出每个组件"更好 / 持平 / 更差"
- [ ] `foundations.{zh,en}.mdc` Dark 列更新；`status-badge.{zh,en}.mdc` 同步；`check:doc-parity` 通过
