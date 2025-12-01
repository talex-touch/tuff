# Download Center API - 精简版

## 概述

已实现的统一下载管理中心，支持任务队列、进度跟踪和错误处理。

## 核心功能

- [x] 统一下载管理
- [x] 任务队列与优先级调度
- [x] 分块下载与断点续传
- [x] 进度跟踪与速度计算
- [x] SQLite数据库持久化
- [x] 错误日志与重试机制

## API 接口

### 主要 IPC 通道

- `download:start-task`: 开始下载任务
- `download:pause-task`: 暂停下载任务
- `download:resume-task`: 恢复下载任务
- `download:cancel-task`: 取消下载任务
- `download:get-tasks`: 获取任务列表
- `download:get-progress`: 获取任务进度
- `download:get-logs`: 获取错误日志
- `download:get-error-stats`: 获取错误统计

## 数据模型

- `DownloadTask`: 下载任务数据结构
- `DownloadProgress`: 下载进度数据结构
- `DownloadError`: 错误日志数据结构

## 当前状态

- [x] 核心下载功能已实现
- [x] 进度跟踪已实现
- [x] 错误处理已实现
- [x] 数据库持久化已实现