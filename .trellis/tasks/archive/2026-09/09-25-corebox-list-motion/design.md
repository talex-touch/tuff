# Design — CoreBox 列表与 item 过渡动效

依据：`research/motion-audit.md`（方案编号 A–N 沿用审计），决策见 `prd.md` 的 Decisions（D1–D8）。

## 原则（全部方案共同遵守）

- 数据一次到位，动效只跟在后面：DOM 在同一次更新里完成，行始终不透明，动效只用 transform / opacity。这是 spec「Ready results must not wait for reveal motion」的要求。
- 只有合成器属性做持续或频繁的动画；不给宽度、高度、padding、filter、自定义属性做过渡。
- 统一门控：`shouldAnimate()` 等于「没有开启 reduced-motion」并且「不是 lowBatteryMode」。CSS 用 `html[data-low-battery-motion]` 加 `@media (prefers-reduced-motion: reduce)`，WAAPI / JS 驱动的动画一律先问 `shouldAnimate()`。
- 不走回头路（audit §4）：
  - 不用 `mode="out-in"`；
  - 不按批次重新 key；
  - 不做透明入场、blur 入场；
  - stagger 保持封顶；
  - 不默认开启窗口动画；
  - 结果区不放任何"搜索中"占位；
  - 键盘导航不用平滑滚动。

## 方案

### E. 统一门控（先做，后面的方案都依赖它）
- CoreBox 窗口也挂上全局低电量开关，也就是调用 `useGlobalBatteryOptimizer()`，让 `html[data-low-battery-motion]` 在 CoreBox 里生效。
- 抽出 `shouldAnimate()`，放在 `modules/box/adapter/hooks/` 下的一个小模块里，响应式读取 reduced-motion 与低电量。网格 FLIP（`captureResultsLayout` / `playFlip`）改为依赖它。

### A. 预览面板开合迟滞（D2）
- `addon` 从直接的 computed 改成带状态的 `addonType`：
  - 选中文件时立即是 `'preview'`；
  - 离开文件行后启动 200ms 计时，期间保持 `'preview'`，并继续显示上一个文件：面板内容绑定"最后一个文件条目"，不跟随当前非文件行；
  - 计时期间再选中文件就取消计时；
  - 计时结束才变成 undefined。
- 下游依赖改为依赖新状态：`gridAvailableWidth`、FLIP 捕获 watcher、`revealActiveItemAfterReflow`、`compressed` class、`TuffItemAddon` 的 `:type` / `:item`。
- `addon-slide-in` 去掉 `opacity: 0`，只做 translateX；两个文件之间切换不重播；受 E 门控。

### C. 推荐路径不预先清空
- `useSearch` 推荐分支不再执行 `searchResults.value = []` 和 `boxOptions.layout = undefined`，由 `applyRecommendationResult` 在同一次更新里替换结果和布局。
- 400ms 超时与失败分支负责清空。
- 结果和 layout 必须同时保留，否则旧网格会先变成列表。

### B. 同查询刷新等 complete 再对账（D4；依赖 keyboard-jump 落地）
- `preserveSelection` 的刷新（索引提交、打开时强制刷新同一查询）：
  - 快照改为与当前列表 `mergeRenderedItems` 合并，并记录本次会话下发过的 id 集合；
  - 延迟层 update 照常合并；
  - `applySearchEnd`（未取消时）删除本次会话没有再下发的行；
  - 兜底超时：complete 迟迟不来时，超时后同样执行对账删除，时长取与主进程搜索超时一致的值，实现时查实；
  - 取消或失败时退回现有逻辑。
- 需要同步改写 07-15 中间态的对应用例（`useSearch.core.test.ts`，约 498–575 行）。
- 与 keyboard-jump 的 R1 / R4 共用焦点跟随逻辑：对账删行导致焦点所在项消失时，回落到 0，并触发 R4 的滚动规则。

### G. 列表模式重排做 FLIP 位移（D1 / D3）
- 列表行加上 `data-flip-key`。`res` 变化时在 pre-flush 阶段用 `captureFlipSnapshot` 记录视口上下各一屏范围内的行，post-flush 阶段用 `playFlip` 只对**已有且确实移动了**的行做 translate；新行照旧。
- 时长 ≤180ms，使用非回弹缓动；以滚动容器为坐标参照。
- 门控：`shouldAnimate()`，再叠加默认开关。先在真机上量帧率（dev Electron 的 CDP Performance 录制，另一会话共享，事先协调），丢帧率 <5% 且没有 >50ms 的长任务才默认开启；否则挂在 `resultTransition` 开关下，默认关闭。
- 与 D8 高亮块共用同一套坐标，重排时高亮块跟随它所在的行一起移动。

### D8. 跟随平移的选中高亮块
- 列表容器里放一个 `div.CoreBox-SelectionBlock`（absolute，`pointer-events: none`，`z-index` 在行背景之下、行内容之下）。
- 选中行变化时，读取该行在列表内的 offsetTop / 高度，写 `transform: translateY()` 与高度。高度只在变化时写（行高基本一致），尽量只动 transform。
- 键盘步进时用很短的过渡（≤90ms，ease-out）；按住方向键连续触发时，过渡时长不叠加，每次都从当前位置直接追到目标，不拖尾。
- 重排（G）、滚动、窗口 resize 时同步位置；网格模式先不做（tile 用现有高亮）。
- 行自身的 active 背景在列表模式下改为透明，由高亮块承担，避免叠出两层高亮。hover 不覆盖选中态（K）。键盘操作后到下一次 mousemove 之前不显示 hover，用 `data-pointer-idle`。
- 门控：reduced-motion 或低电量时不做过渡，瞬移到位，高亮块照常存在。

### F. 预览卡片（D7）
- 身份稳定：同一个 ability 的预览条目使用稳定的 `:key`（`source.id + meta.preview.abilityId`），stagger 簿记不把它当成新行。
- 描边：平时静止，只有被选中时才流动；窗口隐藏、低电量、reduced-motion 时停止。实现改为只在合成器上执行：在带遮罩的容器里旋转一张预先渲染好的 conic-gradient 图层，blur 只作用于静态图层。外观尽量不变。

### P2 小项
- I：历史面板宽度一次到位，再用 transform 滑入，去掉无效的 opacity 过渡。
- L：高度测量排除容器自身的 translate，保留 b37697b1a 修过的那个场景。
- M：富预览资源就绪前，先显示文件的 `DefaultPreview` 图标作为占位。

## 验证策略

- 单测：老板 2026-09-26 批准为这批改动补单测。每条方案按 audit §3 给出的形状补测试，走 CoreBox 挂载框架或各自 hook 的单测。
- 真机逐帧：
  - 混排列表按住方向键：结果列宽度每停一次最多翻转一次；
  - 延迟层插入：行是滑下去，而不是跳下去；
  - 打开 / 清空：没有空白帧；
  - 高亮块：按住方向键时不拖尾。
- 帧率测量：G 和 D8 开启前后各录一次 CDP Performance，对比长任务数与丢帧率。
