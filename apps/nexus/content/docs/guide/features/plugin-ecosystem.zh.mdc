# 插件生态

## 设计理念
- 插件即胶囊（Capsule），每个模块拥有独立运行沙箱与 10MB 配置配额。
- Manifest 描述插件元数据、入口脚本与权限，开发者在 `pnpm utils:publish` 后即可分发。
- CoreBox 自动聚合插件指令，支持搜索、快捷命令与 workflow 调度。

## 插件类型
| 类型 | 说明 | 典型能力 |
| --- | --- | --- |
| 功能插件 | 内嵌 UI、事件或服务 | 任务收集、翻译、脚本执行 |
| Widget | 常驻工作区或通知中心 | 仪表盘、计时、快照 |
| Workflow 插件 | 仅暴露 API & Hook | 批处理、自动化串联 |

## 获取与管理
1. 打开 CoreBox，输入 `market` 进入插件市场。
2. 使用标签 / 评分 / 搜索过滤，选中插件后点击「添加」即可自动安装。
3. 所有插件可在「设置 - 插件」中统一查看版本、权限与运行状态。

## 安全性
- 插件运行于独立进程，通过 Channel API 与主程序通信。
- 请求敏感能力前须声明权限，系统提供权限面板与运行时提示。
- 资源超限时会被自动挂起，避免影响主进程。

## 推荐起步组合
- **核心效率**：Clipbox、Universal Search、Task Capsule。
- **研发场景**：Git Watcher、API Tester、Snippet Vault。
- **创意场景**：Color Studio、Asset Board、Storyboard。
