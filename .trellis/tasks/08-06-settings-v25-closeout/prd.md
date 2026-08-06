# 设置 v2.5 收口:外观对齐画板 + TuffGroupBlock 统一 + 智能并入设置

父任务:`.trellis/tasks/08-03-app-shell-ai-redesign`
设计基准:`docs/design/corebox/v2.5.0.pen` 的 `E0C1Zz`(设置·外观·浅色 v2)与 `iqbKR`(设置 v2 总版式)。
用户口径(2026-08-06):PRD 落盘后直接 start,不等人工审阅;智能页面**整体**并入设置。

## 背景

设置分类路由与行式组件已就位(子任务 ②),但:

1. 外观分类页仍未完全对齐画板 `E0C1Zz` 的三段式布局;
2. 多个设置页面在 TuffGroupBlock 之外仍手写分组容器(自绘卡片/边框/组标签),版式语言不统一;
3. `/intelligence` 六个子页(渠道、提示词、Agents、工作流、审计、能力)仍是顶层独立页面,应并入设置。

## 交付物

### ① 外观页对齐画板 E0C1Zz

画板结构(从上到下):

| 组 | 内容 |
|---|---|
| 窗口效果 | 单个分组容器内三张大预览图横排(Pure / Refraction / Filter),下方 radio 标签,选中项预览图带主色描边 |
| CoreBox | 单行:「自定义 CoreBox」+ Beta chip + 描述「调整搜索框 Logo、输入框与结果列表样式。」+ 右侧「编辑」描边按钮 |
| 个性化 | 四行:色彩风格(下拉「跟随系统」)/ 主页壁纸(下拉「自动」)/ 窗口模糊(滑条+`0px` 值)/ 窗口透明度(滑条+`100%` 值),行间发丝线 |

既有已决口径(2026-08-05,来自 `08-04-settings-rewrite` PRD,继续有效):画板「个性化」只画了 4 行,现有外观页全部设置项**本轮全部保留**,画板未画的按同一行式语言补成「壁纸滤镜 / 强调 / 动画」等组;设置项裁撤归 `08-04-batch-settings-razor`,本任务不做该决定。

### ② 设置域分组容器统一为 TuffGroupBlock

设置域(`/setting/*` 全部分类页及其子组件,含外观页来源 `views/base/styles/`)的分组容器一律使用 TuffGroupBlock,消灭手写的分组卡片/组标签/描边容器。具体文件清单在 `implement.md` 维护。

**行为逻辑、读写、副作用一律不动,只换表现层。**

### ③ 智能整体并入设置

- `/intelligence` 六个子页内容整体收进设置「智能」分类(`/setting/intelligence`),分类内部允许二级导航承载六块内容;
- 首页侧栏不再保留独立「智能」入口;
- 旧路由 `/intelligence`、`/intelligence/*` 重定向到设置内对应位置,深链不断;
- 与 `SettingAssistant`(现设置·智能来源组件)整合为同一分类下的内容;
- 范围边界:`08-04-settings-rewrite` 剩余范围中的「智能」分类由本任务接手,该任务不再认领。

## 约束

- 颜色不写死,一律 `--shell-*` token;强调色只出现在主按钮、开关开态、进度条、选中态。
- 不新增设置项、不裁撤设置项(裁撤属 `08-04-batch-settings-razor` 的未批准规划)。
- 迁移类改动保持每项设置/每个智能功能的现有行为与数据通路不变。
- light / dark 双主题均需验证。

## 验收标准

> 组件 chrome 口径已于 2026-08-06 晚被用户推翻:画板的外置标签版式实现后按令回退,分组一律 **TuffGroupBlock 经典卡内组头**。以下第 1 条按「内容与行结构对齐画板、chrome 用经典形态」判定(详见 design.md 顶部终局口径)。

- [x] 外观页三段(窗口效果 / CoreBox / 个性化)与画板 `E0C1Zz` **内容结构**逐区对齐;补充组(壁纸 / 强调 / 动效)沿用同一行式语言,4 个手写壁纸面板全部溶解,无旧版卡片残留 —— 实机截图核验
- [x] 设置域分组容器全部为 TuffGroupBlock(`SettingSection` 已删、全仓零引用);38 个改动 `.vue` 扫描无手写分组容器、零 hex/rgba
- [x] 每项设置行为与改版前一致 —— 机器证明:外观页 24 个数据绑定与 HEAD 逐字节一致、TxSlider 三元组全同;14 个重写最重的文件共 232 个绑定零差异;六个智能子页 `<script>` 仅差一行 shell import
- [x] 首页侧栏无「智能」入口;`/setting/intelligence` + 六个子路由可达;`/intelligence`、`/intelligence/*` 七条重定向由 children 表生成(`categories.smoke.test.ts` 守不变式)
- [x] light / dark 双主题:浅色实机走查通过;深色以证据覆盖(零硬编码色 + `.dark` 三色相已定义 + 深色墨色最低 4.54:1 + 布局与主题无关)。**主观观感仍建议用户切深色扫一眼**
- [x] `npm run typecheck` 双腿 exit 0;lint delta = 0(42 个改动文件包内 eslint 零输出;全仓 63 条 warning 属既有 `src/main` 文件,非本轮引入)
