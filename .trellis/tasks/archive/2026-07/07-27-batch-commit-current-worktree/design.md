# Design — 分批提交当前工作区改动

## Grouping Strategy

以运行时依赖和可回滚边界为准，预期提交顺序如下；审计若发现交叉依赖，可在不改变目标的前提下合并相邻组：

1. 工作区依赖 catalog 元数据。
2. CoreApp 安全与系统交互修复。
3. 插件 Prelude 隔离、typed capability、资源协议、业务适配器及官方 Emoji 迁移。
4. Nexus 全局搜索 overlay 层级与回归测试。
5. Nexus 商店、登录、落地页和 SDK 图标展示修复。
6. Trellis 任务研究与执行证据。

每批只通过 `git add -- <paths...>` 暂存。提交前以 `git diff --cached --name-status` 和 `git diff --cached --stat` 复核边界；提交后立即确认剩余工作区与预期一致。

## Validation Strategy

- 先跑全局 whitespace/冲突检查。
- CoreApp 组运行相关 Vitest、Node/Web typecheck、插件 validation；Prelude 组额外运行生产 build 和 Electron smoke。
- Nexus 组运行新增 overlay 单测及 Nexus typecheck/build 可用的最小质量门。
- 全部提交后复跑 `git diff --check`、检查干净工作区并与远端比较。

## Push Strategy

先 `git fetch origin master` 检查无远端分叉；仅在本地历史为远端快进后执行 `git push origin master`。推送后读取远端引用并要求其等于本地 `HEAD`。
