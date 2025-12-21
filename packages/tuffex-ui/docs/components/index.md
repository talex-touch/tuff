# 组件

TuffEx UI 提供了丰富的组件库，涵盖了现代 Web 应用开发的各种需求。

## 基础组件

- **[TxButton 按钮](./button.md)** - 触发操作的基础组件
- **[TxTag 标签](./tag.md)** - 多功能标签组件，支持自定义颜色
- **[TxStatusBadge 状态徽标](./status-badge.md)** - 带预定义色调的状态指示器

## 表单组件

- **[TxInput 输入框](./input.md)** - 表单输入组件
- **[TxSwitch 开关](./switch.md)** - 开关切换组件
- **[TxCheckbox 复选框](./checkbox.md)** - 复选框组件
- **[TxSelect 选择器](./select.md)** - 下拉选择组件
- **[TxSlider 滑块](./slider.md)** - 区间取值滑块

## 布局组件

- **[TxGroupBlock 分组块](./group-block.md)** - 分组容器与块项（BlockLine/BlockSlot/BlockSwitch）
- **[TxScroll 滚动](./scroll.md)** - 滚动容器（BetterScroll / 原生）
- **[TxGridLayout 网格布局](./grid-layout.md)** - 响应式网格与交互 hover
- **[TxLayoutSkeleton 布局骨架](./layout-skeleton.md)** - 通用布局骨架占位
- **[TxCardItem 卡片项](./card-item.md)** - 左侧头像/图标，右侧标题与描述，支持右侧操作区
- **[TxTabs 标签页](./tabs.md)** - 左侧导航 Tabs（Windows 风格）

## 反馈组件

- **[TxProgress 进度](./progress.md)** - 进度展示组件
- **[TxProgressBar 进度条](./progress-bar.md)** - 多功能进度条，支持多种状态
- **[TxSpinner 加载](./spinner.md)** - 旋转加载指示器
- **[TxLoadingOverlay 加载遮罩](./loading-overlay.md)** - 遮罩加载（容器/全屏）
- **[TxSkeleton 骨架屏](./skeleton.md)** - 加载占位骨架
- **[TxToast 提示](./toast.md)** - 轻量通知提示
- **[TxStatCard 指标卡片](./stat-card.md)** - 指标展示卡片

## 覆盖层组件

- **[TxDrawer 抽屉](./drawer.md)** - 滑出面板组件
- **[TxBottomDialog 底部对话框](./dialog.md)** - 底部定位对话框
- **[TxBlowDialog 爆炸对话框](./dialog.md#blowdialog-爆炸对话框)** - 带爆炸动画的居中对话框

## 视觉效果

- **[TxGlassSurface 玻璃拟态](./glass-surface.md)** - 玻璃拟态容器
- **[TxGradientBorder 渐变边框](./gradient-border.md)** - 动态渐变边框

## 快速开始

```bash
npm install @talex-touch/tuff-ui
```

```vue
<template>
  <TxButton type="primary">你好 TuffEx UI</TxButton>
  <TxTag label="新" color="var(--tx-color-success)" />
  <TxStatusBadge text="活跃" status="success" />
</template>

<script setup>
import { TxButton, TxTag, TxStatusBadge } from '@talex-touch/tuff-ui'
</script>
```
