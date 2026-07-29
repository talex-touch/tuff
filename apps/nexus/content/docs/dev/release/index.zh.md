# 发布与下载

本节记录 Nexus 当前维护的发布/下载路由与桌面端 Download SDK。插件发布
由插件开发任务流说明，不再指向不存在的独立发布页。

## 发布路由

| 用途 | 路由 |
| --- | --- |
| Release 元数据 | `GET /api/releases/{tag}` |
| 按渠道获取最新版本 | `GET /api/releases/latest?channel={channel}` |
| 平台资产矩阵 | `GET /api/releases/{tag}/assets` |
| 平台下载 | `GET /api/releases/{tag}/download/{platform}/{arch}` |
| 平台签名 | `GET /api/releases/{tag}/signature/{platform}/{arch}` |

这些是服务端路由，不是 renderer Download SDK 的直接方法。CoreApp 更新服务
先解析 release 元数据，再通过 Download Center 调度下载。

## 相关文档

- [Download SDK](../api/download.zh.mdc)
- [插件开发与发布任务流](../getting-started/plugin-workflow.zh.mdc)
- [性能与持久化落地](./performance-persistence.zh.md)
- [仓库 Release Assets 核对清单](../../../../../../docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md)
- [English version](./index.en.md)
