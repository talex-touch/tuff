# 视觉标定记录（2026-09-27）

原型：同目录 `status-hint-prototype.html`。它复刻拟议的 `TxStatusHint` DOM/CSS，弹簧曲线由
`liquid/src/spring.ts` 的 `simulate()` 副本编译，所以这里定下的数值可以原样搬进组件。
主题取值来自 tuffex `style/variables.scss` 的 `:root` 与 `.dark` 块。

截图（不入库，重新打开原型即可再生成）：`/tmp/status-hint-proto/`

- `00-recommended.png` 推荐方案总览（亮 / 暗、入场四帧、静止成功/失败、顶栏）
- `07-grain-board.png` 颗粒方案 2x 对照
- `02`–`05` 入场 A/B/C 与重放逐帧，`06` 顶栏逐帧

渲染方式：ego TaskSpace 19，页面由 `python3 -m http.server 7791 --bind 127.0.0.1` 提供（ego 里 `file://` 导航不生效）；
逐帧用负 `animation-delay` + `paused` 冻结；2x 图用 CDP `Page.captureScreenshot` 的 `clip.scale`
（`page.screenshot` 的 `raw` 不改变输出尺寸）。

## 结论

| 项 | 取值 | 依据 |
| --- | --- | --- |
| 颗粒做法 | **G1b：噪点并进色带遮罩**（渐变 ∩ fractalNoise α，`feFuncA slope=1.6 intercept=-0.2`，140px 平铺） | soft-light 叠加（G0，`TxStatCard` 的做法）在 16% 遮罩里扰动只剩约 1%，2x 放大仍看不出；G1 颗粒只出现在色带内，底色不发灰。G1c（slope 2.4）偏「沙」，G1a（原始 α）偏弱 |
| 左缘强度 | 亮 **0.26**、暗 **0.20**（乘以噪点 α 均值约 0.6，实际平均约 16% / 12%） | 亮色 0.12 几乎看不见、0.32 开始抢眼；暗色 0.26 偏重。满足「颜色不要太显眼」 |
| 渐变形状 | 0% 满强度 → 38% 处 0.45× → 100% 透明 | 底栏覆盖层宽 50%，色带在底栏中线前消失，右侧快捷键区域不受影响 |
| 色带入场 | 680ms `cubic-bezier(0.23, 1, 0.32, 1)`，`opacity 0→1`、`scale .3 1 → 1 1`，原点在左缘 | 130–440ms 间从左缘推开，有「涌现」感 |
| 文字入场 | **A：`scale 1.18 → 1`，bouncy 弹簧**（746ms，峰值 1.176，即回落时约 0.97 再回到 1） | 首帧就是放大态，直接对应「加一些放大的提示」；B（0.84→1.07→1）放大感弱；C（1.10 smooth）太轻 |
| 图标入场 | bouncy，`scale .4 → 1`、`rotate -30deg → 0` | 80ms 已可辨认，130ms 到位 |
| 同文案重放 | 文字 `1→1.12→1`、图标 `1→1.22→1`（460ms），色带 bloom `opacity .45→1`、`scale .72→1`（560ms） | 40–130ms 明显放大后回落，色带重新推一次，不闪烁 |
| 超长文案 | 根节点 `overflow: hidden` + 末端 `pad-x` 宽的淡出遮罩 | 文案到覆盖层末端淡出，不会压到快捷键上 |
| 顶栏 | `sm`：12/16px、图标 14、内边距 3/8，圆角 8 的小胶囊 | 与底栏同一套「左浓右淡」语言 |

弹簧参数（与 `resolveTransition` 一致）：`bouncy` 746ms、峰值 1.1762；`smooth` 587ms、峰值 0.9997。
