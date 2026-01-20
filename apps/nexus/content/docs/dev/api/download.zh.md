# Download SDK

<div style="height: 160px; border-radius: 16px; background: linear-gradient(135deg, #f59e0b, #ef4444);"></div>

## 概述

Download SDK 提供统一的下载任务管理能力，适用于应用更新、资源预取、插件安装等场景。

## 介绍

Download SDK 提供统一的下载任务管理能力，适用于应用更新、资源预取、插件安装等场景。

## 技术原理

- 下载任务由主进程 DownloadCenter 统一调度。
- 通过 TuffTransport 事件完成任务创建与状态推送。
- 支持队列、优先级、切片下载与重试。

## 如何实现的

- SDK 仅封装事件调用与订阅逻辑。
- 任务真实状态由主进程维护并广播。
- 生产环境可通过 `metadata.hidden` 控制隐藏任务展示。

## 如何使用

```typescript
import { useDownloadSdk } from '@talex-touch/utils/renderer'

const download = useDownloadSdk()
const res = await download.addTask({
  url: 'https://example.com/file.zip',
  destination: '/path/to/save',
  filename: 'file.zip',
  priority: 50,
  module: 'resource_download',
  metadata: { hidden: true }
})

if (!res.success) {
  throw new Error(res.error || 'Download failed')
}
```

## 常见例子

1. 预下载远程 SVG 到 tempfile，并通过 `tfile://` 引用。
2. 应用更新包下载后触发更新提示。

## 常见问题

**Q: 如何订阅进度？**  
A: 使用 `onTaskProgress` 监听推送事件即可。

**Q: 下载任务如何隐藏？**  
A: 传入 `metadata.hidden: true`，生产环境将不展示任务与通知。

## 最佳实践

- 为任务设置合理的 `priority` 与 `module`，便于调度与排查。
- 避免频繁创建大量任务，必要时进行合并或节流。
- 对失败任务做好错误提示与重试策略。
