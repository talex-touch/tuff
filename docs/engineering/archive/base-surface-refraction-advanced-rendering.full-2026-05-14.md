# BaseSurface Refraction 高级混色与模糊着色技术文档

本文档面向 `talex-touch` 项目内需要进行材质渲染调优（尤其是 refraction）的工程师，重点说明 `TxBaseSurface` / `TxGlassSurface` 的实现原理、参数模型、混色机制、动态恢复策略与落地调参方法。

## 1. 目标与问题背景

在现代 UI 中，玻璃质感通常依赖 `backdrop-filter`。但在 Chromium 生态里，元素发生 `transform` 动画时，`backdrop-filter` 有高概率失效或出现视觉抖动。项目中的 `TxBaseSurface` 不是简单“一个 blur 背景层”，而是一个具备以下能力的材质调度器：

- 五种模式统一抽象：`pure` / `mask` / `blur` / `glass` / `refraction`
- 分层渲染：glass（折射）+ filter（模糊）+ mask（高光/遮罩）
- 运动期自动降级与恢复（避免 blur 失效）
- 通过 profile/tone 将“可感知质感”映射到底层复杂参数

核心入口：

- `packages/tuffex/packages/components/src/base-surface/src/TxBaseSurface.vue`
- `packages/tuffex/packages/components/src/base-surface/src/style/index.scss`
- `packages/tuffex/packages/components/src/glass-surface/src/TxGlassSurface.vue`

---

## 2. 整体渲染架构

### 2.1 三层材质栈

`TxBaseSurface` 的视觉结果来自三层叠加：

1. **Glass Layer**（`TxGlassSurface`）
   - 负责折射位移（displacement）与通道分离（chromatic aberration）
2. **Filter Layer**（CSS `backdrop-filter`）
   - 负责 blur/saturate/contrast/brightness 的后处理
3. **Mask Layer**（渐变高光/罩染）
   - 负责“体积光感”和边缘光泽

内容层（slot）始终位于最上层，保证交互一致性。

### 2.2 模式切换逻辑

`activeMode` 是实际渲染模式，不一定等于用户传入 `mode`：

- `mode=refraction` 且运动中：会暂时切 `fallbackMode`（默认 `mask`）
- `mode=blur/glass` 且运动中：同样走降级逻辑
- 运动结束后：通过恢复曲线回到目标模式

这使得组件既保留高质感，也能在动画/拖拽场景保持稳定。

---

## 3. Refraction 的“高级混色”原理

### 3.1 参数语义分层

Refraction 相关参数可分三类：

1. **几何位移参数**
   - `displace`
   - `distortionScale`
   - `xChannel` / `yChannel`
2. **光谱分离参数（高级混色核心）**
   - `redOffset` / `greenOffset` / `blueOffset`
3. **感知参数（抽象层）**
   - `refractionStrength`（0-100）
   - `refractionProfile`（`soft` / `filmic` / `cinematic`）
   - `refractionTone`（`mist` / `balanced` / `vivid`）
   - `refractionAngle`

项目的关键设计是：把“感知参数”映射为一组底层可控参数，减少业务侧直接调底层矩阵的成本。

### 3.2 Filmic strength 映射

`refractionStrength` 并非线性使用，而是经过：

- clamp 到 `[0, 100]`
- 归一化到 `[0, 1]`
- `smoothstep` + profile-specific 曲线（指数）

效果是：

- 低强度段更细腻（避免轻微参数变化导致突变）
- 高强度段保留冲击力（尤其 `cinematic`）

### 3.3 角度驱动的三通道偏移

`refractionAngle` 先归一化到 `[-180, 180)`，再转为弧度，作为主方向。随后通过 profile 定义的角偏移规则生成：

- 红通道偏移：主方向余弦分量
- 绿通道偏移：主方向 + 偏转角
- 蓝通道偏移：主方向 - 偏转角

这本质上是在做“近似色散模型”：

- R/G/B 拿到不同 scale 与 phase
- 在视觉上得到边缘微彩、方向性流光

### 3.4 Tone 模型与遮罩混色

`refractionTone` 不直接改色值，而是驱动“权重系统”：

- `filterPrimaryTint` / `SecondaryTint` / `VeilTint` / `BaseTint`
- `maskPrimaryTint` / `maskSecondaryTint` / `maskVeilTint`
- `haloOpacityGain` / `streakTint`

这些值会被写入 CSS 变量，再在 `index.scss` 中通过 `color-mix(in srgb, ...)` 与多重 gradient 合成。

**结论**：项目不是单点“改 blur 数值”，而是通过 tone/profile 构建了一个可调的“感知着色器参数面板”。

---

## 4. Blur 与着色层（Filter Layer）机制

### 4.1 基础 blur 管线

Filter 层使用：

- `blur(var(--tx-surface-filter-blur))`
- `saturate(...)`
- `contrast(...)`
- `brightness(...)`

并同时设置 `-webkit-backdrop-filter`。

### 4.2 Refraction 模式下的 filter 增强

在 `preset=card + refraction` 下，filter 背景不是单色，而是多层 radial-gradient + base tint：

- 主高光区（primary）
- 对向补光区（secondary）
- 轻雾层（veil）
- 基底染色（base）

再叠加动态对比度公式：

`contrast = baseContrast * (contrastBase + strength * contrastGain)`

对应到视觉就是：强折射时更“通透”、更“硬朗”；弱折射时更“柔和”。

---

## 5. Glass Surface（SVG 滤镜）实现细节

`TxGlassSurface` 使用 SVG filter 管线：

1. 生成 displacement map（data URL SVG）
2. `feImage` 载入 map
3. 三次 `feDisplacementMap` 分别处理 R/G/B
4. 各自 `feColorMatrix` 提取单色通道
5. `feBlend(screen)` 合成
6. `feGaussianBlur` 做最终平滑

同时根据环境能力分级：

- 支持 SVG backdrop-filter：走完整折射
- 不支持 SVG 但支持普通 backdrop-filter：降为 blur+saturate+brightness
- 都不支持：降为半透明背景 + 细边框

这保证了跨浏览器可用性与视觉可接受下限。

---

## 6. 运动降级与平滑恢复（核心稳定性机制）

### 6.1 为什么要降级

`blur` / `glass` / `refraction` 在 transform 动画时可能失效，导致“瞬间透明、闪烁、锯齿边缘”。

### 6.2 触发方式

- 手动：`moving` prop
- 自动：`autoDetect`（监听 `transitionstart/end` + style mutation）

### 6.3 恢复曲线设计

Refraction 恢复不是一步切回，而是两段式：

1. 快速拉起（`REFRACTION_QUICK_PULL_MS`）
   - 先把 mask opacity 快速拉到峰值，掩盖底层重建痕迹
2. 渐进释放
   - 随参数进度 `refractionParamProgress`，逐步回落到目标 opacity

配合 `easeOutCubic/easeOutQuad`，恢复观感明显优于“直接切换”。

---

## 7. 与 TxCard / BaseAnchor 的工程落地关系

### 7.1 TxCard 的职责边界

`TxCard` 是“业务容器 + 交互封装层”，将 `TxBaseSurface` 作为背景材质引擎：

- 支持 `background='refraction'`
- 提供鼠标跟随光点（`refractionLightFollowMouse`）
- 提供弹簧参数（stiffness/damping）
- 可在 inertia 状态同步 `surfaceMoving`

建议：

- **业务页面优先 `TxCard`**（语义与交互更完整）
- **材质实验优先 `TxBaseSurface`**（参数矩阵更底层）

### 7.2 BaseAnchor 的复用

`BaseAnchor` 的 panel card props 已透传 refraction 参数组，说明该材质体系不仅用于卡片，也服务于弹层类组件（popover/dropdown 等）。

---

## 8. 调参指南（实践）

### 8.1 profile 选型

- `soft`：低冲击、雾化、偏 UI 背景层
- `filmic`：均衡，默认推荐
- `cinematic`：高对比、高色散，适合品牌化展示区

### 8.2 tone 选型

- `mist`：柔和、雾面、抗噪
- `balanced`：中性
- `vivid`：通透、亮面、细节突出

### 8.3 推荐起步参数（卡片场景）

- `mode='refraction'`
- `preset='card'`
- `refractionProfile='filmic'`
- `refractionTone='vivid'`
- `refractionStrength=60~72`
- `refractionAngle=-28~-16`
- `blur=18~26`
- `overlayOpacity=0.12~0.22`

### 8.4 性能优先策略

- 连续 transform 动画场景：开启 `moving` 或 `autoDetect`
- 低端设备：
  - 降低 `blur`
  - 降低 `refractionStrength`
  - 减少 overlay opacity
- 大列表中谨慎叠加多个 refraction 卡片

---

## 9. 已识别实现注意点

1. `fallbackMaskOpacity` 已在类型定义中存在，但当前 `TxBaseSurface` 逻辑未消费该值（仍以 `opacity` 或 refraction 恢复逻辑为主），若要严格对齐 API 语义，建议后续补齐。
2. `refractionRenderer` 当前 class 已注入，但现有样式主要围绕默认路径（SVG）实现；若要完整支持 `css` renderer，需补独立渲染分支与验收标准。

---

## 10. 验证建议

推荐使用以下演示进行对照验证：

- `BaseSurfaceAdvancedDemo.vue`：参数实验台
- `BaseSurfaceFallbackDemo.vue`：多模式运动降级
- `BaseSurfaceMotionCompareDemo.vue`：原生 vs BaseSurface 对比

重点观察：

- 运动期 blur 是否稳定
- 恢复时是否有突变
- tone/profile 切换时的主观材质一致性
- 深浅色主题下的可读性

---

## 11. 总结

本项目的 refraction 并非单一滤镜技巧，而是一个由“感知参数 -> 几何/混色参数 -> CSS/SVG 双层渲染 -> 运动保护策略”构成的材质系统。其价值在于：

- 业务侧参数可理解（profile/tone/strength）
- 渲染侧结果稳定（分层 + 降级 + 平滑恢复）
- 可在 `TxCard` / `BaseAnchor` 等组件中复用

如果后续要继续提升，可优先考虑：

1. 补齐 `fallbackMaskOpacity` 的真实消费路径。
2. 完善 `refractionRenderer='css'` 的并行实现与能力矩阵。
3. 为 profile/tone 建立视觉基线快照（自动化回归）。
