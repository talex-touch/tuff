# Update Prompt Dialog - 组件文档

## 概述

已实现的更新提示对话框组件，用于通知用户可用更新并提供更新选项。

## 组件功能

- [x] 检测可用更新
- [x] 显示更新信息 (版本号、发布说明)
- [x] 提供更新选项 (立即更新、稍后提醒)
- [x] 显示下载进度
- [x] 错误处理

## 组件位置

- **文件**: `src/renderer/src/components/download/UpdatePromptDialog.vue`
- **主要组件**: 更新提示对话框

## API 接口

- `showUpdateDialog`: 显示更新对话框
- `handleUpdate`: 处理更新操作
- `handlePostpone`: 处理推迟更新

## 当前状态

- [x] 基础对话框功能
- [x] 更新信息展示
- [x] 下载进度显示
- [x] 错误处理机制