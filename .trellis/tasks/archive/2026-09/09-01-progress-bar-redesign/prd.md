# progress-bar 重设计：去描边轨道 / 渐变填充 / 合成通道扫光

父任务：`09-01-tuffex-gallery-visual-polish`

## Goal

按用户给的参考（createui File Upload 卡片："Uploading 65% • 1.4 MB of 2.3 MB" + 一条从起点浅到前端亮的渐变进度条）重设计 `TxProgressBar` 的默认外观，并把不确定态动画从逐帧改布局属性换成合成通道。

## 现状（实测，nexus 画廊）

`packages/tuffex/packages/components/src/progress-bar/src/TxProgressBar.vue`

| 项目 | 现状 | 问题 |
|---|---|---|
| 轨道 | 5px 高，`::after` 常画 1px 描边（`--tx-border-color-light` 68%） | 描边占高度 40%，暗色下是一圈灰管子，亮色下几乎不可见——"空管子"是暗色专属问题 |
| 遮罩层 `__mask` | 默认 `maskBackground: 'blur'`：`backdrop-filter: blur(16px) saturate(150%)` | 5px 高上看不出任何模糊效果，但每条进度条多一个合成层 |
| 填充 | 平色 + `box-shadow: 0 10px 24px`（向下偏移 10px） | 轨道 `overflow: hidden`，这条阴影被整个裁掉，是死 CSS |
| 宽度过渡 | `width 0.26s ease` | 短促，逐帧上报的进度会抖 |
| 不确定态 | 5 种关键帧全部动 `left` / `width` | 每帧回流 |
| 文案 | `inside` / `outside` 两种放置 | 参考图是在条上方一行：主文案（强调色）+ 分隔点 + 细节（弱色） |

参考图的骨架：无描边细轨道；填充从起点淡到前端饱和，前端一点柔光；上方文案行。文件图标、暂停、关闭属于上传卡片（`TxFileUploader` 的范围），不进本组件。

## 需求

1. **默认轨道去描边、去模糊层。** 新默认：轨道平铺 `color-mix(in srgb, var(--tx-text-color-primary) 10%, transparent)`（与 `TxSlider` 轨道同族），无 `::after` 描边，不渲染 `__mask` 节点、不挂 `backdrop-filter`。`maskVariant: 'solid' | 'dashed'` 与 `maskBackground: 'blur' | 'glass' | 'mask'` 保留为**显式 opt-in**，默认值改为新增的 `maskBackground: 'none'` 与 `maskVariant: 'plain'`。
2. **填充渐变 + 前端光晕。** 默认填充为 `linear-gradient(90deg, <color 淡> 0%, <color> 100%)`；前端有一点柔光，**位于轨道裁剪之外**（挂在 wrapper 上，随 `--tx-progress-width` 定位），0% / 100% / 不确定态时不显示。`color` prop 本身是渐变字符串时（nexus `storage.vue` 就这么用）原样使用，不再叠渐变。删掉被裁掉的 `box-shadow` 死 CSS。
3. **宽度过渡加长、曲线换强 ease-out。** 约 480ms，曲线用 `--tx-ease-out-strong`（`variables.scss` 已有）。光晕的定位过渡与之同步。
4. **不确定态只动合成属性。** 5 个 `@keyframes tx-progress-*` 里不再出现 `left` / `width`，改为 `transform: translateX() / scaleX()`（`transform-origin` 按需）。观感与现在等价，不重新设计每种变体。
5. **顶部文案行。** `textPlacement` 新增 `'top'`：在轨道上方渲染一行——主文案（`message` > `format` > `n%`，取填充色）+ 可选 `detail` prop（弱色，前面带分隔点）。`detail` 只在 `top` 放置下渲染；`inside` / `outside` 行为不变。`showText` / `message` 的显隐规则对 `top` 与 `outside` 一致。
6. **`TxProgress` wrapper 跟进。** 它当前显式传 `mask-variant="plain"` + `mask-background="mask"`（不透明轨道）。改为不传 `mask-background`，继承新默认，避免同一套件里两种轨道；`progress.{zh,en}.mdc` 第 66 行那句"底层进度条固定使用 …"随之改写。
7. 既有 `flowEffect` / `indicatorEffect` / `hoverEffect` / `segments` / `tooltip` 行为不变；`hoverEffect: 'glow'` 的 `box-shadow` 同样受轨道裁剪，本任务**不修**，只在代码注释与收尾报告里记录（连同 sparkle 指示器被裁的既有问题）。

## 约束

- 只改 `TxProgressBar.vue`、`types.ts`、`TxProgress.vue`（一行）、测试、文档。
- 新默认值是**渲染结果变化**，触发文档同步：`progress-bar.{zh,en}.mdc` + wrapper `progress.{zh,en}.mdc`；Props 表默认值、新 prop 行按 `defineProps` 顺序插入（`detail` 紧跟 `message`，`textPlacement` 的取值列表加 `'top'`），交互契约的显隐规则加 `top` 分支，新增一个"上传进度"demo（zh/en 都挂）。
- 下游调用方不改：nexus `storage.vue`（渐变 `color` + `height 8px`）、core-app `PluginStorage.vue`（sparkle + glow）、5 个 nexus Components*Demo。改完逐个实机看。
- 暗色下 status 色（success / warning / error）的最终目视签收放在 `09-01-status-badge-dark-tone` 落地后。

## 验收标准

- [ ] 默认 props 下：DOM 无 `.tx-progress-bar__mask`；轨道 `::after` 无描边；wrapper class 不含 `--bg-blur`
- [ ] 默认填充 `background-image` 为 `linear-gradient(90deg, …)`；`color` 传渐变字符串时原样使用
- [ ] 前端光晕节点存在于 wrapper（不在 `__track` 内），0% / 100% / indeterminate 时 `opacity: 0`
- [ ] `TxProgressBar.vue` 全部 `@keyframes tx-progress-*` 块内无 `left:` / `width:`（源码断言 + 阳性对照：提取器至少取到 5 个关键帧块）
- [ ] `textPlacement="top"` 渲染 `.tx-progress-bar__head`；含 `detail` 时渲染细节节点，缺省时不渲染；`inside` / `outside` 既有用例仍绿
- [ ] `TxProgress` 不再传 `mask-background`
- [ ] 画廊 ProgressBar 格子暗色 + 亮色实机截图：无灰管子、渐变可见、不确定态在跑
- [ ] `progress-bar.{zh,en}.mdc` 与 `progress.{zh,en}.mdc` 同步，新 demo 注册，`check:demo-registry` / `check:doc-parity` 通过
- [ ] 下游 7 处调用实机复核无回归
