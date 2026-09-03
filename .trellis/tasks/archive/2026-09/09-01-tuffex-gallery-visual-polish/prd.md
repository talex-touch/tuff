# tuffex 画廊视觉三修：slider 胶囊拖钮 / progress 重设计 / status-badge 暗色

## Goal

修掉 2026-09-01 在 nexus 组件画廊（`/docs/dev/components` 顶部预览网格）里实机发现的三处视觉硬伤。三处彼此独立、可分别验收，拆成三个子任务；本父任务只持有需求来源、任务映射、跨子任务约束和最终集成复核。

## 需求来源

用户浏览 nexus live specimen 画廊时提出，附五张截图与四条消息：

1. **StatusBadge**（截图：暗色下「Online / Reviewing / Failed」三枚徽标）——"这个我总觉得怪怪的不够好看 你分析下？" 分析结论经用户确认：**组件层与暗色 token 层一起修**（暗色主题未定义 success/warning/danger，沿用亮色值混出浑浊填充；图标不是一个家族；图标比文字大一圈；小圆角 + 描边 + 粗字重读成按钮）。
2. **Slider**（截图：静止态白色圆钮 + 拖拽态折射板）——"默认 slider 就改成椭圆形 那种 ios 透明玻璃的感觉"；"点击的放大弹跳效果不要那么夸张 微弱一点 曲线不够丝滑"；"slider 要改成有点像 ratio 那种感觉哈"——**ratio 指 Radio 按钮组里那条会滑动的胶囊指示条**（`TxRadioGroup type="button"` 的 indicator），已用画廊 Radio 格子的实机截图核对形态。
3. **ProgressBar**（截图：createui 的 File Upload 卡片，"Uploading 65% • 1.4 MB of 2.3 MB" + 渐变进度条）——"progress 进度条你可以参考这个里面的重新设计下"。

实机证据（暗色 + 亮色各一套）由 `research/shoot.mjs` / `research/shoot-radio.mjs` 生成，数值见各子任务 `research/measurements.md`。

## 任务映射

| 子任务 | 目录 | 交付物 |
|---|---|---|
| slider 拖钮改为 Radio 指示条式胶囊 | `09-01-slider-pill-thumb` | 默认态即玻璃胶囊，无白色圆钮；按下/拖拽为一次弱过冲的弹簧过渡，删掉四段关键帧 |
| progress-bar 重设计 | `09-01-progress-bar-redesign` | 无描边平铺轨道、前端最亮的渐变填充 + 前端光晕、不确定态走合成通道、`textPlacement: 'top'` + `detail` 文案行 |
| status-badge 暗色 token 与图标家族 | `09-01-status-badge-dark-tone` | `.dark` 显式定义三枚语义色；徽标图标统一描线圆家族、图标 1em、胶囊圆角、字重 500 |

三者无实现顺序依赖，可并行。**唯一的顺序提示**：progress-bar 的 status 色（success/warning/error）在暗色下的最终目视签收应在 status-badge 子任务落地之后做一次，否则看到的还是旧 token。

## 跨子任务约束

- **不扩大范围。** 每个子任务只修各自报告的问题；顺手发现的相邻缺陷写成代码注释 + 收尾报告里列出，不夹带修改。已知的相邻缺陷（本轮不修，各子任务只记录）：`.tx-progress-bar__indicator`（sparkle）挂在 `overflow: hidden` 的轨道里，28×18 的光点被裁到轨道高度；`hoverEffect: 'glow'` 的 `box-shadow` 同理被裁；`textPlacement: 'inside'`（默认）+ `showText` 把 12px 白字放进 5px 轨道里，改前改后都只剩一条白线（`ProgressBarStatefulProgressDemo` 前两条就是），正确修法是把默认放置改为 `top` 或 `outside`，属于 API 默认值变更，本轮只记录；`TxProgressBar` 的 tooltip 包裹与非包裹两份模板仍是复制粘贴；`08-31-slider-surface-size` 的工作已随 `6aa85194a` 落地但 task.json 仍是 `in_progress`；`TxToolConfirmation .is-dangerous` 用 `--tx-color-danger` 做实心底配白字，token 换成 `#f87171` 后白字对比度 2.90 → 2.77（两者都不到 AA 4.5），正确修法是该按钮换深色墨水，本轮只记录；core-app `DownloadProgressBar.vue` / `DownloadTask.vue` 用 `background-color` 覆盖填充色，新默认的渐变 `background-image` 会盖过它，那两处的实色覆盖已失效，core-app 侧需改成覆盖 `--tx-progress-fill` 或传 `color`；`plugins/touch-music` 的 `PlayProgressBar.vue:58`（`--tx-slider-thumb-size: 0px !important`）与 `FooterFunction.vue:89`（`10px !important`）是按 18px 白圆钮写的覆盖，胶囊路径下会得到 40px 胶囊压在 0 / 10px 命中区上（0px 时 `refreshMetrics()` 忽略并回落 18px），插件侧应先传 `thumbSurface=false` 再定制圆钮尺寸；暗色 `--tx-focus-ring-color` 解析为 `--tx-color-primary-light-7`（`rgb(33, 61, 91)`），比胶囊还深，焦点环勉强可辨，是所有可聚焦控件共用的 token 级问题；`::-moz-range-thumb` 从未被样式化，Firefox 两条路径都显示原生 thumb，既有缺口。
- **danger token 只按 AA 验收。** 2026-09-02 实算：红色在 `#141414` 上要到 7 : 1 需要亮度 ≥ 0.349，而保住白墨水 2.90 的下限需要亮度 ≤ 0.312，可行窗口为空；success / warning 仍按 7 : 1，danger 按 4.5 : 1（页面与 overlay 两个底都要过）。子任务 prd / design 已同步改写。
- **文档同步是硬要求。** 改到 `packages/tuffex/packages/components/src/` 下组件渲染结果（DOM / class / 视觉 / prop / 事件 / slot / 默认值）的子任务，必须同步对应 nexus 文档页与**每个 wrapper 的文档页**；清单见 `.trellis/spec/frontend/tuffex-docs-sync.md`。仅在 props 表加一行不算文档同步。已知 wrapper：`TxProgress` 包着 `TxProgressBar`（`progress.{zh,en}.mdc`）；slider 与 status-badge 无 tuffex 内 wrapper。
- **token 改动的爆炸半径要逐个看。** 30 个 tuffex 组件目录读取 `--tx-color-success|warning|danger`，改 `.dark` 的值等于改它们全部的暗色表现；status-badge 子任务负责逐个截图核对清单里的组件。
- **两个下游都要过。** tuffex 自己的 `vue-tsc` 比 nexus 和 core-app 都宽松，改完 tuffex 源码后两个下游的 typecheck 都要跑；nexus 的 typecheck 包装器 exit 0 也可能带错，要 grep `error TS`。
- **不整文件 `--fix`。** core-app 与根 eslint 配置规则相反（尾逗号等），只判 delta。
- **测试断言改后的行为。** 三个子任务都会删或改既有样式契约，锁旧现状的测试（例如 slider 的"按下回弹回到基础 transform"）必须重写，不能为了绿而保留。新增用例先在改动前跑一次红。
- **并发写文件。** 本仓库有其他 agent 同时在写；验证单文件原版用 `git show HEAD:path > path`，**不要** stash / checkout / restore。工作树上已有他人未提交的 plugin / core-app 改动，提交时只 add 本任务的路径。

## 验收标准

- [x] 三个子任务各自的验收标准全部达成（progress-bar / slider 由实现 agent 报告 + 主会话复核；status-badge 由主会话收尾）
- [x] `packages/tuffex` 单测通过（194 files / 1922 tests），三个子任务的新用例都先红后绿（主会话用 `git show HEAD:` 源码复跑：slider 13 红、progress-bar 18 红、badge success 图标断言红）
- [x] 09-02 09:20 停服务器后带锁重建（160 entries；Homebrew node 26 无 corepack，用 `/tmp/corepack-shim` 转到 mise pnpm），`audit:size` within limits
- [x] nexus typecheck（服务器停掉后跑）wrapper exit 0，`error TS` 0 条
- [x] core-app `tsc -p tsconfig.node.json` exit 0 + `vue-tsc -p tsconfig.web.json` exit 0，各 0 条 `error TS`
- [x] `check:demo-registry` ok / `check:mdc-fences` exit 0 / `check:doc-parity` exit 0
- [x] 改动文件按各包自己的 eslint 配置（CI 用的那份）0 问题；根配置对这些包不适用（它把 `.vue` 当 JSX 解析、开着 tuffex 关掉的 regexp 规则），阳性对照见集成记录
- [x] `research/integration/{dark,light}/` 各 9 张 + `metrics.json`：徽标 999px / 500 / 图标 14.4px / 描线家族；进度条无 mask、无描边、渐变填充、光晕；胶囊 40×20 → drag 43.19×21.59、`linear()` 曲线生效、焦点环在胶囊上；Radio 指示条 35×28 同一底色 token
- [x] 32 格逐像素比对 + 计算样式：更好 4 / 持平 25 / 混杂 2 / 更差 0（`09-01-status-badge-dark-tone/research/measurements.md`）；三处实心底白墨水的既有缺陷记入相邻缺陷

## Notes

- 分支：`feat/gallery-live-specimens`（与 08-31 那组任务同分支）。
- 本次分析用的实机取样方式：无头 Chrome（私有端口 9226）+ `apps/nexus/scripts/audit-cdp-client.mjs`，nexus dev 在 :3200；截图 clip 必须用文档坐标（`getBoundingClientRect` + `scrollX/scrollY`）并带 `captureBeyondViewport`，否则得到纯色空图。
