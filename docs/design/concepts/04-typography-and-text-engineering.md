# 第四篇：排版美学、字体工程与排版节奏 (Typography & Text Engineering)

> 涵盖章节：第 18 章 ～ 第 22 章  
> 核心主题：13–14px 生产力基准与高密度排版；等宽代码 0.9em 光学调和；现代软换行与孤字终结；零字距铁律与多语言节拍。

---

## 第 18 章：13–14px 界面基准与字阶梯层级

### 18.1 生产力工具 vs 营销网页的认知差异

许多从营销官网、博客或消费级 App 转入桌面工具的开发者，喜欢将正文字号设为 16px 甚至 18px。
在内容型生产力工具（如 IDE、系统级启动盘、数据分析面板）中，这是极其严重的体验倒退：

1. **视野扫读广度（Foveal Vision Window）**：人眼中央凹视力最佳区域大约为视场角 2 度。过大的字号导致一屏内能同时容纳的实体信息急剧缩水，用户需要反复移动视线，导致眼肌疲劳。
2. **信息关联密度（Proximity of Related Context）**：参数、标签、输入框与错误反馈必须在视野内紧凑锚定。过大字号强制拉开间距，破坏了格式塔心理学中的“接近律”（Law of Proximity）。

### 18.2 TuffEx 字阶梯标准

全局只有三个字号令牌：`--tx-font-size-small` 12px、`--tx-font-size-base` 14px、`--tx-font-size-large` 16px。组件里写的字号按下面的阶梯取值（2026-10 按全部组件样式统计）：

```
Micro-labels (微标签 / 徽标): 10px ~ 11px  (全大写 / 纯数字 / 仅作视觉修饰)
Secondary (辅助说明 / 灰色提示): 12px      (严格限于非关键信息)
Body / Controls (主正文 / 操作控件): 13px ~ 14px (用户阅读与操作的主战场；大号按钮、命令面板输入框到 15px)
Headings (分组标题 / 模块标题): 15px ~ 18px (结构分割点)
Display (大尺寸数值指标): 22px ~ 32px     (统计卡、图表摘要与指标数字)
```

Display 一档：TxMotionMetric 按尺寸取 22 / 24 / 28 / 32px，TxMonoChart 的指标 22px，TxDitherChart 的摘要 24px，TxStatCard 的数值 28px。

阶梯之外有三类，都是有意的：
* AI 套件里移植自 Beautiful UI 的组件与原站逐像素对齐，保留它的半像素字号（10.5、11.5、12.5、13.5px）；
* 用 `font-size` 定尺寸的图标和字形（星级、关闭按钮、表情、标签栏图标），15–30px，不是正文；
* 装饰性大字，如 TxKeyframeStrokeText 默认 64px。

> **铁律原则**：任何需要使用 16px 呈现正文内容的业务组件，必然是其**信息层级架构出现了严重混乱**。解决办法是梳理层级，而不是调大字号。

---

## 第 19 章：无衬线与等宽字体的 X 高度调和

### 19.1 为什么行内代码要缩到 `0.9em` 左右？

在专业界面中，技术术语与代码标识通常以行内代码块（`<code>` 或 `<kbd>`）形式混排在正文中。
无衬线 UI 字体（如 San Francisco、Inter）与等宽字体（如 JetBrains Mono、Fira Code、SF Mono）在字体设计度量衡（Font Metrics）上存在根本差异：

```
UI 无衬线字体 (Inter / SF Pro):
X 高度 (x-height) 适中，字宽紧凑，基线稳定。

等宽编程字体 (JetBrains Mono):
为了保证编程时的清晰可辨，等宽字体刻意拉大了字腔，其 x 高度往往比同字号无衬线字体略高。
```

按 macOS 自带字体文件量出的 x 高度（与字号之比）：苹方 0.517、SF Pro 0.508、SF Mono 0.526、Menlo 0.547，等宽体只比正文高出约 1.7%～7.7%。

如果内联代码块直接使用 `font-size: 1em`（继承 100%）：
* 代码文字在视觉上会**生硬地向外凸起**，犹如正文中的突兀补丁。
* 行高会被上下顶开，破坏整段文字原本匀称的行间呼吸节奏（Vertical Rhythm）。

### 19.2 TuffEx 解决方案

TuffEx 的标准行内代码样式在样式入口里：`.tx-prose` 中不在 `<pre>` 里的 `<code>`，以及任何加了 `tx-inline-code` 的元素，都缩到 0.9em。

```scss
// packages/tuffex/packages/components/style/index.scss
.tx-prose :not(pre) > code,
.tx-inline-code {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background-color: var(--tx-fill-color-light, #f5f7fa);
  font-family: var(--tx-font-family-mono);
  // 缩放至 0.9em，抹平等宽字体略高的 x 高度
  font-size: 0.9em;
  // 留在基线上，与中西文同排
  vertical-align: baseline;
}
```

自己渲染行内代码的组件（TxStreamText、TxMarkdownView、TxMarkdownEditor、TxChainOfThought）同样缩到 0.9em，TxStreamMarkdown 和 Nexus 文档正文用 0.875em。

0.9em 是个近似值。让两种 x 高度对齐的字号是「正文 x 高度 ÷ 代码 x 高度」：在 macOS 的 Chrome 里实测 Nexus 文档正文 0.508em、代码（落到 Menlo）0.547em，比值 1.077，恰好对齐要 0.929em，0.9em 还矮 3.1%。按上面几款字体两两组合，恰好对齐的字号落在 0.93em～0.98em 之间。

---

## 第 20 章：现代软换行与孤字规避 (`text-wrap: pretty` & `balance`)

### 20.1 孤字（Orphans）的视觉折磨

在窄屏容器或卡片中，段落末尾经常出现极其尴尬的一幕：**最后一个标点或一个单字独自落在一行**。
在传统排版学中，这被称为孤行/孤字（Orphan）。它打破了段落底部的视觉重量平衡，导致右下角空落落，显得极其粗糙业余。

以往的前端做法有两种极端：
* 极端 A：放任不管，任由单字孤悬。
* 极端 B：在字符串层面通过 JavaScript 强行在最后两个词之间插入 `&nbsp;` 或硬换行 `<br>`。
  * **灾难性后果**：一旦用户调整窗口大小，硬编码的换行符会将当前宽度的排版固化进文档流，在更宽或更窄的屏幕上直接引发异常折行！

### 20.2 浏览器原生软换行（CSS Text Module Level 4）

按 MDN 的兼容数据，`balance` 从 Chrome 114、Firefox 121、Safari 17.5 起可用；`pretty` 从 Chrome 117、Safari 26 起可用，Firefox 尚未支持。不支持的浏览器按普通 `wrap` 断行，不会出错。TuffEx 将其确立为核心排版标准：样式入口提供四个文本工具类，`TxModal` 的标题也直接声明了 `balance`。

```scss
// packages/tuffex/packages/components/style/index.scss
// 1. 标题与短提示：追求每行字数均衡对称
.tx-heading {
  text-wrap: balance;
}

// 2. 长段落正文、卡片描述与帮助说明：追求终结孤字、优先版面优雅
.tx-prose p,
.tx-description,
.tx-help-text {
  text-wrap: pretty;
}

// packages/tuffex/packages/components/src/modal/src/TxModal.vue
.tx-modal__title {
  text-wrap: balance;
}
```

标题加 `tx-heading`，描述加 `tx-description`，表单项下方的帮助说明加 `tx-help-text`，整段富文本的容器加 `tx-prose`（作用于其中的 `<p>`）。`TxCard` 没有自己的标题元素（标题由 `header` 插槽传入），卡片标题请加 `tx-heading`。Nexus 文档的页头（DocHero）同样是标题用 `balance`、描述用 `pretty`。

* `text-wrap: balance`：浏览器通过多轮计算，寻找行宽方差最小的最优解，使标题呈现和谐的倒梯形或对称形态；Chrome 只对 6 行以内的文本生效。
* `text-wrap: pretty`：专门针对末尾孤字进行优化。如果发现段末只剩下一个单字，排版引擎会自动将上一行的倒数第二个词拉至新行，保持双字或多字收尾。

> **流式生成例外**：在 AI 流式输出中，正在接收 Token 的段落保持普通 `wrap`，段落彻底生成完毕后再切换为 `pretty`，防止每输出一个词都触发整段重排。`TxStreamElement` 的段落与标题这样切换：写入位置所在的那一段带 `is-live`，按 `auto` 断行，写入位置移走后回到 `pretty`。`TxStreamText` 自己是块级容器时（`tag` 为块级元素，或 `reserve` 回放时铺开的两份副本）同样如此，文字还没放完时（含暂停）根节点带 `is-live`；作为行内元素放在宿主段落里时，由宿主段落决定。
>
> ```scss
> // packages/tuffex/packages/components/src/stream-element/src/TxStreamElement.vue
> .tx-stream-element__text {
>   text-wrap-style: pretty;
>
>   &.is-live {
>     text-wrap-style: auto;
>   }
> }
> ```
>
> 两者都写长写属性 `text-wrap-style`，不动宿主的 `nowrap`（简写 `text-wrap: pretty` 会把换行模式一并设回 `wrap`）；按 MDN 的兼容数据，它的 `pretty` 从 Chrome 130、Safari 26 起可用。`reserve` 的占位副本始终按 `pretty` 断行，因为它占住的是写完后的版面。

---

## 第 21 章：字距调整禁忌：正文零 Tracking 铁律

### 21.1 随意调整 `letter-spacing` 的危害

许多初级开发者为了追求所谓的“呼吸感”或“设计感”，喜欢在普通正文上加 `letter-spacing: 1px` 或 `0.05em`。
世界顶级字体厂商（如 Monotype、Apple Typography Group）耗费数年时间校准字体的字偶间距表（Kerning Pairs，如 `AV`、`To`、`We` 的微缩补偿）。
在普通正文上声明 `letter-spacing: 1px` 并不会去掉字偶间距，而是在字偶间距之外，给相邻字符之间再统一加 1px，把厂商调好的字距节奏整体冲淡；CSS Text 规范还规定，字距不为 0 时浏览器不应再应用 `fi`、`fl` 这类可选连字。

### 21.2 TuffEx 仅有的三类字距豁免

在 TuffEx 体系中，正文严禁触碰 `letter-spacing`。仅允许在以下三种极端几何场景下使用：

1. **≤11px 的全大写微型标签（Uppercase Micro-labels）**：
   全大写拉丁字母字腔方正密集，在极小尺寸下笔画易糊在一起。
   * 例如：`TxSidebarNav` 分组标题 10.5px、`0.08em`，`TxSelect` 分组标题 11px、`0.06em`，`TxCodeBlock` 语言标签 11px、`0.04em`；`TxTag` 的 11px 标签也留了 `0.05em`。
2. **≥17px 的标题与展示数字（Headings & Display Numerals）**：
   大字号默认字距显得松垮，统一取 `-0.01em` 微负字距收紧。
   * 例如：`TxInsightMetric` 数值与 `TxBlowDialog` 标题 17px，`TxModal`、`TxBottomDialog` 标题 18px，`TxStatCard` 数值 28px。
3. **用户头像缩写（Avatar Initials）**：
   此时文字本质上是几何居中图标，非连续阅读文本。
   * 例如：`TxAvatar` `0.02em`。

---

## 第 22 章：跨语言与中西文混排节奏

### 22.1 中西文之间的“半角空格”纪律

在中文技术语境下，汉字是全宽方块字（Em-square），拉丁字母与数字是变宽比例字。两者直接贴在一起会产生严重的字谷挤压。

* **错误**：`运行5个Docker容器在macOS上。`（毫无间隙，极其局促）
* **错误**：`运行　５个　Ｄｏｃｋｅｒ容器在　ｍａｃＯＳ上。`（使用全角字母数字，丑陋不堪）
* **正确**：`运行 5 个 Docker 容器在 macOS 上。`（中西文、数字之间保留一个半角空格）

### 22.2 系统字体回退链的严密顺序

```scss
// packages/tuffex/packages/components/style/variables.scss
// 无衬线字体栈
--tx-font-family: "Inter", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;

// 等宽代码字体栈；--tx-font-family-mono 是它的别名
--tx-font-mono: "JetBrains Mono", ui-monospace, "SF Mono", "Menlo", monospace;
--tx-font-family-mono: var(--tx-font-mono);
```
浏览器逐字查找：拉丁字母与数字先找 Inter；Inter 没有中文字形，中文落到苹方（macOS）或微软雅黑（Windows）；没装 Inter 的机器上，拉丁字母落到 Helvetica Neue 或 Arial。TuffEx 不自带 Inter 的字体文件，只有系统装了 Inter 或宿主页面自己加载了它时才会用上。等宽栈在没装 JetBrains Mono 的 macOS Chrome 里实测落到 Menlo。
