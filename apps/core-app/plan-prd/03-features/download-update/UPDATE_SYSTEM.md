# Update System - 精简版

## 概述

已实现的应用程序自动更新系统，支持GitHub Releases集成和SHA256校验。

## 核心功能

- [x] GitHub Releases 集成
- [x] 自动版本检测
- [x] SHA256 校验验证
- [x] 平台特定安装包处理
- [x] 更新进度跟踪
- [x] 错误处理和回退

## 实现状态

- [x] 更新检查机制
- [x] 下载更新包
- [x] 校验更新包
- [x] 安装更新
- [x] 更新进度显示
- [x] 错误处理

## API 接口

- `update:check`: 检查更新
- `update:download`: 下载更新
- `update:install`: 安装更新
- `update:get-status`: 获取更新状态
- `update:get-progress`: 获取更新进度