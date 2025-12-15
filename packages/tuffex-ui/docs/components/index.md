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

## 布局组件

- **[TxGroupBlock 分组块](./group-block.md)** - 可折叠分组容器
- **[TxBlockLine 块行](./group-block.md#blockline-块行)** - 简单行项目显示
- **[TxBlockSlot 块插槽](./group-block.md#blockslot-块插槽)** - 带自定义插槽的块
- **[TxBlockSwitch 块开关](./group-block.md#blockswitch-块开关)** - 带集成开关的块

## 反馈组件

- **[TxProgress 进度](./progress.md)** - 进度展示组件
- **[TxProgressBar 进度条](./progress-bar.md)** - 多功能进度条，支持多种状态

## 覆盖层组件

- **[TxDrawer 抽屉](./drawer.md)** - 滑出面板组件
- **[TxBottomDialog 底部对话框](./dialog.md)** - 底部定位对话框
- **[TxBlowDialog 爆炸对话框](./dialog.md#blowdialog-爆炸对话框)** - 带爆炸动画的居中对话框

## 快速开始

```bash
npm install @talex-touch/tuff-ui
```

```vue
<template>
  <TxButton type="primary">你好 TuffEx UI</TxButton>
  <TxTag label="新" color="var(--el-color-success)" />
  <TxStatusBadge text="活跃" status="success" />
</template>

<script setup>
import { TxButton, TxTag, TxStatusBadge } from '@talex-touch/tuff-ui'
</script>
```
