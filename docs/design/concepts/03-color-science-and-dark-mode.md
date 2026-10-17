# 第三篇：色彩科学、暗色模式与感知光学 (Color Science & Dark Mode)

> 涵盖章节：第 12 章 ～ 第 17 章  
> 核心主题：为什么不是纯黑 `#000000`？暗色模式视网膜光晕效应与字重补偿；双极性语义墨水融合与 WCAG 4.5:1 无障碍铁律。

---

## 第 12 章：为什么是 `#141414`：中性深灰与纯黑之辩

### 12.1 纯黑（`#000000`）的三大物理缺陷

在暗色模式兴起之初，许多应用简单地将背景设为绝对纯黑（`#000000`）。在实际人机工效学中，这造成了三大致命问题：

1. **OLED 像素点亮延迟（OLED Smearing / Purple Ghosting）**：
   在 OLED/AMOLED 屏幕上，`#000000` 意味着像素完全关闭。当高对比度元素在纯黑背景上滚动时，关闭的自发光子像素需要数十毫秒重新激活，会在边缘拉出难看且令人眩晕的**紫色/黑色拖尾残影**。
2. **消灭了深度层级（Elevation Death）**：
   在现实世界中，阴影必须比表面更暗才能被感知。如果背景已经是 `#000000`，所有下层阴影（Drop Shadow）全部失效，卡片悬浮感彻底归零。
3. **对比度压迫与视觉疲劳（Contrast Glare）**：
   纯白 `#FFFFFF` 在纯黑 `#000000` 上的对比度高达 21:1，在暗室环境下会产生强烈的眩光刺眼感，加速视疲劳。

### 12.2 Tuff 的三层深灰空间阶梯

Tuff 选定 `#141414`（极深温和碳灰）作为画布基底，并建立了严格的物理级差：

| 层级 | 色值 | 物理隐喻 | 典型应用 |
|---|---|---|---|
| **L0 底板** | `--tx-bg-color: #141414` | 吸收一切杂光的深空 | 桌面窗体底板、全局空白区 |
| **L1 容器** | `--tx-bg-color-overlay: #1d1e1f` | 带有微弱漫反射的哑光表面 | 卡片、对话框、抽屉、弹出浮层、Toast 面板 |
| **L2 高亮** | `--tx-fill-color-light: #262727` | 吸收环境漫射光的凸起物 | Hover 悬停态、选中项高亮 |

暗色下 `--tx-fill-color-blank` 是 `transparent`，不承担容器色；`--tx-fill-color-lighter` 是 `#1d1d1d`，比高亮层还暗，不构成更高的一层。

这种级差保留了阴影投射的空间可能，同时彻底消除了 OLED 屏幕滚动时的黑斑拖尾。

---

## 第 13 章：暗色模式视网膜光晕效应与字重视觉补偿

### 13.1 视网膜光渗效应（Optical Irradiation Illusion）

早在 1867 年，生理光学先驱赫尔曼·冯·亥姆霍兹（Hermann von Helmholtz）就在《生理光学手册》中记录了这一感知现象：
**视网膜上的感光细胞受强光刺激后，兴奋会扩散到相邻的暗区细胞，导致亮区在视觉上向外膨胀**。

```
浅色模式 (黑字白底):
字体黑色吸收光线，周围白底发光挤压黑色边缘 -> 笔画显得紧凑、清晰、偏细。

暗色模式 (白字黑底):
白色笔画发光向外扩散，浸润周围暗黑背景 -> 同样字重的笔画看起来比黑字白底时更粗（粗多少随亮度、对比度和字号而变，没有固定的百分比）。
```

这也是为什么同一个 `font-weight: 500` 的按钮，在暗色模式下常常显得“笨重”、“傻粗”和排版粗糙。

### 13.2 字重梯度的双主题校准

为了在深浅两种模式下获得更一致的粗细感知，TuffEx 利用可变字体（Variable Fonts）的无级调节能力，在暗色主题里把三档强调字重各调轻 40：`--tx-font-weight-medium` 从 `500` 变为 `460`，`--tx-font-weight-semibold` 从 `600` 变为 `560`，`--tx-font-weight-bold` 从 `700` 变为 `660`。组件的强调文字、标题与数值以 `var(--tx-font-weight-medium, 500)` 这样的写法读取它们，切到暗色主题就随之变轻；正文的 `400` 不动。

```scss
// packages/tuffex/packages/components/style/variables.scss
[data-theme='dark'],
.dark {
  --tx-font-weight-medium: #{mixins.tx-dark-weight(500, 460)};
  --tx-font-weight-semibold: #{mixins.tx-dark-weight(600, 560)};
  --tx-font-weight-bold: #{mixins.tx-dark-weight(700, 660)};
}
```

| 文字角色 | 字重变量 | 浅色模式（Light）标准 | 暗色模式（Dark）补偿 | 视觉校准目标 |
|---|---|---|---|---|
| **正文默认** | 无 | `400`（Regular） | `400` | 保持 Regular：再低，静态字体就会落到 Light 字面（见 13.3） |
| **微强调** | `--tx-font-weight-medium` | `500`（Medium） | `460` | 柔和微强调，不糊成团 |
| **小标题/按钮** | `--tx-font-weight-semibold` | `600`（Semi-Bold） | `560` | 清晰挺拔，笔画内腔不闭合 |
| **大标题/加粗/数值** | `--tx-font-weight-bold` | `700`（Bold） | `660` | 保持稳固骨架，粗体与数字不在暗底上发胖 |

这些中间值只在字体带字重轴时画得更细：可变字体（如 San Francisco、Segoe UI Variable、Inter Variable）按 `460` 原样绘制；静态字体按 13.3 的规则回到浅色模式的同一个字面。

### 13.3 离散字体回退的安全防线

**严肃工程陷阱**：在 CSS 中写下 `font-weight: 460`，只有当字体带字重轴（如 macOS 经 `-apple-system` / `system-ui` 得到的 San Francisco、Windows 的 Segoe UI Variable、`Inter Variable`）时才会真正画出 460。静态字体只有几个固定字面（PingFang SC、Microsoft YaHei、部分 Linux 发行版的思源黑体静态分包都是），CSS 字体匹配会把中间值归到其中一个：
* 目标在 `400`～`500` 之间：先向上找，最多找到 `500`；再向下找；最后才找 `500` 以上；
* 目标高于 `500`：先向上找，再向下找；
* 目标低于 `400`：先向下找，再向上找。

所以静态字体把 `460` 画成 `500` 的字面、`560` 画成 `600` 的字面、`660` 画成 `700` 的字面（缺这个字面时按同样的顺序找下一个），与浅色模式落在同一个字面：补偿不生效，但也不会变粗。

TuffEx 的防异化工程解法，是把每个暗色值都卡在（浅色值 − 100，浅色值］之内。Sass 函数 `tx-dark-weight($light, $dark)` 在构建时检查，越界或试图下调 `400` 都直接报错：

```scss
// packages/tuffex/packages/components/style/mixins.scss
@function tx-dark-weight($light, $dark) {
  @if $light <= 400 and $dark != $light {
    @error 'tx-dark-weight: #{$light} cannot go lighter; #{$dark} falls to a static font\'s Light face.';
  }
  @if $dark > $light or $dark <= $light - 100 {
    @error 'tx-dark-weight: #{$dark} is outside (#{$light - 100}, #{$light}]; a static font would draw it with another face than #{$light}.';
  }
  @return $dark;
}
```

**陷阱在这个区间之外**：
* 正文写成 `390`：目标低于 `400`，静态字体先向下找，画成 Light，整整细了一档。在 macOS 的 Chromium 里实测，字体名写 `PingFang SC` 时，`380`、`390` 都画成 `PingFangSC-Light`；经 `system-ui` 回退到的中文字体却把 `390` 画成 Regular。同一个数值随字体栈的写法而变，所以 TuffEx 不下调正文，表里原先建议的正文 `380`～`400` 也就不再采用。
* 把 `500` 降到 `400`：浅色是 Medium，暗色成了 Regular，静态字体上同样跳了一整档。

静态字体环境下补偿不了字重，就维持 `400/500/600` 阶梯，改由降低文字颜色对比度（使用 `--tx-text-color-regular` 替代纯白）来抵消光渗膨胀。`@supports (font-variation-settings: "wght" 460)` 只能说明浏览器认这个属性，判断不了当前字体有没有字重轴，不能拿来做这道门。

默认字体栈下要先量：TuffEx 的 `--tx-font-family` 是 `"Inter", "PingFang SC", "Microsoft YaHei", …`。在没装 Inter 的 macOS 上，中英文都由 PingFang SC 绘制，实测 `460`、`560`、`660` 分别画成 Medium、Semibold、Semibold，与 `500`、`600`、`700` 完全相同（PingFang SC 没有 Bold 字面，`700` 也画成 Semibold），所以默认字体栈下看不出暗色微调。macOS 上绘制中文的 PingFang 没有字重轴，直接点名或经 `system-ui` 回退都一样；只有带字重轴的拉丁字体会真正变细，比如宿主把 `--tx-font-family` 换成以 `system-ui` 开头的字体栈，英文就由可变的 San Francisco 绘制，`460` 落在 `400` 与 `500` 之间。

---

## 第 14 章：双极性语义着色与 `color-mix` 墨水融合

### 14.1 传统暗色色相崩塌的根源

许多传统 UI 库在浅色模式下定义了柔和语义色（如危险红的淡背景 `-light-9` 为 `#fef0f0`）。在暗色模式下，如果机械地按比例加白，该背景会变成一块刺眼的白斑；而如果机械按比例压黑，又会变成毫无活力的脏褐色。

### 14.2 TuffEx 的墨水融合方程式

TuffEx 在 2026-09-24 确立了语义墨水与背景的数学融合规则：
**彩色文本墨水绝不使用孤立的原生纯色相，而是将该色相与环境主墨水（Primary Ink）在 sRGB 空间进行严格混色**：

```scss
// TxModeChip 的墨水：色相按占比混进主文字色
--tx-mode-chip-ink: color-mix(
  in srgb,
  var(--tx-color-danger, #f56c6c) 55%, // is-danger
  var(--tx-text-color-primary, #303133)
);
// is-success：var(--tx-color-success, #67c23a) 45%
// is-warning：var(--tx-color-warning, #e6a23c) 45%
// is-info：   var(--tx-color-primary, #409eff) 50%
```

占比按色相分开定：危险 55%，成功与警告 45%，信息 50%。信息色取主色 `--tx-color-primary`，因为 `--tx-color-info` 是灰色，看起来会像 muted 弱化态。

#### 实测对比度守恒表（13px 文本）

| 语义色 | 纯色相在 `-light-9` 背景上的对比度 | `color-mix` 优化后的实测对比度 | 达标判定（WCAG 4.5:1） |
|---|---|---|---|
| **Danger (危险)** | 2.61:1（严重违规，看不清） | **5.07:1** | **PASS（清晰易读）** |
| **Success (成功)** | 2.08:1（惨白不可读） | **5.18:1** | **PASS（清晰易读）** |
| **Warning (警告)** | 2.03:1（黄褐色脏斑） | **5.11:1** | **PASS（清晰易读）** |
| **Info / Primary** | 2.53:1（发灰） | **5.32:1** | **PASS（清晰易读）** |

---

## 第 15 章：加色与减色混合：深浅主题的光学裂变

### 15.1 为什么加色光发（Plus-lighter）在浅色模式是灾难？

在暗色模式下，多个发光光束（如 `TxPrismGlow` 棱镜光效、AI 响应光芒）通过加色模式叠加：
$$\text{Color}_{\text{Result}} = \min(1, \text{Color}_A + \text{Color}_B)$$
光线叠加趋近于纯白高亮，呈现出如同霓虹灯在夜色中交汇的梦幻通透感。

**然而在浅色模式（白底）下：**
白色画布的 RGB 已经接近 `(1, 1, 1)`。加色模式不仅无法加出更亮的高光，两个色相相差大于 120° 的半透明层（例如蓝色与黄色）在浅色底板上平均后，会直接坍塌成**肮脏的暗灰色污渍**！

### 15.2 两套色相顺序（Dual Hue Ordering）

浅色模式下，一起出发、会互相重叠的光束，色相差不超过 120°；相距超过 120° 的两种色相（如蓝与黄、紫与黄）不安排在同一组出发。

`TxPrismGlow` 的六束光在深浅两面用的是同一组色相，浅色面只是换了顺序。`cones.ts` 给每束光写了暗色面的 `hue` 和浅色面的 `lightHue`（oklch 角度），浅色面把 2 号的黄与 4 号的紫对调：

```ts
// packages/tuffex/packages/components/src/prism-glow/src/cones.ts（只列色相）
export const PRISM_GLOW_CONES = [
  { hue: 350, lightHue: 350 },
  { hue: 95, lightHue: 300 }, // 2 号：暗色面黄，浅色面紫
  { hue: 205, lightHue: 205 },
  { hue: 300, lightHue: 95 }, // 4 号：暗色面紫，浅色面黄
  { hue: 150, lightHue: 150 },
  { hue: 258, lightHue: 258 },
]
```

哪些光束一起出发由相位决定：2 号与 6 号在开场的 0.4 × duration 里同行（默认 6 秒时是 2.4 秒，正好一次 CoreBox 搜索），3、4、5 号从右侧一起出发。暗色顺序里同行的 2 号与 6 号是黄与蓝，相差 163°；换成浅色顺序，2 号是紫，与 6 号的蓝只差 42°。暗色面的重叠用 `plus-lighter` 相加趋白，任何色相都能融合；浅色面用 `normal` 混合，重叠处是两种颜色的平均。跟随主色的 accent 调色板总共只跨 100°，不需要浅色顺序。

`prism-glow.test.ts` 的门禁按这条准则计算：开场这段时间里，浅色色相相差超过 120° 的任意两束光，中心始终相隔至少 30cqw，光晕碰不上。同一条测试也断言暗色顺序会撞上（蓝追上黄），作为阳性对照。开场之后各束光周期不同，仍会互相追上，门禁只管开场。

---

## 第 16 章：无障碍对比度工程：WCAG APCA 与 4.5:1 铁律

### 16.1 13px 正文严禁使用 `secondary` 墨水

很多设计人员喜欢大面积使用副文本颜色（`--tx-text-color-secondary`）来追求界面的“灰调高级感”。
在标准测量下：
* `--tx-text-color-secondary` 在白底上的对比度仅为 **3.08:1**！
* 在浅灰底板上的对比度甚至暴跌至 **2.87:1**！

**TuffEx 强制规范**：
* 凡是需要用户阅读、识别的正文内容、列表文本、表单标签，**必须使用 `--tx-text-color-regular`（实测 5.69:1）或 `--tx-text-color-primary`**。
* `secondary` 仅允许用于非必要辅助说明（如最后同步时间、极淡占位符）或纯图标（图标仅要求 3:1）。

### 16.2 禁止单纯依靠颜色传递状态

色盲与色弱群体（如红绿色盲）在全球男性中占比超过 8%。
**铁律：所有语义状态（成功、危险、加载中、离线）必须遵循“色相 + 图标形态 + 文字标签”的三重互锁**。

```html
<!-- 错误写法：单纯依靠红点传达离线，红绿色盲用户完全无法识别 -->
<span class="status-dot red"></span>

<!-- 正确写法：图标几何形态不同，并配合无障碍属性与文字 -->
<span class="tx-badge tx-badge--danger" role="status" aria-label="服务离线">
  <TxIconCross aria-hidden="true" />
  <span>服务已中断</span>
</span>
```

---

## 第 17 章：高对比度模式与系统级偏好响应

### 17.1 组件样式里不写十六进制颜色

TuffEx 组件的样式表不直接写十六进制颜色，CI 里的 `audit:colors`（`packages/tuffex/scripts/audit-color-literals.mjs`）负责拦截。深色与高对比调色板只重定义 `--tx-*` 令牌；写死的 `#fff` 不归它们管，到了高对比深色面板上照样是白色。

门禁只在三处放行十六进制：
* `var()` 的兜底值，如 `var(--tx-color-on-primary, #fff)`，只在令牌缺失时读取；
* 自定义属性的定义，如 `--tx-bui-violet: #6b3fd4`，它本身就是令牌；
* `mask` / `mask-image`，只用到透明度，色相不会画出来。

Sass 变量和 mixin 参数里的十六进制同样拦截，它们在编译期就定死了，任何调色板都改不到。扫描范围是 `packages/components/{src,style}` 下 `.vue` 的 `<style>` 块与 `.scss` / `.css`，不含测试。模板和脚本里的十六进制（SVG 数据、图表色板、取色器预设）是内容，不是样式，不在范围内；`rgb()` / `rgba()` 也不在范围内，组件样式里还有几十处，多数是阴影。

### 17.2 两套高对比调色板

`html.contrast`、`html[data-tx-contrast='high']` 或系统的 `prefers-contrast: more` 会启用高对比调色板，深色主题下换成深色那套；`html[data-tx-contrast='normal']` 可以不跟随系统偏好。

| 令牌 | 浅色（`tx-high-contrast-light`） | 深色（`tx-high-contrast-dark`） |
|---|---|---|
| 背景 `--tx-bg-color` | `#ffffff` | `#05070d` |
| 正文 `--tx-text-color-primary` | `#111827`，17.74:1 | `#ffffff`，20.14:1 |
| 边框 `--tx-border-color` | `#6b7280`，4.83:1 | `#94a3b8`，7.86:1 |
| 主色 `--tx-color-primary` | `#005fcc`，5.98:1 | `#7cc4ff`，10.74:1 |
| 主色填充上的文字 `--tx-color-on-primary` | `#ffffff`，5.98:1 | `#0a2540`，8.28:1 |

对比度按 WCAG 2 相对亮度计算：前四行对同一模式的背景，最后一行对主色。深色那套的主色很亮，白字放上去只有 1.88:1，所以填充上的文字换成深蓝。

材质也一并换掉：面板画不透明底色，不模糊、不折射，也没有边缘高光；遮罩保留压暗，去掉磨砂；盖在内容上的层（加载遮罩、图片上的删除按钮）变成不透明；流光、扫光与渐变模糊这类装饰直接隐藏。可见焦点在同一组条件下改用 `--tx-focus-ring-color` 描边，外加一圈 4px 的主色光晕。逐个组件的变化见 Nexus 文档《主题定制》的「材质」一节，规则写在 `style/mixins.scss` 的 `tx-when-high-contrast` 里。

AI 套件的 `--tx-bui-*` 没有高对比色阶，在高对比模式下保持原样。
