---
title: Tuffex 组件
description: 塔芙组件库的组件展示中心
---

# Tuffex 组件

> 塔芙组件中心：触感、透明材质、克制的高级动效。

## 组件预览
<TuffDemo title="Component Lineup" description="关键控件一眼看全。">
  <template #preview>
    <div class="tuff-demo-row">
      <TxButton size="sm">Action</TxButton>
      <TuffSwitch :model-value="true" />
      <TxStatusBadge text="在线" status="success" />
      <TxTag label="专注" />
      <TxProgressBar :percentage="62" style="width: 140px;" />
    </div>
  </template>
</TuffDemo>

## 快速入口
- **[Button 按钮](./button.zh.md)** — 触感按钮与组合按钮。
- **[Icon 图标](./icon.zh.md)** — 统一图标体系与视觉密度控制。
- **[Input 输入](./input.zh.md)** — 更轻的输入框与搜索态。
- **[Dialog 弹窗](./dialog.zh.md)** — 交互闭环与确认场景。
- **[Switch 开关](./switch.zh.md)** — 轻触反馈与状态切换。
- **[Avatar 头像](./avatar.zh.md)** — 识别度与尺寸体系。
- **[Tooltip 提示](./tooltip.zh.md)** — 轻量提示与信息层级。
- **[Toast 提示](./toast.zh.md)** — 快速反馈与短暂状态。
- **[Grid 栅格](./grid.zh.md)** — 结构化布局与对齐。
- **[Progress 进度](./progress.zh.md)** — 线性进度与状态反馈。
- **[ProgressBar 进度条](./progress-bar.zh.md)** — 多状态进度条与加载反馈。
- **[StatusBadge 徽标](./status-badge.zh.md)** — 状态标识与系统反馈。
- **[Tag 标签](./tag.zh.md)** — 分类与标记。
- **[Skeleton 骨架屏](./skeleton.zh.md)** — 加载占位与结构提示。
- **[LayoutSkeleton 布局骨架](./layout-skeleton.zh.md)** — 布局级骨架占位。
- **[Drawer 抽屉](./drawer.zh.md)** — 侧滑面板与表单承载。

## 组件地图
| 分类 | 代表能力 | 迁移状态 |
|------|----------|----------|
| 基础 | Button / Icon / Avatar | 进行中 |
| 表单 | Input / Select / Switch | 进行中 |
| 反馈 | Dialog / Toast / Tooltip / ProgressBar | 规划中 |
| 布局 | Grid / Flex / LayoutSkeleton / Container | 规划中 |
| 状态 | Empty / Skeleton / Loading | 规划中 |

## 文档结构
每个组件页遵循统一结构，便于检索与维护：
1. **Overview** — 组件定位与设计语义  
2. **Usage** — 基础用法 + 交互 Demo  
3. **Variants** — 尺寸、状态、组合示例  
4. **API** — Props / Slots / Events  
5. **Design Notes** — 视觉与动效约束

## 设计支柱
- **Motion**：短促、可控、有收束感的动效。
- **Surface**：透明材质与层级关系优先。
- **Density**：在高信息密度下保持呼吸感。

<TuffPillars :items="[
  { title: 'Motion', summary: '短促、可控、有收束感的动效。', accent: '01' },
  { title: 'Surface', summary: '透明材质与层级关系优先。', accent: '02' },
  { title: 'Density', summary: '高密度下仍有节奏与呼吸感。', accent: '03' },
]" />

## Demo 约定
- Demo 示例优先可复制运行，避免仅截图。
- 有交互的 Demo 使用 `client-only` 包裹，避免 SSR 水合异常。
- Props/Slots/Events 以表格为主，补充必要的行为说明。

## 迁移节奏
- **Phase 1**：Button / Icon / Input（优先）  
- **Phase 2**：Dialog / Drawer / Toast（交互闭环）  
- **Phase 3**：Grid / Layout / Data（完善体系）

## 贡献与维护
组件文档统一落在 `apps/nexus/content/docs/dev/components/`，以 Nexus 为唯一来源，避免双维护。
