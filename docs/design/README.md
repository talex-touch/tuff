# 设计文档（docs/design）

> 更新时间：2026-09-29
> 定位：产品/视觉/交互设计知识。本目录同时存放 `.pen` 设计稿与生成图等资产；本 README 仅索引 markdown 文档。


## 核心设计概念与工程哲学 (Concepts)

| 文档 | 主题 |
| --- | --- |
| [concepts/README.md](./concepts/README.md) | **Tuff & TuffEx 设计概念与工程哲学总览**（33 章节导航知识全景图） |
| [concepts/01-geometry-and-curvature.md](./concepts/01-geometry-and-curvature.md) | **第一篇：几何、曲率连续性与空间形态**（第 1～4 章：G2 连续、超椭圆 Squircle、同心圆角法则与 Z 轴深度拓扑） |
| [concepts/02-surfaces-and-materials.md](./concepts/02-surfaces-and-materials.md) | **第二篇：材质系统、折射着色器与环境自动感知**（第 5～11 章：8 种材质选型、Refraction 色散管线、autoDetect 动态感知降级、Alpha 噪点掩膜与光斑追踪） |
| [concepts/03-color-science-and-dark-mode.md](./concepts/03-color-science-and-dark-mode.md) | **第三篇：色彩科学、暗色模式与感知光学**（第 12～17 章：#141414 深灰哲学、暗色视网膜光晕字重补偿、color-mix 墨水融合与 WCAG 4.5:1） |
| [concepts/04-typography-and-text-engineering.md](./concepts/04-typography-and-text-engineering.md) | **第四篇：排版美学、字体工程与排版节奏**（第 18～22 章：13-14px 生产力基准、等宽 0.9em 调和、text-wrap: pretty/balance 软换行与零 Tracking 铁律） |
| [concepts/05-motion-and-micro-interactions.md](./concepts/05-motion-and-micro-interactions.md) | **第五篇：微动态、物理弹簧与交互节拍**（第 23～30 章：Sub-100ms 瞬时悬停、90ms+90ms 确认律动、合成器四金刚属性、物理弹簧阻尼与双 Keyframe 重放） |
| [concepts/06-ai-native-streaming-interfaces.md](./concepts/06-ai-native-streaming-interfaces.md) | **第六篇：AI 原生交互、流式节拍与防抖渲染**（第 31～33 章：useStreamPacer 节拍器、Reserve 双层防抖占位与零阻断阅读复制） |
## 命名

| 文档 | 主题 |
| --- | --- |
| [naming.md](./naming.md) | AI/MI/SI 阶梯里的 TI：`Tuff Intelligence` 现状、10 个候选、能力 id 前缀规则 |

## CoreBox / 桌面端

| 文档 | 主题 |
| --- | --- |
| [layout-atomization.md](./corebox/layout-atomization.md) | 布局原子化与动态布局系统 |
| [layout-customization.md](./corebox/layout-customization.md) | 布局选择、预览与原子编辑器（Settings → Styles） |
| [corebox-theme.md](./corebox/corebox-theme.md) | CoreBox 主题与自定义样式 |
| [user-custom-css.md](./corebox/user-custom-css.md) | 用户自定义 CSS 约定与安全限制 |
| [base-surface-refraction-rendering.md](./corebox/base-surface-refraction-rendering.md) | BaseSurface Refraction 渲染模块分析 |
| [corebox-vs-utools-gap.md](./corebox/corebox-vs-utools-gap.md) | CoreBox vs uTools 竞品差距分析（2026-06 调研） |

## Nexus / Web

| 文档 | 主题 |
| --- | --- |
| [exchange-rate-service.md](./nexus/exchange-rate-service.md) | Nexus 汇率服务（ExchangeRate-API）设计 |
| [exchange-rate-cache.md](./nexus/exchange-rate-cache.md) | Exchange Rate Cache 模块设计 |

> 来源说明：corebox 下前 5 篇与 nexus 下 2 篇迁移自旧 `.spec/` 知识库（2026-02 定稿，2026-07 迁入）；`corebox-vs-utools-gap.md` 提取自 `.doc.local/` 调研缓存。
